import { useRef, useEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipBack, SkipForward, X } from "lucide-react";
import { getGPSForFrame } from "@/lib/gps-utils";
import { 
  getCanvasCoordinates, 
  mapCanvasPointToVideoPoint,
  findBoundingBoxAt, 
  formatTime, 
  calculateResizedBbox,
  getAnnotationColor,
  setCursorForHandle,
  calculateFrameFromTime,
  calculateTimeFromFrame,
  ptsDataBinarySearch,
  isValidBoundingBoxSize,
  createBoundingBoxData,
  drawBoundingBox,
  drawBoundingBoxHandles,
  drawTemporaryBoundingBox,
  hasSignificantChange
} from "./helpers/video-player-helpers";
import type { Video, GpsData, Annotation, BoundingBox } from "@shared/schema";

// Type for temporary bounding box during drawing
type DrawingBBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

interface VideoPlayerProps {
  video: Video;
  gpsData?: GpsData;
  ptsData?: number[];
  annotations: Annotation[];
  boundingBoxes: BoundingBox[];
  currentFrame: number;
  onFrameChange: (frame: number) => void;
  onAnnotationCreate: (
    annotationData: Pick<Annotation, 'folderId' | 'videoId' | 'signType' | 'gpsLat' | 'gpsLon'>,
    boundingBoxData: {
      frameIndex: number;
      frameTimestampMs: number;
      bboxX: number;
      bboxY: number;
      bboxWidth: number;
      bboxHeight: number;
    }
  ) => void;
  onBoundingBoxCreate: (
    annotationId: string,
    boundingBoxData: {
      frameIndex: number;
      frameTimestampMs: number;
      bboxX: number;
      bboxY: number;
      bboxWidth: number;
      bboxHeight: number;
    }
  ) => void;
  onAnnotationUpdate: (id: string, updates: Partial<Annotation>) => void;
  onBoundingBoxUpdate: (id: string, updates: Partial<BoundingBox>) => void;
  selectedAnnotationId?: string | null;
  onAnnotationSelect: (id: string | null) => void;
  onVideoDelete: () => void;
  folderId: string;
}

