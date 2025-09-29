import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Edit, Trash2 } from "lucide-react";
import type { Annotation } from "@shared/schema";
import { getAnnotationCSSColor, getAnnotationIndex, getAnnotationHexColor, getAnnotationColor } from "./helpers/video-player-helpers";

interface AnnotationListProps {
  annotations: Annotation[];
  selectedAnnotationId?: string | null;
  onAnnotationSelect: (id: string | null) => void;
  onAnnotationUpdate: (id: string, updates: Partial<Annotation>) => void;
  onAnnotationDelete: (id: string) => void;
}

interface EditModalProps {
  annotation: Annotation;
  onSave: (updates: Partial<Annotation>) => void;
  onClose: () => void;
}

function EditAnnotationModal({ annotation, onSave, onClose }: EditModalProps) {
  const [label, setLabel] = useState(annotation.label);
  const [gpsLat, setGpsLat] = useState(annotation.gpsLat);
  const [gpsLon, setGpsLon] = useState(annotation.gpsLon);

  const handleSave = () => {
    const updates: Partial<Annotation> = {
      label,
      gpsLat,
      gpsLon,
    };
    
    onSave(updates);
    onClose();
  };

  const formatTimestamp = (timestampMs: number) => {
    const totalSeconds = Math.floor(timestampMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <DialogContent className="w-96">
      <DialogHeader>
        <DialogTitle>Edit Annotation</DialogTitle>
      </DialogHeader>
      
      <div className="space-y-4">
        <div>
          <Label htmlFor="label">Label</Label>
          <Input
            id="label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            data-testid="input-annotation-label"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="lat">Latitude</Label>
            <Input
              id="lat"
              type="number"
              step="0.00001"
              value={gpsLat}
              onChange={(e) => setGpsLat(parseFloat(e.target.value))}
              data-testid="input-gps-lat"
            />
          </div>
          <div>
            <Label htmlFor="lon">Longitude</Label>
            <Input
              id="lon"
              type="number"
              step="0.00001"
              value={gpsLon}
              onChange={(e) => setGpsLon(parseFloat(e.target.value))}
              data-testid="input-gps-lon"
            />
          </div>
        </div>
        
        <div className="flex justify-end space-x-3 mt-6">
          <Button onClick={onClose} variant="secondary" data-testid="button-cancel-edit">
            Cancel
          </Button>
          <Button onClick={handleSave} data-testid="button-save-annotation">
            Save Changes
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

export default function AnnotationList({
  annotations,
  selectedAnnotationId,
  onAnnotationSelect,
  onAnnotationUpdate,
  onAnnotationDelete,
}: AnnotationListProps) {
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);

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

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium">Annotations</h3>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-muted-foreground">Total:</span>
          <span 
            className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded"
            data-testid="text-annotation-count"
          >
            {annotations.length}
          </span>
        </div>
      </div>
      
      <div className="space-y-2 overflow-y-auto flex-1">
        {annotations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No annotations yet</p>
            <p className="text-xs mt-1">Draw bounding boxes on the video to create annotations</p>
          </div>
        ) : (
          annotations.map((annotation) => {
            const annotationColor = getAnnotationColor(annotations, annotation.id);
            return (
            <div
              key={annotation.id}
              className={`bg-card p-3 rounded-md border border-border hover:bg-accent/50 cursor-pointer transition-colors ${
                annotation.id === selectedAnnotationId ? 'ring-2 ring-primary' : ''
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
                  <div 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: annotationColor }}
                  ></div>
                  <div>
                    <p className="text-sm font-medium" data-testid={`text-annotation-label-${annotation.id}`}>
                      {annotation.label}
                    </p>
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
                        annotation={editingAnnotation}
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
    </>
  );
}
