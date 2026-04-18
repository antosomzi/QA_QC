import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Edit, Trash2, AlertTriangle, Search } from "lucide-react";
import type { Annotation, BoundingBox } from "@shared/schema";
import { getAnnotationCSSColor, getAnnotationIndex, getAnnotationHexColor, getAnnotationColor, getLowConfidenceIssue } from "./helpers/video-player-helpers";
import EditAnnotationModal from "./edit-annotation-modal";
import { getSignTypeById } from "@/data/sign-types";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/confidence-threshold";

interface AnnotationListProps {
  annotations: Annotation[];
  boundingBoxes: BoundingBox[];
  selectedAnnotationId?: string | null;
  isAddSignDrawingMode?: boolean;
  isFilteredMode?: boolean;
  onAnnotationSelect: (id: string | null) => void;
  onAnnotationUpdate: (id: string, updates: Partial<Annotation>) => void;
  onAnnotationDelete: (id: string) => void;
  onAddAnnotation: () => void;
  onShowFilteredSigns: () => void;
}

export default function AnnotationList({
  annotations,
  boundingBoxes,
  selectedAnnotationId,
  isAddSignDrawingMode = false,
  isFilteredMode = false,
  onAnnotationSelect,
  onAnnotationUpdate,
  onAnnotationDelete,
  onAddAnnotation,
  onShowFilteredSigns
}: AnnotationListProps) {
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);
  const selectedAnnotationRef = useRef<HTMLDivElement>(null);

  // Scroll to the selected annotation when it changes
  useEffect(() => {
    if (selectedAnnotationRef.current && selectedAnnotationId) {
      requestAnimationFrame(() => {
        selectedAnnotationRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      });
    }
  }, [selectedAnnotationId]);

  const formatCoordinate = (coord: number, isLat: boolean) => {
    const abs = Math.abs(coord);
    const direction = isLat ? (coord >= 0 ? 'N' : 'S') : (coord >= 0 ? 'E' : 'W');
    return `${abs.toFixed(4)}°${direction}`;
  };


  const sortedAnnotations = useMemo(() => {
      const startTimes = new Map<string, number>();

      for (const bbox of boundingBoxes) {
        const currentMin = startTimes.get(bbox.annotationId) ?? Number.POSITIVE_INFINITY;
        if (bbox.frameTimestampMs < currentMin) {
          startTimes.set(bbox.annotationId, bbox.frameTimestampMs);
        }
      }

      return [...annotations].sort((a, b) => {
        const aTime = startTimes.get(a.id) ?? Number.POSITIVE_INFINITY;
        const bTime = startTimes.get(b.id) ?? Number.POSITIVE_INFINITY;

        if (aTime === bTime) {
          return a.signType.localeCompare(b.signType);
        }
        return aTime - bTime;
      });
  }, [annotations, boundingBoxes]);

  return (
    // AJOUT: w-full pour qu'il s'adapte à son parent
    <div className="h-full w-full flex flex-col">
      
      {/* MODIFICATION: flex-wrap et gap-3 pour permettre de passer à la ligne sur les petits panneaux */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-medium">Signs</h3>
          <Button
            className={`h-8 px-3 text-sm font-medium text-white ${
              isAddSignDrawingMode ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'
            }`}
            onClick={onAddAnnotation}
          >
            {isAddSignDrawingMode ? 'Drawing on image… (click to cancel)' : 'Add New Signs'}
          </Button>
          <Button
            className={`h-8 px-3 text-sm font-medium text-white ${
              isAddSignDrawingMode ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'
            }`}
            onClick={onShowFilteredSigns}
          >
            {isFilteredMode ? 'Remove filtered signs' : 'Show filtered signs'}
          </Button>
        </div>
        
        {/* MODIFICATION: flex-wrap ici aussi au cas où il y a beaucoup de compteurs */}
        <div className="flex flex-wrap items-center gap-2">
          {(() => {
            const lowClassificationCount = annotations.filter(a => 
              a.classificationConfidence !== undefined && 
              a.classificationConfidence !== null && 
              a.classificationConfidence < LOW_CONFIDENCE_THRESHOLD
            ).length;
            const lowDetectionCount = annotations.filter(a => 
              a.detectionConfidence !== undefined && 
              a.detectionConfidence !== null && 
              a.detectionConfidence < LOW_CONFIDENCE_THRESHOLD
            ).length;
            const notIn122Count = annotations.filter(a => !a.belongsToList122).length;
          
            return (
              <>
                <span className={`text-xs px-2 py-1 rounded font-medium whitespace-nowrap ${lowClassificationCount > 0 ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'}`}>
                  ⚠️ Classif: {lowClassificationCount}
                </span>
                <span className={`text-xs px-2 py-1 rounded font-medium whitespace-nowrap ${lowDetectionCount > 0 ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'}`}>
                  ⚠️ Local: {lowDetectionCount}
                </span>
                <span className={`text-xs px-2 py-1 rounded font-medium whitespace-nowrap ${notIn122Count > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-muted text-muted-foreground'}`}>
                  ⚠️ Not in 127: {notIn122Count}
                </span>
              </>
            );
          })()}
          
          <span className="text-xs text-muted-foreground whitespace-nowrap">Total:</span>
          <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
            {annotations.length}
          </span>
        </div>
      </div>

      <div className="space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
        {annotations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No annotations yet</p>
          </div>
        ) : (
          sortedAnnotations.map((annotation) => {
            const annotationColor = getAnnotationColor(annotations, annotation.id);
            const signType = annotation.signType ? getSignTypeById(annotation.signType) : null;
            const lowConfidence = getLowConfidenceIssue(annotation, LOW_CONFIDENCE_THRESHOLD);
            const notIn122Count= !annotation.belongsToList122;
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
                onAnnotationSelect(annotation.id === selectedAnnotationId ? null : annotation.id);
              }}
            >
              {/* MODIFICATION: gap-2 et min-w-0 pour empêcher le texte de pousser les boutons */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-3 min-w-0 flex-1">
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
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {signType?.name ?? annotation.signType}
                      </p>
                      {lowConfidence.isLowConfidence && (
                        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      )}
                      {notIn122Count && <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-1 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="p-1 h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditingAnnotation(annotation);
                    }}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="p-1 h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAnnotationDelete(annotation.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground pl-9">
                {formatCoordinate(annotation.gpsLat, true)}, {formatCoordinate(annotation.gpsLon, false)}
              </div>
            </div>
            );
          })
        )}
      </div>

      {editingAnnotation && (
        <EditAnnotationModal
          annotation={editingAnnotation}
          onSave={(updates) => {
            onAnnotationUpdate(editingAnnotation.id, updates);
            setEditingAnnotation(null);
          }}
          onClose={() => setEditingAnnotation(null)}
        />
      )}
    </div>
  );
}