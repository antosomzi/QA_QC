import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import type { Annotation } from "@shared/schema";
import SignTypeSelector from "./sign-type-selector";

interface EditAnnotationModalProps {
  annotation: Annotation;
  onSave: (updates: Partial<Annotation>) => void;
  onClose: () => void;
}

export default function EditAnnotationModal({
  annotation,
  onSave,
  onClose
}: EditAnnotationModalProps) {
  const [signType, setSignType] = useState<string>(annotation.signType);
  const [gpsLat, setGpsLat] = useState(annotation.gpsLat);
  const [gpsLon, setGpsLon] = useState(annotation.gpsLon);

  const handleSave = () => {
    const updates: Partial<Annotation> = {
      signType,
      gpsLat,
      gpsLon,
    };

    onSave(updates);
    onClose();
  };

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div 
        className="bg-background rounded-lg shadow-lg w-96 p-6 relative z-[100000]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-lg font-semibold mb-4">Edit Annotation</h2>

        <div className="space-y-4">
          <div>
            <SignTypeSelector
              value={signType}
              onValueChange={(value) => { if (value !== undefined) setSignType(value) }}
              placeholder="Select a sign type..."
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
      </div>
    </div>
  );
}
