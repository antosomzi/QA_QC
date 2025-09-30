import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatTime } from "./helpers/video-player-helpers";
import { Play, Trash2 } from "lucide-react";
import type { BoundingBox, Annotation } from "@shared/schema";

interface BoundingBoxListProps {
  annotation: Annotation | null;
  boundingBoxes: BoundingBox[];
  currentFrame: number;
  videoFps?: number;
  onFrameNavigate: (frame: number) => void;
  onBoundingBoxDelete?: (id: string) => void;
}

export default function BoundingBoxList({
  annotation,
  boundingBoxes,
  currentFrame,
  videoFps = 30,
  onFrameNavigate,
  onBoundingBoxDelete,
}: BoundingBoxListProps) {
  // Filter bounding boxes for the selected annotation and sort by frame
  const annotationBoundingBoxes = useMemo(() => {
    if (!annotation) return [];
    
    return boundingBoxes
      .filter(bbox => bbox.annotationId === annotation.id)
      .sort((a, b) => a.frameIndex - b.frameIndex);
  }, [annotation, boundingBoxes]);

  if (!annotation) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p className="text-sm">Select an annotation to view its bounding boxes</p>
      </div>
    );
  }

  if (annotationBoundingBoxes.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p className="text-sm">No bounding boxes for "{annotation.label}"</p>
        <p className="text-xs mt-1">Draw a bounding box on the video to add one</p>
      </div>
    );
  }

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">
          Bounding Boxes for "{annotation.label}"
        </h3>
        <Badge variant="secondary" className="text-xs">
          {annotationBoundingBoxes.length} box{annotationBoundingBoxes.length !== 1 ? 'es' : ''}
        </Badge>
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-2">
        {annotationBoundingBoxes.map((bbox) => {
          const isCurrentFrame = bbox.frameIndex === currentFrame;
          const timeInSeconds = bbox.frameTimestampMs / 1000;
          
          return (
            <Card
              key={bbox.id}
              className={`p-3 transition-colors ${
                isCurrentFrame 
                  ? 'bg-primary/10 border-primary' 
                  : 'bg-card hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <Badge 
                      variant={isCurrentFrame ? "default" : "outline"} 
                      className="text-xs font-mono"
                    >
                      Frame {bbox.frameIndex}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(timeInSeconds)}
                    </span>
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    Position: {bbox.bboxX}, {bbox.bboxY} • 
                    Size: {bbox.bboxWidth}×{bbox.bboxHeight}
                  </div>
                </div>
                
                <div className="flex items-center space-x-1 ml-2">
                  {!isCurrentFrame && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onFrameNavigate(bbox.frameIndex)}
                      className="h-7 w-7 p-0"
                      title={`Go to frame ${bbox.frameIndex}`}
                    >
                      <Play className="w-3 h-3" />
                    </Button>
                  )}
                  
                  {onBoundingBoxDelete && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onBoundingBoxDelete(bbox.id)}
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      title="Delete bounding box"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
