import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { getGPSForFrame } from "@/lib/gps-utils";
import type { Video, GpsData, Annotation } from "@shared/schema";

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface VideoPlayerProps {
  video: Video;
  gpsData?: GpsData;
  annotations: Annotation[];
  currentFrame: number;
  onFrameChange: (frame: number) => void;
  onAnnotationCreate: (annotation: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'>) => void;
  selectedAnnotationId?: string | null;
  onAnnotationSelect: (id: string | null) => void;
}

export default function VideoPlayer({
  video,
  gpsData,
  annotations,
  currentFrame,
  onFrameChange,
  onAnnotationCreate,
  selectedAnnotationId,
  onAnnotationSelect,
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

  // Update video time when frame changes
  useEffect(() => {
    if (videoRef.current && video.fps) {
      const timeInSeconds = currentFrame / video.fps;
      videoRef.current.currentTime = timeInSeconds;
      setCurrentTime(timeInSeconds);
    }
  }, [currentFrame, video.fps]);

  // Handle video time updates
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current && video.fps) {
      const time = videoRef.current.currentTime;
      const frame = Math.floor(time * video.fps);
      setCurrentTime(time);
      onFrameChange(frame);
    }
  }, [video.fps, onFrameChange]);

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

  // Frame navigation
  const goToPreviousFrame = useCallback(() => {
    if (video.fps && currentFrame > 0) {
      onFrameChange(currentFrame - 1);
    }
  }, [currentFrame, video.fps, onFrameChange]);

  const goToNextFrame = useCallback(() => {
    if (video.fps && duration) {
      const totalFrames = Math.floor(duration * video.fps);
      if (currentFrame < totalFrames - 1) {
        onFrameChange(currentFrame + 1);
      }
    }
  }, [currentFrame, video.fps, duration, onFrameChange]);

  // Canvas drawing functions
  const getCanvasCoordinates = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (!gpsData) return;
    
    const coords = getCanvasCoordinates(e);
    setIsDrawing(true);
    setDrawStart(coords);
    setCurrentBBox(null);
  }, [gpsData, getCanvasCoordinates]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing || !drawStart) return;
    
    const coords = getCanvasCoordinates(e);
    const bbox: BoundingBox = {
      x: Math.min(drawStart.x, coords.x),
      y: Math.min(drawStart.y, coords.y),
      width: Math.abs(coords.x - drawStart.x),
      height: Math.abs(coords.y - drawStart.y),
    };
    
    setCurrentBBox(bbox);
  }, [isDrawing, drawStart, getCanvasCoordinates]);

  const handleCanvasMouseUp = useCallback(() => {
    if (!isDrawing || !currentBBox || !gpsData || !video.fps) return;
    
    // Get GPS coordinates for current frame
    const gpsPoint = getGPSForFrame(gpsData.data as any[], currentFrame, video.fps);
    if (!gpsPoint) {
      console.warn("No GPS data available for current frame");
      return;
    }

    // Create annotation
    const annotation = {
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
  }, [isDrawing, currentBBox, gpsData, video, currentFrame, currentTime, onAnnotationCreate]);

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
        ctx.strokeStyle = ann.id === selectedAnnotationId ? '#60A5FA' : '#3B82F6';
        ctx.lineWidth = 2;
        ctx.strokeRect(ann.bboxX, ann.bboxY, ann.bboxWidth, ann.bboxHeight);
        
        // Draw label
        ctx.fillStyle = ann.id === selectedAnnotationId ? '#60A5FA' : '#3B82F6';
        ctx.font = '14px Inter';
        ctx.fillText(ann.label, ann.bboxX, ann.bboxY - 5);
      });
    
    // Draw current bounding box being drawn
    if (currentBBox) {
      ctx.strokeStyle = '#3B82F6';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(currentBBox.x, currentBBox.y, currentBBox.width, currentBBox.height);
      ctx.setLineDash([]);
    }
  }, [annotations, currentFrame, selectedAnnotationId, currentBBox]);

  // Handle annotation selection on canvas click
  const handleAnnotationClick = useCallback((e: React.MouseEvent) => {
    if (isDrawing) return;
    
    const coords = getCanvasCoordinates(e);
    const clickedAnnotation = annotations
      .filter(ann => ann.frameIndex === currentFrame)
      .find(ann => 
        coords.x >= ann.bboxX && 
        coords.x <= ann.bboxX + ann.bboxWidth &&
        coords.y >= ann.bboxY && 
        coords.y <= ann.bboxY + ann.bboxHeight
      );
    
    if (clickedAnnotation) {
      onAnnotationSelect(clickedAnnotation.id);
    } else {
      onAnnotationSelect(null);
    }
  }, [isDrawing, getCanvasCoordinates, annotations, currentFrame, onAnnotationSelect]);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

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
            onClick={handleAnnotationClick}
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
            <div className="flex-1 h-2 bg-muted rounded-full relative cursor-pointer">
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
                data-testid="button-previous-frame"
              >
                <SkipBack className="w-4 h-4 mr-1" />
                Frame
              </Button>
              <Button 
                onClick={goToNextFrame} 
                size="sm" 
                variant="secondary"
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
