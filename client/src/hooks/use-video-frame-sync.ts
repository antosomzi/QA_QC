import { useEffect, useRef, useCallback } from "react";

/**
 * Custom hook for robust video-frame synchronization using requestVideoFrameCallback
 * 
 * This hook provides frame-perfect synchronization between video playback and frame updates,
 * replacing fragile timing-based approaches with the native browser API.
 * 
 * Key features:
 * - Uses requestVideoFrameCallback for precise frame-level control
 * - Handles both playing and paused states correctly
 * - Provides smooth frame-by-frame navigation
 * - Avoids race conditions and timing issues
 * 
 * @param videoRef - Reference to the video element
 * @param fps - Frames per second of the video
 * @param onFrameChange - Callback when the frame changes
 * @param currentFrame - Current frame index from parent state
 */
export function useVideoFrameSync(
  videoRef: React.RefObject<HTMLVideoElement>,
  fps: number | undefined,
  onFrameChange: (frame: number) => void,
  currentFrame: number
) {
  const frameCallbackHandle = useRef<number | null>(null);
  const lastReportedFrame = useRef<number>(currentFrame);
  const isNavigating = useRef<boolean>(false);

  /**
   * Core frame update logic using requestVideoFrameCallback
   */
  const updateFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !fps) return;

    const currentTime = video.currentTime;
    const frame = Math.round(currentTime * fps);

    // Only update if frame actually changed AND video is not paused
    if (frame !== lastReportedFrame.current && !isNavigating.current && !video.paused) {
      lastReportedFrame.current = frame;
      onFrameChange(frame);
    }

    // Continue updating while video is playing (not paused or ended)
    if (!video.paused && !video.ended) {
      frameCallbackHandle.current = video.requestVideoFrameCallback(() => updateFrame());
    }
  }, [videoRef, fps, onFrameChange]);

  /**
   * Start frame tracking when video plays
   */
  const handlePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || !fps) return;

    if (frameCallbackHandle.current !== null) {
      video.cancelVideoFrameCallback(frameCallbackHandle.current);
    }

    frameCallbackHandle.current = video.requestVideoFrameCallback(() => updateFrame());
  }, [videoRef, fps, updateFrame]);

  /**
   * Handle pause - simple, just stop callback
   */
  const handlePause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (frameCallbackHandle.current !== null) {
      video.cancelVideoFrameCallback(frameCallbackHandle.current);
      frameCallbackHandle.current = null;
    }
  }, [videoRef]);

  /**
   * Navigate to a specific frame with precise positioning
   */
  const navigateToFrame = useCallback((targetFrame: number) => {
    const video = videoRef.current;
    if (!video || !fps) return;

    isNavigating.current = true;

    // Calculate target time (middle of frame for stability)
    const targetTime = (targetFrame + 0.5) / fps;

    // Pause video if playing
    if (!video.paused) {
      video.pause();
    }

    // Update video time
    video.currentTime = targetTime;

    // Update frame state immediately
    lastReportedFrame.current = targetFrame;
    onFrameChange(targetFrame);

    // Release navigation lock after seek completes
    const handleSeeked = () => {
      isNavigating.current = false;
      video.removeEventListener('seeked', handleSeeked);
    };
    video.addEventListener('seeked', handleSeeked);
  }, [videoRef, fps, onFrameChange]);

  /**
   * Synchronize with external frame changes (from BoundingBoxList, etc.)
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !fps || isNavigating.current) return;

    if (!video.paused) return;

    const targetTime = (currentFrame + 0.5) / fps;
    const currentTime = video.currentTime;
    const currentVideoFrame = Math.round(currentTime * fps);

    if (currentFrame !== currentVideoFrame) {
      video.currentTime = targetTime;
      lastReportedFrame.current = currentFrame;
    }
  }, [currentFrame, fps, videoRef]);

  /**
   * Set up event listeners
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    // Initial frame update
    if (video.paused && fps) {
      const frame = Math.round(video.currentTime * fps);
      if (frame !== lastReportedFrame.current) {
        lastReportedFrame.current = frame;
        onFrameChange(frame);
      }
    }

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);

      // Clean up frame callback
      if (frameCallbackHandle.current !== null) {
        video.cancelVideoFrameCallback(frameCallbackHandle.current);
      }
    };
  }, [videoRef, fps, handlePlay, handlePause, onFrameChange]);

  return {
    navigateToFrame,
  };
}