export interface VideoPlayerHandle {
  seekToFrame: (frame: number) => void;
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(({
  video,
  gpsData,
  ptsData,
  annotations,
  boundingBoxes,
  currentFrame,
  onFrameChange,
  onAnnotationCreate,
  onBoundingBoxCreate,
  onBoundingBoxUpdate,
  selectedAnnotationId,
  onAnnotationSelect,
  onVideoDelete,
  folderId,
}: VideoPlayerProps, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rvfcRef = useRef<number | null>(null); // For requestVideoFrameCallback loop

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentBBox, setCurrentBBox] = useState<DrawingBBox | null>(null);
  
  const [isResizing, setIsResizing] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [moveStart, setMoveStart] = useState<{ x: number; y: number } | null>(null);
  const [selectedBoundingBox, setSelectedBoundingBox] = useState<BoundingBox | null>(null);
  const [initialBoundingBox, setInitialBoundingBox] = useState<BoundingBox | null>(null);
  
  // State for progress bar dragging
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [previewTime, setPreviewTime] = useState<number | null>(null);
  const dragTimeoutRef = useRef<number | null>(null);

  // REF MIRROR: Always contains the freshest data for immediate access in rVFC loop
  // This avoids "stale closure" issues where the draw function reads old state
  const drawingDataRef = useRef({
    boundingBoxes,
    annotations,
    selectedAnnotationId,
    selectedBoundingBox,
    currentBBox,
    isMoving,
    isResizing
  });

  // PTS data ref for rVFC loop (avoids stale closure)
  const ptsDataRef = useRef(ptsData);

  // Keep the ref mirror synchronized with React state
  useEffect(() => {
    drawingDataRef.current = {
      boundingBoxes,
      annotations,
      selectedAnnotationId,
      selectedBoundingBox,
      currentBBox,
      isMoving,
      isResizing
    };
  }, [boundingBoxes, annotations, selectedAnnotationId, selectedBoundingBox, currentBBox, isMoving, isResizing]);

  // Keep PTS ref in sync
  useEffect(() => {
    ptsDataRef.current = ptsData;
  }, [ptsData]);

  // FPS is now extracted from video file at upload time using ffprobe
  // No frontend correction needed - we trust the database value
  const fps = video.fps || 30;

  // CRITICAL: Always read directly from video element, not React state
  // React state updates are async and can lag behind actual video position
  // Uses PTS binary search for VFR videos, falls back to Math.floor + epsilon for CFR
  const getActualFrame = useCallback(() => {
    if (!fps || !videoRef.current) return 0;
    return calculateFrameFromTime(videoRef.current.currentTime, fps, ptsData);
  }, [fps, ptsData]);

  const seekToFrame = useCallback((frame: number) => {
    if (!videoRef.current || !fps) return;
    const targetTime = calculateTimeFromFrame(frame, fps, ptsData);
    videoRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
    lastFrameRef.current = frame;
  }, [fps, ptsData]);

  useImperativeHandle(ref, () => ({ seekToFrame }), [seekToFrame]);

  // Memoize bounding boxes for current frame
  // Force re-calculation when currentTime changes to ensure sync
  const currentFrameBoundingBoxes = useMemo(() => {
    const actualFrame = getActualFrame();
    return boundingBoxes.filter(bbox => bbox.frameIndex === actualFrame);
  }, [boundingBoxes, getActualFrame, currentTime]); // Add currentTime to trigger updates

  // Track last frame to avoid redundant updates
  const lastFrameRef = useRef<number>(0);

  // Direct canvas draw function (bypasses React state for speed)
  // Reads from drawingDataRef for ZERO closure lag - no dependencies needed
  const drawCanvasForFrame = useCallback((frameIndex: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Read fresh data from ref (not from stale closure)
    const { 
      boundingBoxes: boxes, 
      annotations: annos, 
      selectedAnnotationId: selId,
      selectedBoundingBox: selBox,
      currentBBox: curBox,
      isMoving: moving,
      isResizing: resizing
    } = drawingDataRef.current;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Get bboxes for this frame directly
    const frameBboxes = boxes.filter(bbox => bbox.frameIndex === frameIndex);
    
    // Draw existing bounding boxes for current frame
    frameBboxes.forEach(bbox => {
      const annotation = annos.find(ann => ann.id === bbox.annotationId);
      if (!annotation) return;
      
      const bboxToRender = (selBox && bbox.id === selBox.id) ? selBox : bbox;
      const isSelected = annotation.id === selId;
      
      drawBoundingBox(ctx, bboxToRender, annotation, annos, isSelected);
    });
    
    // Draw current bounding box being drawn
    if (curBox) {
      drawTemporaryBoundingBox(ctx, curBox);
    }
    
    // Draw handles for selected annotation
    if (selId && !moving && !resizing) {
      const selectedBbox = frameBboxes.find(bbox => {
        const annotation = annos.find(ann => ann.id === bbox.annotationId);
        return annotation?.id === selId;
      });
      
      if (selectedBbox) {
        drawBoundingBoxHandles(ctx, selectedBbox);
      }
    }
  }, []); // EMPTY dependencies - reads from ref, not closure

  // High-precision synchronization using requestVideoFrameCallback
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !fps) return;

    // This function runs at every frame paint (60fps sync with video display)
    const updateFrameLoop = (now: number, metadata: VideoFrameCallbackMetadata) => {
      // metadata.mediaTime is the EXACT time of the frame displayed on screen
      const exactTime = metadata.mediaTime;
      // Use PTS binary search for VFR, fallback to CFR calculation
      const pts = ptsDataRef.current;
      const exactFrame = pts && pts.length > 0
        ? ptsDataBinarySearch(pts, exactTime)
        : Math.floor(exactTime * fps + 0.001);

      // IMMEDIATE: Draw canvas directly in the callback (no React lag)
      drawCanvasForFrame(exactFrame);

      // Update local state for progress bar (can lag, that's OK)
      setCurrentTime(exactTime);

      // Update parent only if frame changed
      if (exactFrame !== lastFrameRef.current) {
        lastFrameRef.current = exactFrame;
        onFrameChange(exactFrame);
      }

      // Continue loop for next frame if still playing
      rvfcRef.current = videoEl.requestVideoFrameCallback(updateFrameLoop);
    };

