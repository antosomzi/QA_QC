import { useState, useCallback } from "react";
import MapPanel from "./map-panel";
import AnnotationList from "./annotation-list";
import { Button } from "@/components/ui/button";
import { Play, MapPin, List, ZoomIn, ZoomOut, X } from "lucide-react";
import type { Annotation, BoundingBox } from "@shared/schema";

interface MapOnlyViewProps {
  annotations: Annotation[];
  boundingBoxes: BoundingBox[];
  selectedAnnotationId?: string | null;
  onAnnotationSelect: (id: string | null) => void;
  onAnnotationUpdate: (id: string, updates: Partial<Annotation>) => void;
  onAnnotationDelete: (id: string) => void;
  onBackToVideoView: () => void;
}

export default function MapOnlyView({
  annotations,
  boundingBoxes,
  selectedAnnotationId,
  onAnnotationSelect,
  onAnnotationUpdate,
  onAnnotationDelete,
  onBackToVideoView,
}: MapOnlyViewProps) {
  const [showAnnotationsPanel, setShowAnnotationsPanel] = useState(true);
  const [shouldZoomToSelection, setShouldZoomToSelection] = useState<boolean>(true);

  // Function to handle selection from annotation list (with zoom)
  const handleAnnotationListSelection = useCallback((id: string | null) => {
    setShouldZoomToSelection(true);
    onAnnotationSelect(id);
  }, [onAnnotationSelect]);

  // Function to handle selection from map (without zoom)
  const handleMapSelection = useCallback((id: string | null) => {
    setShouldZoomToSelection(false);
    onAnnotationSelect(id);
  }, [onAnnotationSelect]);

  return (
    <div className="flex h-full w-full bg-background">
      {/* Main Map Area */}
      <div className="flex-1 relative">
        <div className="absolute inset-0">
          <MapPanel
            annotations={annotations}
            selectedAnnotationId={selectedAnnotationId}
            onAnnotationSelect={handleMapSelection}
            onMarkerMove={onAnnotationUpdate}
            shouldZoomToSelection={shouldZoomToSelection}
            useSatelliteView={true}
          />
        </div>
        
        {/* Map Controls */}
        <div className="absolute top-4 right-4 flex flex-col space-y-2 z-10">
          <Button 
            size="sm" 
            variant="secondary" 
            className="w-10 h-10 p-0 rounded-full shadow-lg"
            onClick={() => {
              console.log("Zoom in clicked");
            }}
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button 
            size="sm" 
            variant="secondary" 
            className="w-10 h-10 p-0 rounded-full shadow-lg"
            onClick={() => {
              console.log("Zoom out clicked");
            }}
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
        </div>
        
        {/* Annotation Summary */}
        <div className="absolute bottom-4 left-4 bg-card/80 backdrop-blur-sm rounded-lg p-3 shadow-md border border-border z-10">
          <div className="flex items-center space-x-2">
            <div className="text-sm font-medium text-foreground">
              Annotations: {annotations.length}
            </div>
            {selectedAnnotationId && (
              <div className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
                {annotations.find(a => a.id === selectedAnnotationId)?.signType || "Selected"}
              </div>
            )}
          </div>
        </div>
        
        {/* Toggle Annotations Panel Button */}
        <Button
          variant="secondary"
          size="sm"
          className="absolute top-4 left-4 rounded-full shadow-lg z-10"
          onClick={() => setShowAnnotationsPanel(!showAnnotationsPanel)}
        >
          {showAnnotationsPanel ? <X className="w-4 h-4" /> : <List className="w-4 h-4" />}
        </Button>
      </div>
      
      {/* Right Panel - Annotations */}
      {showAnnotationsPanel && (
        <div className="w-80 bg-card border-l border-border flex flex-col h-full">
          <div className="p-4 border-b border-border flex-shrink-0">
            <h3 className="text-lg font-semibold">Annotations</h3>
            <p className="text-sm text-muted-foreground">{annotations.length} items</p>
          </div>
          <div className="flex-1 overflow-hidden p-4">
            <div className="h-[70vh] overflow-y-auto rounded-lg border border-border">
              <div className="p-4 space-y-2">
                <AnnotationList
                  annotations={annotations}
                  boundingBoxes={boundingBoxes}
                  selectedAnnotationId={selectedAnnotationId}
                  onAnnotationSelect={handleAnnotationListSelection}
                  onAnnotationUpdate={onAnnotationUpdate}
                  onAnnotationDelete={onAnnotationDelete}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}