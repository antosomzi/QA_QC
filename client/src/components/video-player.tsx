import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { getGPSForFrame } from "@/lib/gps-utils";
import { 
  getCanvasCoordinates, 
  findBoundingBoxAt, 
  formatTime, 
  calculateResizedBbox,
  getAnnotationColor
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
  onAnnotationUpdate: (id: string, updates: Partial<Annotation>) => void;
  onBoundingBoxUpdate: (id: string, updates: Partial<BoundingBox>) => void;
  selectedAnnotationId?: string | null;
  onAnnotationSelect: (id: string | null) => void;
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
  onBoundingBoxUpdate,
  selectedAnnotationId,
  onAnnotationSelect,
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
      // Utiliser Math.round au lieu de Math.floor pour une meilleure synchronisation
      // avec la frame réellement affichée
      const frame = Math.round(time * video.fps);
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
    //bug_video_correction.md for the + 0.3 offset explanation
    const targetTime = (targetFrame + 0.3) / video.fps;
    
    // Effectuer le seek
    videoRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
    onFrameChange(targetFrame);
    
    // Réactiver la mise à jour automatique après un court délai
    setTimeout(() => setIsManualNavigation(false), 100);
  }, [video.fps, onFrameChange]);

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
      }
    }
  }, [boundingBoxes, selectedBoundingBox, isMoving, isResizing]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (!gpsData) return;
    
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
    
    // If we clicked on empty space, start drawing a new bounding box
    // But don't deselect yet - we'll do that in mouseUp if no drag happens
    setIsDrawing(true);
    setDrawStart(coords);
    setCurrentBBox(null);
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
      const canvas = canvasRef.current;
      if (result) {
        const { handle } = result;
        switch (handle) {
          case 'nw':
          case 'se':
            canvas.style.cursor = 'nwse-resize';
            break;
          case 'ne':
          case 'sw':
            canvas.style.cursor = 'nesw-resize';
            break;
          case 'n':
          case 's':
            canvas.style.cursor = 'ns-resize';
            break;
          case 'w':
          case 'e':
            canvas.style.cursor = 'ew-resize';
            break;
          case 'move':
            canvas.style.cursor = 'move';
            break;
          default:
            canvas.style.cursor = 'crosshair';
        }
      } else {
        canvas.style.cursor = 'crosshair';
      }
    }
  }, [isDrawing, drawStart, isMoving, isResizing, selectedBoundingBox, moveStart, resizeHandle, boundingBoxes, currentFrame, getCanvasCoordinatesLocal]);

  const handleCanvasMouseUp = useCallback((e: React.MouseEvent) => {
    
    if (isMoving && selectedBoundingBox) {
      // Finish moving - update the bounding box
      onBoundingBoxUpdate(selectedBoundingBox.id, {
        bboxX: selectedBoundingBox.bboxX,
        bboxY: selectedBoundingBox.bboxY
      });
      setIsMoving(false);
      setMoveStart(null);
      return;
    }
    
    if (isResizing && selectedBoundingBox) {
      // Finish resizing - update the bounding box
      onBoundingBoxUpdate(selectedBoundingBox.id, {
        bboxX: selectedBoundingBox.bboxX,
        bboxY: selectedBoundingBox.bboxY,
        bboxWidth: selectedBoundingBox.bboxWidth,
        bboxHeight: selectedBoundingBox.bboxHeight
      });
      setIsResizing(false);
      setResizeHandle(null);
      return;
    }
    
    if (isDrawing && currentBBox && gpsData && video.fps) {
      // Check if the bounding box has minimum size (avoid point-like boxes)
      const minSize = 10;
      if (currentBBox.width >= minSize && currentBBox.height >= minSize) {
        // Create new annotation with bounding box only if it's big enough
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

        const boundingBoxData = {
          frameIndex: currentFrame,
          frameTimestampMs: Math.floor(currentTime * 1000),
          bboxX: Math.round(currentBBox.x),
          bboxY: Math.round(currentBBox.y),
          bboxWidth: Math.round(currentBBox.width),
          bboxHeight: Math.round(currentBBox.height),
        };

        // Call the function with separated data
        onAnnotationCreate(annotationData, boundingBoxData);
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
  }, [isDrawing, currentBBox, gpsData, video, currentFrame, currentTime, onAnnotationCreate, folderId, isMoving, isResizing, selectedBoundingBox, onBoundingBoxUpdate, getCanvasCoordinatesLocal, onAnnotationSelect]);

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
      
      // Get consistent color for this annotation
      const annotationColor = getAnnotationColor(annotations, annotation.id);
      const isSelected = annotation.id === selectedAnnotationId;
      
      ctx.strokeStyle = isSelected ? '#FF6B6B' : annotationColor; // Red for selected, unique color otherwise
      ctx.lineWidth = isSelected ? 6 : 4; // Thicker line for selected
      ctx.strokeRect(bboxToRender.bboxX, bboxToRender.bboxY, bboxToRender.bboxWidth, bboxToRender.bboxHeight);
      
      // Draw label
      ctx.fillStyle = isSelected ? '#FF6B6B' : annotationColor;
      ctx.font = isSelected ? 'bold 14px Inter' : '14px Inter';
      ctx.fillText(annotation.label, bboxToRender.bboxX, bboxToRender.bboxY - 5);
    });
    
    // Draw current bounding box being drawn
    if (currentBBox) {
      ctx.strokeStyle = '#FF6B6B';
      ctx.lineWidth = 5;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(currentBBox.x, currentBBox.y, currentBBox.width, currentBBox.height);
      ctx.setLineDash([]);
    }
    
    // Draw the selected bounding box being moved/resized
    if ((isMoving || isResizing) && selectedBoundingBox) {
      // Find the corresponding annotation to get the label and color
      const annotation = annotations.find(ann => ann.id === selectedBoundingBox.annotationId);
      
      if (annotation) {
        
        ctx.strokeStyle = '#FF6B6B'; // Always red when selected and moving/resizing
        ctx.lineWidth = 6;
        ctx.strokeRect(selectedBoundingBox.bboxX, selectedBoundingBox.bboxY, selectedBoundingBox.bboxWidth, selectedBoundingBox.bboxHeight);
        
        // Draw label
        ctx.fillStyle = '#FF6B6B';
        ctx.font = 'bold 14px Inter';
        ctx.fillText(annotation.label, selectedBoundingBox.bboxX, selectedBoundingBox.bboxY - 5);
        
        // Draw handles if resizing
        if (isResizing) {
          ctx.fillStyle = '#FF6B6B';
          const handleSize = 8;
          const { bboxX, bboxY, bboxWidth, bboxHeight } = selectedBoundingBox;
          const corners = [
            { x: bboxX, y: bboxY }, // nw
            { x: bboxX + bboxWidth, y: bboxY }, // ne
            { x: bboxX, y: bboxY + bboxHeight }, // sw
            { x: bboxX + bboxWidth, y: bboxY + bboxHeight } // se
          ];
          
          corners.forEach(corner => {
            ctx.fillRect(
              corner.x - handleSize / 2,
              corner.y - handleSize / 2,
              handleSize,
              handleSize
            );
          });
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
        
        ctx.fillStyle = '#FF6B6B'; // Handles are always red for selected
        const handleSize = 8;
        const { bboxX, bboxY, bboxWidth, bboxHeight } = selectedBbox;
        const corners = [
          { x: bboxX, y: bboxY }, // nw
          { x: bboxX + bboxWidth, y: bboxY }, // ne
          { x: bboxX, y: bboxY + bboxHeight }, // sw
          { x: bboxX + bboxWidth, y: bboxY + bboxHeight } // se
        ];
        
        corners.forEach(corner => {
          ctx.fillRect(
            corner.x - handleSize / 2,
            corner.y - handleSize / 2,
            handleSize,
            handleSize
          );
        });
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
    <div className="flex-1 p-6">
      <div className="bg-card rounded-lg p-4 h-full">
        <div 
          ref={containerRef}
          className="relative w-full h-full bg-black rounded-md overflow-hidden"
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
        </div>
        
        {/* Video Controls */}
        <div className="mt-4 space-y-3">
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
                  const targetFrame = Math.floor(targetTime * video.fps);
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