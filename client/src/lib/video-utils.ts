/**
 * Utility functions for video processing and frame calculations
 */

export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  const centiseconds = Math.floor((seconds % 1) * 100);
  
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

export function timeToFrame(timeInSeconds: number, fps: number): number {
  return Math.floor(timeInSeconds * fps);
}

export function frameToTime(frame: number, fps: number): number {
  return frame / fps;
}

export function formatTimestamp(timestampMs: number): string {
  const totalSeconds = timestampMs / 1000;
  return formatTime(totalSeconds);
}

export function getVideoMetadata(file: File): Promise<{
  duration: number;
  width: number;
  height: number;
  fps?: number;
}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    video.onloadedmetadata = () => {
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });
      URL.revokeObjectURL(video.src);
    };
    
    video.onerror = () => {
      reject(new Error('Failed to load video metadata'));
      URL.revokeObjectURL(video.src);
    };
    
    video.src = URL.createObjectURL(file);
  });
}

export function calculateCanvasCoordinates(
  event: MouseEvent,
  canvas: HTMLCanvasElement
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}
