import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, X } from "lucide-react";
import { getGPSForFrame } from "@/lib/gps-utils";
import { 
  getCanvasCoordinates, 
  findBoundingBoxAt, 
  formatTime, 
  calculateResizedBbox,
  getAnnotationColor,
  setCursorForHandle,
  calculateFrameFromTime,
  calculateTimeFromFrame,
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
  annotations: Annotation[];
  boundingBoxes: BoundingBox[];
  currentFrame: number;
  onFrameChange: (frame: number) => void;
  onAnnotationCreate: (
    annotationData: Pick<Annotation, 'folderId' | 'videoId' | 'label' | 'gpsLat' | 'gpsLon'>,
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

export default function VideoPlayer({
  video,
  gpsData,
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
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentBBox, setCurrentBBox] = useState<DrawingBBox | null>(null);
  const [isManualNavigation, setIsManualNavigation] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [moveStart, setMoveStart] = useState<{ x: number; y: number } | null>(null);
  const [selectedBoundingBox, setSelectedBoundingBox] = useState<BoundingBox | null>(null);
  const [initialBoundingBox, setInitialBoundingBox] = useState<BoundingBox | null>(null);

  // Memoize bounding boxes for current frame to avoid unnecessary re-renders
  const currentFrameBoundingBoxes = useMemo(() => {
    return boundingBoxes.filter(bbox => bbox.frameIndex === currentFrame);
  }, [boundingBoxes, currentFrame]);

  // Handle video time updates - source de vérité unique
  const handleTimeUpdate = useCallback(() => {
    // Ignorer les mises à jour pendant la navigation manuelle
    if (isManualNavigation) return;
    
    if (videoRef.current && video.fps) {
      const time = videoRef.current.currentTime;
      const frame = calculateFrameFromTime(time, video.fps);
      setCurrentTime(time);
      // Ne mettre à jour la frame que si elle a vraiment changé
      if (frame !== currentFrame) {
        onFrameChange(frame);
      }
    }
  }, [video.fps, onFrameChange, isManualNavigation, currentFrame]);

  // Handle video metadata loaded
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      // Sync mute state with video element
      setIsMuted(videoRef.current.muted);
    }
  }, []);

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

  // Mute/unmute controls
  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  // Fonction helper pour la navigation frame par frame avec correction du décalage
  const navigateToFrame = useCallback((targetFrame: number) => {
    if (!video.fps || !videoRef.current) return;
    
    setIsManualNavigation(true);
    const targetTime = calculateTimeFromFrame(targetFrame, video.fps);
    
    // Effectuer le seek
    videoRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
    onFrameChange(targetFrame);
    
    // Réactiver la mise à jour automatique après un court délai
    setTimeout(() => setIsManualNavigation(false), 100);
  }, [video.fps, onFrameChange]);

  // Effect to handle external frame navigation (from BoundingBoxList, etc.)
  useEffect(() => {
    if (!video.fps || !videoRef.current) return;
    
    // Only navigate if the external currentFrame differs from the video's current frame
    const videoCurrentFrame = calculateFrameFromTime(videoRef.current.currentTime, video.fps);
    if (currentFrame !== videoCurrentFrame && !isManualNavigation) {
      setIsManualNavigation(true);
      const targetTime = calculateTimeFromFrame(currentFrame, video.fps);
      videoRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
      setTimeout(() => setIsManualNavigation(false), 100);
    }
  }, [currentFrame, video.fps, isManualNavigation]);

  // Frame navigation avec correction du bug
  const goToPreviousFrame = useCallback(() => {
    if (video.fps && currentFrame > 0) {
      navigateToFrame(currentFrame - 1);
    }
  }, [currentFrame, video.fps, navigateToFrame]);

  const goToNextFrame = useCallback(() => {
    if (video.fps && duration) {
      const totalFrames = Math.floor(duration * video.fps);
      if (currentFrame < totalFrames - 1) {
        navigateToFrame(currentFrame + 1);
      }
    }
  }, [currentFrame, video.fps, duration, navigateToFrame]);

  // Canvas drawing functions
  const getCanvasCoordinatesLocal = useCallback((e: React.MouseEvent) => {
    return getCanvasCoordinates(e, canvasRef);
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

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    const coords = getCanvasCoordinatesLocal(e);
    
    // Check if we're clicking on a bounding box handle
    const result = findBoundingBoxAt(coords.x, coords.y, boundingBoxes, currentFrame, 10);
    
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
  }, [gpsData, getCanvasCoordinatesLocal, boundingBoxes, currentFrame, annotations, onAnnotationSelect]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    const coords = getCanvasCoordinatesLocal(e);
    
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
    const result = findBoundingBoxAt(coords.x, coords.y, boundingBoxes, currentFrame, 10);
    if (canvasRef.current) {
      const handle = result?.handle || null;
      setCursorForHandle(canvasRef.current, handle);
    }
  }, [isDrawing, drawStart, isMoving, isResizing, selectedBoundingBox, moveStart, resizeHandle, boundingBoxes, currentFrame, getCanvasCoordinatesLocal]);

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
    
    if (isDrawing && currentBBox && gpsData && video.fps) {
      // Check if the bounding box has minimum size (avoid point-like boxes)
      if (isValidBoundingBoxSize(currentBBox)) {
        
        // Check if there's a selected annotation and no bounding box for it on the current frame
        const selectedAnnotation = selectedAnnotationId ? annotations.find(ann => ann.id === selectedAnnotationId) : null;
        const hasSelectedAnnotationBboxOnCurrentFrame = selectedAnnotation ? 
          boundingBoxes.some(bbox => bbox.annotationId === selectedAnnotation.id && bbox.frameIndex === currentFrame) : 
          false;
        
        if (selectedAnnotation && !hasSelectedAnnotationBboxOnCurrentFrame) {
          // Add a bounding box to the existing selected annotation
          const boundingBoxData = createBoundingBoxData(currentFrame, currentTime, currentBBox);
          onBoundingBoxCreate(selectedAnnotation.id, boundingBoxData);
        } else {
          // Create a new annotation with bounding box
          const gpsPoint = getGPSForFrame(gpsData.data as any[], currentFrame, video.fps);
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
            label: "New Annotation",
            gpsLat: gpsPoint.lat,
            gpsLon: gpsPoint.lon,
          };

          const boundingBoxData = createBoundingBoxData(currentFrame, currentTime, currentBBox);

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
  }, [isDrawing, currentBBox, gpsData, video, currentFrame, currentTime, onAnnotationCreate, onBoundingBoxCreate, folderId, isMoving, isResizing, selectedBoundingBox, onBoundingBoxUpdate, getCanvasCoordinatesLocal, onAnnotationSelect, selectedAnnotationId, annotations, boundingBoxes, initialBoundingBox]);

  // Draw annotations on canvas
  useEffect(() => {
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
  }, [annotations, currentFrameBoundingBoxes, selectedAnnotationId, currentBBox, isMoving, isResizing, selectedBoundingBox]);

  // Clean up cursor on unmount
  useEffect(() => {
    return () => {
      if (canvasRef.current) {
        canvasRef.current.style.cursor = 'default';
      }
    };
  }, []);


  const totalFrames = video.fps && duration ? Math.floor(duration * video.fps) : 0;

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
              onClick={toggleMute}
              size="sm"
              className="p-2"
              variant="outline"
              data-testid="button-mute"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </Button>
            <span className="text-sm text-muted-foreground" data-testid="text-current-time">
              {formatTime(currentTime)}
            </span>
            <div 
              className="flex-1 h-2 bg-muted rounded-full relative cursor-pointer"
              onClick={(e) => {
                if (!videoRef.current || !duration) return;
                
                const rect = e.currentTarget.getBoundingClientRect();
                const pos = (e.clientX - rect.left) / rect.width;
                const targetTime = pos * duration;
                
                // Use the existing navigateToFrame function for precise frame seeking
                if (video.fps) {
                  const targetFrame = calculateFrameFromTime(targetTime, video.fps);
                  navigateToFrame(targetFrame);
                } else {
                  throw new Error("Video FPS is not defined");
                }
              }}
            >
              <div 
                className="absolute top-0 left-0 h-full bg-primary rounded-full" 
                style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                data-testid="progress-bar"
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
                {currentFrame}
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
                disabled={currentFrame <= 0}
                data-testid="button-previous-frame"
              >
                <SkipBack className="w-4 h-4 mr-1" />
                Frame
              </Button>
              <Button 
                onClick={goToNextFrame} 
                size="sm" 
                variant="secondary"
                disabled={currentFrame >= totalFrames - 1}
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
}