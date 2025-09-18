import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { getGPSForFrame } from "@/lib/gps-utils";
import { 
  getCanvasCoordinates, 
  findAnnotationAt, 
  formatTime, 
  calculateResizedBbox,
  type BoundingBox
} from "./helpers/video-player-helpers";
import type { Video, GpsData, Annotation } from "@shared/schema";

interface VideoPlayerProps {
  video: Video;
  gpsData?: GpsData;
  annotations: Annotation[];
  currentFrame: number;
  onFrameChange: (frame: number) => void;
  onAnnotationCreate: (annotation: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onAnnotationUpdate: (id: string, updates: Partial<Annotation>) => void;
  selectedAnnotationId?: string | null;
  onAnnotationSelect: (id: string | null) => void;
  folderId: string;
}

export default function VideoPlayer({
  video,
  gpsData,
  annotations,
  currentFrame,
  onFrameChange,
  onAnnotationCreate,
  onAnnotationUpdate,
  selectedAnnotationId,
  onAnnotationSelect,
  folderId,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentBBox, setCurrentBBox] = useState<BoundingBox | null>(null);
  const [isManualNavigation, setIsManualNavigation] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [moveStart, setMoveStart] = useState<{ x: number; y: number } | null>(null);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);

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

  // Fonction helper pour la navigation frame par frame avec correction du décalage
  const navigateToFrame = useCallback((targetFrame: number) => {
    if (!video.fps || !videoRef.current) return;
    
    setIsManualNavigation(true);
    // Calculer le temps exact pour la frame cible
    // Ajouter 0.5 / fps pour se positionner au milieu de la frame
    // Cela garantit que Math.round donnera la bonne frame
    const targetTime = (targetFrame + 0.5) / video.fps;
    
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

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (!gpsData) return;
    
    const coords = getCanvasCoordinatesLocal(e);
    
    // Check if we're clicking on an annotation handle
    const result = findAnnotationAt(coords.x, coords.y, annotations, currentFrame, 10);
    
    if (result) {
      const { annotation, handle } = result;
      
      // Select the annotation
      onAnnotationSelect(annotation.id);
      setSelectedAnnotation(annotation);
      
      if (handle === 'move') {
        // Start moving
        setIsMoving(true);
        setMoveStart(coords);
      } else {
        // Start resizing
        setIsResizing(true);
        setResizeHandle(handle);
      }
      
      // Prevent drawing when interacting with existing annotations
      return;
    }
    
    // If not clicking on an annotation, start drawing a new one
    setIsDrawing(true);
    setDrawStart(coords);
    setCurrentBBox(null);
  }, [gpsData, getCanvasCoordinatesLocal, annotations, currentFrame, onAnnotationSelect]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    const coords = getCanvasCoordinatesLocal(e);
    
    if (isMoving && selectedAnnotation && moveStart) {
      // Move the annotation
      const dx = coords.x - moveStart.x;
      const dy = coords.y - moveStart.y;
      
      // Update the selected annotation's position
      const updatedAnnotation = {
        ...selectedAnnotation,
        bboxX: Math.round(selectedAnnotation.bboxX + dx),
        bboxY: Math.round(selectedAnnotation.bboxY + dy)
      };
      
      setSelectedAnnotation(updatedAnnotation);
      setMoveStart(coords);
      return;
    }
    
    if (isResizing && selectedAnnotation && resizeHandle) {
      // Resize the annotation
      const resizedBbox = calculateResizedBbox(selectedAnnotation, resizeHandle, coords);
      
      // Update the selected annotation's dimensions
      const updatedAnnotation = {
        ...selectedAnnotation,
        ...resizedBbox
      };
      
      setSelectedAnnotation(updatedAnnotation);
      return;
    }
    
    if (isDrawing && drawStart) {
      const bbox: BoundingBox = {
        x: Math.min(drawStart.x, coords.x),
        y: Math.min(drawStart.y, coords.y),
        width: Math.abs(coords.x - drawStart.x),
        height: Math.abs(coords.y - drawStart.y),
      };
      
      setCurrentBBox(bbox);
      return;
    }
    
    // Update cursor based on what's under the mouse
    const result = findAnnotationAt(coords.x, coords.y, annotations, currentFrame, 10);
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
  }, [isDrawing, drawStart, isMoving, isResizing, selectedAnnotation, moveStart, resizeHandle, annotations, currentFrame, getCanvasCoordinatesLocal]);

  const handleCanvasMouseUp = useCallback((e: React.MouseEvent) => {
    const coords = getCanvasCoordinatesLocal(e);
    
    if (isMoving && selectedAnnotation) {
      // Finish moving - update the annotation
      onAnnotationUpdate(selectedAnnotation.id, {
        bboxX: selectedAnnotation.bboxX,
        bboxY: selectedAnnotation.bboxY
      });
      setIsMoving(false);
      setMoveStart(null);
      return;
    }
    
    if (isResizing && selectedAnnotation) {
      // Finish resizing - update the annotation
      onAnnotationUpdate(selectedAnnotation.id, {
        bboxX: selectedAnnotation.bboxX,
        bboxY: selectedAnnotation.bboxY,
        bboxWidth: selectedAnnotation.bboxWidth,
        bboxHeight: selectedAnnotation.bboxHeight
      });
      setIsResizing(false);
      setResizeHandle(null);
      return;
    }
    
    if (isDrawing && currentBBox && gpsData && video.fps) {
      // Create new annotation as before
      const gpsPoint = getGPSForFrame(gpsData.data as any[], currentFrame, video.fps);
      if (!gpsPoint) {
        console.warn("No GPS data available for current frame");
        return;
      }

      const annotation = {
        folderId: folderId,
        videoId: video.id,
        frameIndex: currentFrame,
        frameTimestampMs: Math.floor(currentTime * 1000),
        gpsLat: gpsPoint.lat,
        gpsLon: gpsPoint.lon,
        bboxX: Math.round(currentBBox.x),
        bboxY: Math.round(currentBBox.y),
        bboxWidth: Math.round(currentBBox.width),
        bboxHeight: Math.round(currentBBox.height),
        label: "New Annotation",
      };

      onAnnotationCreate(annotation);
      
      setIsDrawing(false);
      setDrawStart(null);
      setCurrentBBox(null);
      return;
    }
    
    // Reset states
    setIsDrawing(false);
    setIsMoving(false);
    setIsResizing(false);
    setDrawStart(null);
    setCurrentBBox(null);
    setMoveStart(null);
    setResizeHandle(null);
  }, [isDrawing, currentBBox, gpsData, video, currentFrame, currentTime, onAnnotationCreate, folderId, isMoving, isResizing, selectedAnnotation, onAnnotationUpdate, getCanvasCoordinatesLocal]);

  // Draw annotations on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw existing annotations for current frame
    annotations
      .filter(ann => ann.frameIndex === currentFrame)
      .forEach(ann => {
        // Skip drawing the selected annotation if it's being moved/resized (we'll draw it separately)
        if ((isMoving || isResizing) && ann.id === selectedAnnotation?.id) return;
        
        ctx.strokeStyle = ann.id === selectedAnnotationId ? '#FF6B6B' : '#E53E3E';
        ctx.lineWidth = 5;
        ctx.strokeRect(ann.bboxX, ann.bboxY, ann.bboxWidth, ann.bboxHeight);
        
        // Draw label
        ctx.fillStyle = ann.id === selectedAnnotationId ? '#FF6B6B' : '#E53E3E';
        ctx.font = '14px Inter';
        ctx.fillText(ann.label, ann.bboxX, ann.bboxY - 5);
      });
    
    // Draw current bounding box being drawn
    if (currentBBox) {
      ctx.strokeStyle = '#FF6B6B';
      ctx.lineWidth = 5;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(currentBBox.x, currentBBox.y, currentBBox.width, currentBBox.height);
      ctx.setLineDash([]);
    }
    
    // Draw the selected annotation being moved/resized
    if ((isMoving || isResizing) && selectedAnnotation) {
      ctx.strokeStyle = '#FF6B6B';
      ctx.lineWidth = 5;
      ctx.strokeRect(selectedAnnotation.bboxX, selectedAnnotation.bboxY, selectedAnnotation.bboxWidth, selectedAnnotation.bboxHeight);
      
      // Draw label
      ctx.fillStyle = '#FF6B6B';
      ctx.font = '14px Inter';
      ctx.fillText(selectedAnnotation.label, selectedAnnotation.bboxX, selectedAnnotation.bboxY - 5);
      
      // Draw handles if resizing
      if (isResizing) {
        ctx.fillStyle = '#FF6B6B';
        const handleSize = 8;
        const { bboxX, bboxY, bboxWidth, bboxHeight } = selectedAnnotation;
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
    
    // Draw handles for selected annotation when not moving/resizing
    if (selectedAnnotationId && !isMoving && !isResizing) {
      const selectedAnn = annotations.find(ann => ann.id === selectedAnnotationId && ann.frameIndex === currentFrame);
      if (selectedAnn) {
        ctx.fillStyle = '#FF6B6B';
        const handleSize = 8;
        const { bboxX, bboxY, bboxWidth, bboxHeight } = selectedAnn;
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
  }, [annotations, currentFrame, selectedAnnotationId, currentBBox, isMoving, isResizing, selectedAnnotation]);

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