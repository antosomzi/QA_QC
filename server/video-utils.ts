import ffmpeg from 'fluent-ffmpeg';
import { execFile } from 'child_process';

export interface VideoMetadata {
  fps: number;
  duration: number;
  width: number;
  height: number;
  ptsData: number[] | null; // Array of PTS (seconds) per frame — null if extraction fails
  isEffectivelyCfr: boolean | null; // true=CFR, false=VFR, null=unknown
}

async function detectEffectivelyCfrWithVfrdet(filePath: string): Promise<boolean | null> {
  return new Promise((resolve) => {
    const SAMPLE_SECONDS = 20;
    execFile(
      'ffmpeg',
      ['-i', filePath, '-t', String(SAMPLE_SECONDS), '-vf', 'vfrdet', '-an', '-f', 'null', '-'],
      { maxBuffer: 20 * 1024 * 1024, timeout: 30_000 },
      (err, _stdout, stderr) => {
        const output = stderr || '';
        const match = output.match(/VFR:([0-9]*\.?[0-9]+)/);

        if (!match) {
          console.warn(`[video-utils] vfrdet output did not contain VFR score for ${filePath}${err ? ` (${err.message})` : ''}`);
          resolve(null);
          return;
        }

        const vfrScore = parseFloat(match[1]);
        if (Number.isNaN(vfrScore)) {
          resolve(null);
          return;
        }

        // vfrdet score 0 means effectively CFR. Keep a tiny tolerance for floating noise.
        const isEffectivelyCfr = vfrScore <= 0.001;
        console.log(`[video-utils] vfrdet sample=${SAMPLE_SECONDS}s score=${vfrScore.toFixed(6)} => ${isEffectivelyCfr ? 'CFR' : 'VFR'}`);
        resolve(isEffectivelyCfr);
      },
    );
  });
}

/**
 * Parse a frame rate string like "30000/1001" or "30" into a number
 */
function parseFrameRate(frameRateStr: string | undefined): number | null {
  if (!frameRateStr) return null;
  
  const parts = frameRateStr.split('/').map(Number);
  if (parts.length === 2 && parts[1] > 0) {
    return parts[0] / parts[1];
  } else if (parts.length === 1 && !isNaN(parts[0])) {
    return parts[0];
  }
  return null;
}

/**
 * Check if FPS value is reasonable (between 1 and 120)
 */
function isReasonableFps(fps: number | null): fps is number {
  return fps !== null && fps >= 1 && fps <= 120;
}

/**
 * Extract video metadata using ffprobe
 * Returns precise FPS (e.g., 29.97, 29.99, 30.0) rather than rounded values
 */
export async function getVideoMetadata(filePath: string): Promise<VideoMetadata> {
  const isEffectivelyCfr = await detectEffectivelyCfrWithVfrdet(filePath);

  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(new Error(`Failed to probe video: ${err.message}`));
        return;
      }

      // Find the video stream
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (!videoStream) {
        reject(new Error('No video stream found in file'));
        return;
      }

      // Try multiple sources for FPS, preferring r_frame_rate
      // Some codecs report weird values, so we validate each one
      const rFps = parseFrameRate(videoStream.r_frame_rate);
      const avgFps = parseFrameRate(videoStream.avg_frame_rate);
      
      let fps = 30; // default fallback
      
      // Prefer r_frame_rate if it's reasonable
      if (isReasonableFps(rFps)) {
        fps = rFps;
      } else if (isReasonableFps(avgFps)) {
        fps = avgFps;
      } else {
        // If both are unreasonable, try to derive from duration and nb_frames
        const nbFrames = parseInt(videoStream.nb_frames || '0', 10);
        const duration = metadata.format.duration || 0;
        if (nbFrames > 0 && duration > 0) {
          const derivedFps = nbFrames / duration;
          if (isReasonableFps(derivedFps)) {
            fps = derivedFps;
          }
        }
        console.warn(`[video-utils] Unreasonable FPS values (r_frame_rate=${rFps}, avg_frame_rate=${avgFps}), using fallback: ${fps}`);
      }

      // CRITICAL: Never round FPS! We need maximum precision (Double Precision)
      // Standard framerates are NOT round numbers:
      // - 23.976 = 24000/1001 = 23.9760239760239...
      // - 29.97  = 30000/1001 = 29.9700299700299...
      // Rounding destroys sync precision over time (e.g., 4 seconds drift per hour at 23.976)

      const result: VideoMetadata = {
        fps,
        duration: metadata.format.duration || 0,
        width: videoStream.width || 0,
        height: videoStream.height || 0,
        ptsData: null, // Will be populated separately by extractPtsData
        isEffectivelyCfr,
      };

      console.log(`[video-utils] Extracted metadata for ${filePath}:`, result);
      resolve(result);
    });
  });
}

/**
 * Extract per-frame PTS (presentation timestamps) from a video file using ffprobe.
 * Returns a sorted array of PTS values in seconds, one per frame.
 * This is essential for VFR (Variable Frame Rate) videos where frame N
 * is NOT at time N/fps.
 */
export function extractPtsData(filePath: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    // Use ffprobe to dump all packet PTS for the video stream
    execFile('ffprobe', [
      '-v', 'quiet',
      '-select_streams', 'v:0',
      '-show_entries', 'packet=pts_time',
      '-of', 'csv=p=0',
      filePath
    ], { maxBuffer: 100 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        console.warn(`[video-utils] Failed to extract PTS data: ${err.message}`);
        reject(err);
        return;
      }

      const pts = stdout
        .trim()
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => parseFloat(line.trim()))
        .filter(v => !isNaN(v));

      // Sort PTS in case packets arrived out of order (B-frames)
      pts.sort((a, b) => a - b);

      console.log(`[video-utils] Extracted ${pts.length} PTS values for ${filePath} (first=${pts[0]?.toFixed(4)}, last=${pts[pts.length - 1]?.toFixed(4)})`);
      resolve(pts);
    });
  });
}