    if (isPlaying) {
      // Start the loop
      rvfcRef.current = videoEl.requestVideoFrameCallback(updateFrameLoop);
    } else {
      // Stop the loop on pause
      if (rvfcRef.current !== null) {
        videoEl.cancelVideoFrameCallback(rvfcRef.current);
        rvfcRef.current = null;
      }
    }

    // Cleanup when component unmounts or isPlaying changes
    return () => {
      if (rvfcRef.current !== null && videoEl) {
        videoEl.cancelVideoFrameCallback(rvfcRef.current);
        rvfcRef.current = null;
      }
    };
  }, [isPlaying, fps, onFrameChange, drawCanvasForFrame]);

  // Fallback time update handler for when video is paused or for metadata loading
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current && fps && !isPlaying) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);
      
      // Use PTS-aware frame calculation for VFR support
      const frame = calculateFrameFromTime(time, fps, ptsData);
      if (frame !== lastFrameRef.current) {
        lastFrameRef.current = frame;
        onFrameChange(frame);
      }
    }
  }, [fps, ptsData, onFrameChange, isPlaying]);


  // Handle video metadata loaded
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      videoRef.current.muted = true;
      setIsMuted(true);
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Play/pause controls
  const togglePlayPause = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const cyclePlaybackRate = useCallback(() => {
    if (!videoRef.current) return;

    const rates = [0.5, 1, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length];

    videoRef.current.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  }, [playbackRate]);

  // Frame navigation - directly manipulate video.currentTime
  const goToPreviousFrame = useCallback(() => {
    if (fps && videoRef.current) {
      const actualFrame = calculateFrameFromTime(videoRef.current.currentTime, fps, ptsData);
      if (actualFrame > 0) {
        const targetFrame = actualFrame - 1;
        const targetTime = calculateTimeFromFrame(targetFrame, fps, ptsData);
        videoRef.current.currentTime = targetTime;
        setCurrentTime(targetTime);
        lastFrameRef.current = targetFrame;
        onFrameChange(targetFrame);
      }
    }
  }, [fps, ptsData, videoRef, onFrameChange]);

  const goToNextFrame = useCallback(() => {
    if (fps && duration && videoRef.current) {
      const actualFrame = calculateFrameFromTime(videoRef.current.currentTime, fps, ptsData);
      const totalFrames = ptsData ? ptsData.length : Math.floor(duration * fps);
      if (actualFrame < totalFrames - 1) {
        const targetFrame = actualFrame + 1;
        const targetTime = calculateTimeFromFrame(targetFrame, fps, ptsData);
        videoRef.current.currentTime = targetTime;
        setCurrentTime(targetTime);
        lastFrameRef.current = targetFrame;
        onFrameChange(targetFrame);
      }
    }
  }, [fps, ptsData, duration, videoRef, onFrameChange]);

  // Canvas drawing functions
  const getCanvasCoordinatesLocal = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const canvasPoint = getCanvasCoordinates(e, canvasRef);
    return mapCanvasPointToVideoPoint(canvas, canvasPoint);
  }, []);

  // Reset selectedBoundingBox when optimistic update has synchronized the data
  useEffect(() => {
    if (selectedBoundingBox && !isMoving && !isResizing) {
      const updatedBbox = boundingBoxes.find(bbox => bbox.id === selectedBoundingBox.id);
      if (updatedBbox && 
          updatedBbox.bboxX === selectedBoundingBox.bboxX &&
          updatedBbox.bboxY === selectedBoundingBox.bboxY &&
          updatedBbox.bboxWidth === selectedBoundingBox.bboxWidth &&
          updatedBbox.bboxHeight === selectedBoundingBox.bboxHeight) {
        // The optimistic update has synchronized, we can now clear selectedBoundingBox
        setSelectedBoundingBox(null);
        setInitialBoundingBox(null);
      }
    }
  }, [boundingBoxes, selectedBoundingBox, isMoving, isResizing]);

  // Progress bar dragging handlers
  const handleProgressMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingProgress(true);
    
    // Pause video while dragging for smoother experience
    if (videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
    }
    
    // Calculate initial preview time
    if (!duration) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = pos * duration;
    
    // Update visual preview immediately
    setPreviewTime(targetTime);
  }, [duration, videoRef]);

  const handleProgressMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingProgress || !duration) return;
    
    const progressBar = document.querySelector('[data-progress-bar]') as HTMLElement;
    if (!progressBar) return;
    
    const rect = progressBar.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = pos * duration;
    
    // Update visual preview immediately (no lag)
    setPreviewTime(targetTime);
    
    // Debounce actual video seek to avoid buffering issues
    if (dragTimeoutRef.current !== null) {
      window.clearTimeout(dragTimeoutRef.current);
    }
    
    dragTimeoutRef.current = window.setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = targetTime;
        setCurrentTime(targetTime);
      }
    }, 50);
  }, [isDraggingProgress, duration, videoRef]);

  const handleProgressMouseUp = useCallback(() => {
    if (!isDraggingProgress) return;
    
    // Clear any pending timeout
    if (dragTimeoutRef.current !== null) {
      window.clearTimeout(dragTimeoutRef.current);
    }
    
    // Final seek to exact position
    const finalTime = previewTime ?? currentTime;
    if (videoRef.current) {
      videoRef.current.currentTime = finalTime;
      setCurrentTime(finalTime);
    }
    
    setIsDraggingProgress(false);
    setPreviewTime(null);
    
    // Sync frame state after dragging ends
    if (videoRef.current && fps) {
      const targetFrame = calculateFrameFromTime(finalTime, fps, ptsData);
      onFrameChange(targetFrame);
    }
  }, [isDraggingProgress, previewTime, currentTime, videoRef, fps, ptsData, onFrameChange]);

  // Add/remove mouse event listeners for dragging
  useEffect(() => {
    if (isDraggingProgress) {
      window.addEventListener('mousemove', handleProgressMouseMove);
      window.addEventListener('mouseup', handleProgressMouseUp);
      
      return () => {
        window.removeEventListener('mousemove', handleProgressMouseMove);
        window.removeEventListener('mouseup', handleProgressMouseUp);
      };
    }
  }, [isDraggingProgress, handleProgressMouseMove, handleProgressMouseUp]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    const coords = getCanvasCoordinatesLocal(e);
    const actualFrame = getActualFrame();
    
    // Check if we're clicking on a bounding box handle
    const result = findBoundingBoxAt(coords.x, coords.y, boundingBoxes, actualFrame, 10);
    
    if (result) {
      const { boundingBox, handle } = result;
      
      // Select the annotation associated with this bounding box
      const annotation = annotations.find(ann => ann.id === boundingBox.annotationId);
      if (annotation) {
        onAnnotationSelect(annotation.id);
        setSelectedBoundingBox(boundingBox);
        setInitialBoundingBox({ ...boundingBox }); // Store initial state
        
        if (handle === 'move') {
          // Start moving
          setIsMoving(true);
          setMoveStart(coords);
        } else {
          // Start resizing
          setIsResizing(true);
          setResizeHandle(handle);
        }
        
        // Prevent drawing when interacting with existing bounding boxes
        return;
      }
    }
    
    // If we clicked on empty space, only start drawing if GPS data is available
    if (gpsData) {
      // Start drawing a new bounding box
      setIsDrawing(true);
      setDrawStart(coords);
      setCurrentBBox(null);
    }
  }, [gpsData, getCanvasCoordinatesLocal, boundingBoxes, annotations, onAnnotationSelect, getActualFrame]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    const coords = getCanvasCoordinatesLocal(e);
    const actualFrame = getActualFrame();
    
    if (isMoving && selectedBoundingBox && moveStart) {
      // Move the bounding box
      const dx = coords.x - moveStart.x;
      const dy = coords.y - moveStart.y;
      
      // Update the selected bounding box's position
      const updatedBoundingBox = {
        ...selectedBoundingBox,
        bboxX: Math.round(selectedBoundingBox.bboxX + dx),
        bboxY: Math.round(selectedBoundingBox.bboxY + dy)
      };
      
      setSelectedBoundingBox(updatedBoundingBox);
      setMoveStart(coords);
      return;
    }
    
    if (isResizing && selectedBoundingBox && resizeHandle) {
      // Resize the bounding box
      const resizedBbox = calculateResizedBbox(selectedBoundingBox, resizeHandle, coords);
      
      // Update the selected bounding box's dimensions
      const updatedBoundingBox = {
        ...selectedBoundingBox,
        ...resizedBbox
      };
      
      setSelectedBoundingBox(updatedBoundingBox);
      return;
    }
    
    if (isDrawing && drawStart) {
      const bbox: DrawingBBox = {
        x: Math.min(drawStart.x, coords.x),
        y: Math.min(drawStart.y, coords.y),
        width: Math.abs(coords.x - drawStart.x),
        height: Math.abs(coords.y - drawStart.y),
      };
      
      setCurrentBBox(bbox);
      return;
    }
    
    // Update cursor based on what's under the mouse
    const result = findBoundingBoxAt(coords.x, coords.y, boundingBoxes, actualFrame, 10);
    if (canvasRef.current) {
      const handle = result?.handle || null;
      setCursorForHandle(canvasRef.current, handle);
    }
  }, [isDrawing, drawStart, isMoving, isResizing, selectedBoundingBox, moveStart, resizeHandle, boundingBoxes, getCanvasCoordinatesLocal, getActualFrame]);

  const handleCanvasMouseUp = useCallback((e: React.MouseEvent) => {
    
    if (isMoving && selectedBoundingBox && initialBoundingBox) {
      // Only update if there was a significant change
      if (hasSignificantChange(initialBoundingBox, selectedBoundingBox)) {
        onBoundingBoxUpdate(selectedBoundingBox.id, {
          bboxX: selectedBoundingBox.bboxX,
          bboxY: selectedBoundingBox.bboxY
        });
      }
      setIsMoving(false);
      setMoveStart(null);
      setInitialBoundingBox(null);
      return;
    }
    
    if (isResizing && selectedBoundingBox && initialBoundingBox) {
      // Only update if there was a significant change
      if (hasSignificantChange(initialBoundingBox, selectedBoundingBox)) {
        onBoundingBoxUpdate(selectedBoundingBox.id, {
          bboxX: selectedBoundingBox.bboxX,
          bboxY: selectedBoundingBox.bboxY,
          bboxWidth: selectedBoundingBox.bboxWidth,
          bboxHeight: selectedBoundingBox.bboxHeight
        });
      }
      setIsResizing(false);
      setResizeHandle(null);
      setInitialBoundingBox(null);
      return;
    }
    
    if (isDrawing && currentBBox && gpsData && fps) {
      const actualFrame = getActualFrame();
      
      // Check if the bounding box has minimum size (avoid point-like boxes)
      if (isValidBoundingBoxSize(currentBBox)) {
        
        // Check if there's a selected annotation and no bounding box for it on the current frame
        const selectedAnnotation = selectedAnnotationId ? annotations.find(ann => ann.id === selectedAnnotationId) : null;
        const hasSelectedAnnotationBboxOnCurrentFrame = selectedAnnotation ? 
          boundingBoxes.some(bbox => bbox.annotationId === selectedAnnotation.id && bbox.frameIndex === actualFrame) : 
          false;
        
        if (selectedAnnotation && !hasSelectedAnnotationBboxOnCurrentFrame) {
          // Add a bounding box to the existing selected annotation
          const boundingBoxData = createBoundingBoxData(actualFrame, currentTime, currentBBox);
          onBoundingBoxCreate(selectedAnnotation.id, boundingBoxData);
        } else {
          // Create a new annotation with bounding box
          const gpsPoint = getGPSForFrame(gpsData.data as any[], actualFrame, fps);
          if (!gpsPoint) {
            console.warn("No GPS data available for current frame");
            setIsDrawing(false);
            setDrawStart(null);
            setCurrentBBox(null);
            return;
          }

          // Prepare the data for both annotation and bounding box
          const annotationData = {
            folderId: folderId,
            videoId: video.id,
            signType: "Unknown",
            gpsLat: gpsPoint.lat,
            gpsLon: gpsPoint.lon,
          };

          const boundingBoxData = createBoundingBoxData(actualFrame, currentTime, currentBBox);

          // Call the function with separated data
          onAnnotationCreate(annotationData, boundingBoxData);
        }
      } else {
        // If the box is too small (like a simple click), deselect instead
        onAnnotationSelect(null);
      }
      
      setIsDrawing(false);
      setDrawStart(null);
      setCurrentBBox(null);
      return;
    }
    
    // If we're here, it means we clicked without any interaction
    // Check if we clicked on empty space to deselect
    if (!isMoving && !isResizing) {
      // Simple click on empty space - deselect
      onAnnotationSelect(null);
    }
    
    // Reset states
    setIsDrawing(false);
    setIsMoving(false);
    setIsResizing(false);
    setDrawStart(null);
    setCurrentBBox(null);
    setMoveStart(null);
    setResizeHandle(null);
    setInitialBoundingBox(null);
  }, [isDrawing, currentBBox, gpsData, video, currentTime, onAnnotationCreate, onBoundingBoxCreate, folderId, isMoving, isResizing, selectedBoundingBox, onBoundingBoxUpdate, getCanvasCoordinatesLocal, onAnnotationSelect, selectedAnnotationId, annotations, boundingBoxes, initialBoundingBox, getActualFrame]);

  // Draw annotations on canvas (only when paused or for interactions)
  useEffect(() => {
    // Skip if playing - rVFC handles drawing during playback
    if (isPlaying) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw existing bounding boxes for current frame
    currentFrameBoundingBoxes.forEach(bbox => {
      // Find the corresponding annotation to get the label
      const annotation = annotations.find(ann => ann.id === bbox.annotationId);
      if (!annotation) return;
      
      // Use selectedBoundingBox if it exists for this bbox (for smooth transition during/after moves)
      const bboxToRender = (selectedBoundingBox && bbox.id === selectedBoundingBox.id) ? selectedBoundingBox : bbox;
      const isSelected = annotation.id === selectedAnnotationId;
      
      drawBoundingBox(ctx, bboxToRender, annotation, annotations, isSelected);
    });
    
    // Draw current bounding box being drawn
    if (currentBBox) {
      drawTemporaryBoundingBox(ctx, currentBBox);
    }
    
    // Draw the selected bounding box being moved/resized
    if ((isMoving || isResizing) && selectedBoundingBox) {
      // Find the corresponding annotation to get the label and color
      const annotation = annotations.find(ann => ann.id === selectedBoundingBox.annotationId);
      
      if (annotation) {
        drawBoundingBox(ctx, selectedBoundingBox, annotation, annotations, true);
        
        // Draw handles if resizing
        if (isResizing) {
          drawBoundingBoxHandles(ctx, selectedBoundingBox);
        }
      }
    }
    
    // Draw handles for selected annotation when not moving/resizing
    if (selectedAnnotationId && !isMoving && !isResizing) {
      const selectedBbox = currentFrameBoundingBoxes.find(bbox => {
        const annotation = annotations.find(ann => ann.id === bbox.annotationId);
        return annotation?.id === selectedAnnotationId;
      });
      
      if (selectedBbox) {
        drawBoundingBoxHandles(ctx, selectedBbox);
      }
    }
  }, [annotations, currentFrameBoundingBoxes, selectedAnnotationId, currentBBox, isMoving, isResizing, selectedBoundingBox, isPlaying]);

  // Clean up cursor on unmount
  useEffect(() => {
    return () => {
      if (canvasRef.current) {
        canvasRef.current.style.cursor = 'default';
      }
    };
  }, []);


  const totalFrames = ptsData ? ptsData.length : (fps && duration ? Math.floor(duration * fps) : 0);

  return (
    <div className="h-full flex flex-col">
      <div className="bg-card rounded-lg p-4 h-full flex flex-col">
        <div 
          ref={containerRef}
          className="relative w-full flex-1 bg-black rounded-md overflow-hidden"
        >
          <video
            ref={videoRef}
            className="w-full h-full object-contain rounded-md"
            src={`/api/videos/${video.id}/file`}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            data-testid="video-player"
          />
          
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full cursor-crosshair"
            width={video.width || 1920}
            height={video.height || 1080}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            data-testid="annotation-canvas"
          />
          
          {/* Delete video button - top right corner */}
          <Button
            onClick={onVideoDelete}
            variant="ghost"
            size="sm"
            className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-600/90 text-white rounded-md transition-colors z-10"
            title="Remove video"
            data-testid="button-delete-video"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        {/* Video Controls */}
        <div className="mt-4 space-y-3 flex-shrink-0">
          <div className="flex items-center space-x-4">
            <Button
              onClick={togglePlayPause}
              size="sm"
              className="p-2"
              data-testid="button-play-pause"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <Button
              onClick={cyclePlaybackRate}
              size="sm"
              className="px-3"
              variant="outline"
              data-testid="button-playback-rate"
            >
              {playbackRate}x
            </Button>
            <span className="text-sm text-muted-foreground" data-testid="text-current-time">
              {formatTime(isDraggingProgress && previewTime !== null ? previewTime : currentTime)}
            </span>
            <div 
              data-progress-bar
              className="flex-1 h-2 bg-muted rounded-full relative cursor-pointer select-none group"
              onMouseDown={handleProgressMouseDown}
            >
              {/* Progress bar fill */}
              <div 
                className="absolute top-0 left-0 h-full bg-primary rounded-full pointer-events-none" 
                style={{ 
                  width: `${duration ? ((isDraggingProgress && previewTime !== null ? previewTime : currentTime) / duration) * 100 : 0}%`,
                  transition: isDraggingProgress ? 'none' : 'width 0.1s ease-out'
                }}
                data-testid="progress-bar"
              />
              
              {/* Draggable thumb (round handle) */}
              <div 
                className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-primary rounded-full shadow-lg pointer-events-none ${
                  isDraggingProgress ? 'scale-125' : 'scale-0 group-hover:scale-100'
                }`}
                style={{ 
                  left: `${duration ? ((isDraggingProgress && previewTime !== null ? previewTime : currentTime) / duration) * 100 : 0}%`, 
                  marginLeft: '-8px',
                  transition: isDraggingProgress ? 'none' : 'transform 0.2s ease-out'
                }}
              />
            </div>
            <span className="text-sm text-muted-foreground" data-testid="text-total-time">
              {formatTime(duration)}
            </span>
          </div>
          
          {/* Frame Navigation */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <span className="text-muted-foreground">Frame:</span>
              <span className="text-foreground font-mono" data-testid="text-current-frame">
                {fps ? calculateFrameFromTime(currentTime, fps, ptsData) : 0}
              </span>
              <span className="text-muted-foreground">/</span>
              <span className="text-muted-foreground font-mono" data-testid="text-total-frames">
                {totalFrames}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <Button 
                onClick={goToPreviousFrame} 
                size="sm" 
                variant="secondary"
                disabled={fps ? getActualFrame() <= 0 : true}
                data-testid="button-previous-frame"
              >
                <SkipBack className="w-4 h-4 mr-1" />
                Frame
              </Button>
              <Button 
                onClick={goToNextFrame} 
                size="sm" 
                variant="secondary"
                disabled={fps && duration ? getActualFrame() >= totalFrames - 1 : true}
                data-testid="button-next-frame"
              >
                Frame
                <SkipForward className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

VideoPlayer.displayName = "VideoPlayer";

export default VideoPlayer;