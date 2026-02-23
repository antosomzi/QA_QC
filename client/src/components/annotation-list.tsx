import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Edit, Trash2, AlertTriangle } from "lucide-react";
import type { Annotation, BoundingBox } from "@shared/schema";
import { getAnnotationCSSColor, getAnnotationIndex, getAnnotationHexColor, getAnnotationColor, getLowConfidenceIssue } from "./helpers/video-player-helpers";
import EditAnnotationModal from "./edit-annotation-modal";
import { getSignTypeById } from "@/data/sign-types";

interface AnnotationListProps {
  annotations: Annotation[];
  boundingBoxes: BoundingBox[];
  selectedAnnotationId?: string | null;
  onAnnotationSelect: (id: string | null) => void;
  onAnnotationUpdate: (id: string, updates: Partial<Annotation>) => void;
  onAnnotationDelete: (id: string) => void;
}

export default function AnnotationList({
  annotations,
  boundingBoxes,
  selectedAnnotationId,
  onAnnotationSelect,
  onAnnotationUpdate,
  onAnnotationDelete,
}: AnnotationListProps) {
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);
  const selectedAnnotationRef = useRef<HTMLDivElement>(null);

  // Scroll to the selected annotation when it changes
  useEffect(() => {
    if (selectedAnnotationRef.current && selectedAnnotationId) {
      // Using requestAnimationFrame to ensure DOM is updated before scrolling
      requestAnimationFrame(() => {
        selectedAnnotationRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      });
    }
  }, [selectedAnnotationId]);

  const formatTimestamp = (timestampMs: number | null | undefined) => {
    if (timestampMs === null || timestampMs === undefined) {
      return 'No timestamp';
    }

    const totalSeconds = Math.floor(timestampMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const centiseconds = Math.floor((timestampMs % 1000) / 10);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
  };

  const formatCoordinate = (coord: number, isLat: boolean) => {
    const abs = Math.abs(coord);
    const direction = isLat ? (coord >= 0 ? 'N' : 'S') : (coord >= 0 ? 'E' : 'W');
    return `${abs.toFixed(4)}°${direction}`;
  };

  const sortedAnnotations = useMemo(() => {
      // 1. Pré-calcul : Créer un dictionnaire { annotationId: tempsDeDebut }
      // On parcourt les boxes UNE SEULE FOIS.
      const startTimes = new Map<string, number>();

      for (const bbox of boundingBoxes) {
        const currentMin = startTimes.get(bbox.annotationId) ?? Number.POSITIVE_INFINITY;
        if (bbox.frameTimestampMs < currentMin) {
          startTimes.set(bbox.annotationId, bbox.frameTimestampMs);
        }
      }

      // 2. Tri : On utilise le dictionnaire pour une lecture instantanée
      return [...annotations].sort((a, b) => {
        const aTime = startTimes.get(a.id) ?? Number.POSITIVE_INFINITY;
        const bTime = startTimes.get(b.id) ?? Number.POSITIVE_INFINITY;

        // Si même temps, tri alphabétique
        if (aTime === bTime) return a.label.localeCompare(b.label);
        
        // Sinon tri chronologique
        return aTime - bTime;
      });
    }, [annotations, boundingBoxes]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h3 className="text-lg font-medium">Signs</h3>
        <div className="flex items-center space-x-2">
          {/* Low confidence counts */}
          {(() => {
            const lowClassificationCount = annotations.filter(a => 
              a.classificationConfidence !== undefined && 
              a.classificationConfidence !== null && 
              a.classificationConfidence < 0.3
            ).length;
            const lowDetectionCount = annotations.filter(a => 
              a.detectionConfidence !== undefined && 
              a.detectionConfidence !== null && 
              a.detectionConfidence < 0.3
            ).length;
            
            return (
              <>
                <span
                  className={`text-xs px-2 py-1 rounded font-medium ${
                    lowClassificationCount > 0 
                      ? 'bg-red-100 text-red-700' 
                      : 'bg-muted text-muted-foreground'
                  }`}
                  title="Low classification confidence"
                >
                  ⚠️ Classif: {lowClassificationCount}
                </span>
                <span
                  className={`text-xs px-2 py-1 rounded font-medium ${
                    lowDetectionCount > 0 
                      ? 'bg-red-100 text-red-700' 
                      : 'bg-muted text-muted-foreground'
                  }`}
                  title="Low detection confidence"
                >
                  ⚠️ Local: {lowDetectionCount}
                </span>
              </>
            );
          })()}
          
          <span className="text-xs text-muted-foreground">Total:</span>
          <span
            className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded"
            data-testid="text-annotation-count"
          >
            {annotations.length}
          </span>
        </div>
      </div>

      <div className="space-y-2 overflow-y-auto flex-1 min-h-0">
        {annotations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No annotations yet</p>
            <p className="text-xs mt-1">Draw bounding boxes on the video to create annotations</p>
          </div>
        ) : (
          sortedAnnotations.map((annotation) => {
            const annotationColor = getAnnotationColor(annotations, annotation.id);
            const signType = annotation.signType ? getSignTypeById(annotation.signType) : null;
            const lowConfidence = getLowConfidenceIssue(annotation);
            return (
            <div
              ref={annotation.id === selectedAnnotationId ? selectedAnnotationRef : null}
              key={annotation.id}
              className={`p-3 rounded-md border cursor-pointer transition-colors ${
                annotation.id === selectedAnnotationId
                  ? 'bg-primary/10 border-primary border-2 shadow-md'
                  : lowConfidence.isLowConfidence
                    ? 'bg-card border-red-500 border-2 shadow-md'
                    : 'bg-card border-border hover:bg-accent/50'
              }`}
              onClick={() => {
                // Si l'annotation est déjà sélectionnée, la désélectionner
                if (annotation.id === selectedAnnotationId) {
                  onAnnotationSelect(null);
                } else {
                  onAnnotationSelect(annotation.id);
                }
              }}
              data-testid={`annotation-item-${annotation.id}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {signType && (
                    <img
                      src={signType.imagePath}
                      alt={signType.name}
                      className="w-6 h-6 object-contain flex-shrink-0"
                      loading="lazy"
                    />
                  )}
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: annotationColor }}
                  ></div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium" data-testid={`text-annotation-label-${annotation.id}`}>
                        {annotation.label}
                      </p>
                      {lowConfidence.isLowConfidence && (
                        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      GPS: {annotation.gpsLat.toFixed(5)}, {annotation.gpsLon.toFixed(5)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-1">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="p-1 text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingAnnotation(annotation);
                        }}
                        data-testid={`button-edit-annotation-${annotation.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    {editingAnnotation?.id === annotation.id && (
                      <EditAnnotationModal
                        annotation={annotation}
                        onSave={(updates) => onAnnotationUpdate(annotation.id, updates)}
                        onClose={() => setEditingAnnotation(null)}
                      />
                    )}
                  </Dialog>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="p-1 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAnnotationDelete(annotation.id);
                    }}
                    data-testid={`button-delete-annotation-${annotation.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground" data-testid={`text-annotation-coords-${annotation.id}`}>
                {formatCoordinate(annotation.gpsLat, true)}, {formatCoordinate(annotation.gpsLon, false)}
              </div>
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}
