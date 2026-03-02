import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { formatTime } from "./helpers/video-player-helpers";
import { Trash2, Edit } from "lucide-react";
import type { BoundingBox, Annotation } from "@shared/schema";
import EditAnnotationModal from "./edit-annotation-modal";
import { getLowConfidenceIssue } from "./helpers/video-player-helpers";

interface BoundingBoxListProps {
  annotation: Annotation | null;
  boundingBoxes: BoundingBox[];
  currentFrame: number;
  videoFps?: number;
  onFrameNavigate: (frame: number) => void;
  onBoundingBoxDelete?: (id: string) => void;
  onAnnotationUpdate?: (id: string, updates: Partial<Annotation>) => void;
}

export default function BoundingBoxList({
  annotation,
  boundingBoxes,
  currentFrame,
  videoFps = 30,
  onFrameNavigate,
  onBoundingBoxDelete,
  onAnnotationUpdate,
}: BoundingBoxListProps) {
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);

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
        <p className="text-sm">No bounding boxes for "{annotation.signType}"</p>
        <p className="text-xs mt-1">Draw a bounding box on the video to add one</p>
      </div>
    );
  }

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">
          Bounding Boxes for "{annotation.signType}"
        </h3>
        <div className="flex items-center space-x-2">
          <Badge variant="secondary" className="text-xs">
            {annotationBoundingBoxes.length} box{annotationBoundingBoxes.length !== 1 ? 'es' : ''}
          </Badge>
          {onAnnotationUpdate && (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingAnnotation(annotation)}
                  className="h-7 w-7 p-0"
                  title="Edit annotation"
                >
                  <Edit className="w-3 h-3" />
                </Button>
              </DialogTrigger>
              {editingAnnotation && (
                <EditAnnotationModal
                  annotation={editingAnnotation}
                  onSave={(updates) => {
                    if (onAnnotationUpdate) {
                      onAnnotationUpdate(editingAnnotation.id, updates);
                    }
                  }}
                  onClose={() => setEditingAnnotation(null)}
                />
              )}
            </Dialog>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        {/* Low confidence warning banner - inside scrollable container */}
        {(() => {
          const lowConfidence = getLowConfidenceIssue(annotation);
          if (!lowConfidence.isLowConfidence) return null;

          // Determine the title based on which confidence is low
          let title = "Low confidence";
          if (lowConfidence.lowClassification && lowConfidence.lowDetection) {
            title = "Low confidence: detection & classification";
          } else if (lowConfidence.lowClassification) {
            title = "Low confidence: classification";
          } else if (lowConfidence.lowDetection) {
            title = "Low confidence: detection";
          }

          return (
            <Card className="p-3 bg-red-50 border border-red-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-red-800">{title}</p>
                  <p className="text-red-500 text-xs mt-1">
                    {lowConfidence.lowClassification && `Classification: ${(annotation.classificationConfidence! * 100).toFixed(0)}%`}
                    {lowConfidence.lowClassification && lowConfidence.lowDetection && ` • `}
                    {lowConfidence.lowDetection && `Detection: ${(annotation.detectionConfidence! * 100).toFixed(0)}%`}
                  </p>
                </div>
              </div>
            </Card>
          );
        })()}

        {annotationBoundingBoxes.map((bbox) => {
          const isCurrentFrame = bbox.frameIndex === currentFrame;
          const timeInSeconds = bbox.frameTimestampMs / 1000;
          
          return (
            <Card
              key={bbox.id}
              className={`p-3 transition-colors cursor-pointer ${
                isCurrentFrame 
                  ? 'bg-primary/10 border-primary' 
                  : 'bg-card hover:bg-muted/50'
              }`}
              onClick={() => {
                // Navigate to frame only
                onFrameNavigate(bbox.frameIndex);
              }}
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
                  {onBoundingBoxDelete && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        onBoundingBoxDelete(bbox.id);
                      }}
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
