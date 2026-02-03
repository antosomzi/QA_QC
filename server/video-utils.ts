import ffmpeg from 'fluent-ffmpeg';

export interface VideoMetadata {
  fps: number;
  duration: number;
  width: number;
  height: number;
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
export function getVideoMetadata(filePath: string): Promise<VideoMetadata> {
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
      };

      console.log(`[video-utils] Extracted metadata for ${filePath}:`, result);
      resolve(result);
    });
  });
}
