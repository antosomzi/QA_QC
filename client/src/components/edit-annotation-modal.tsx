import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const [label, setLabel] = useState(annotation.label);
  const [signType, setSignType] = useState(annotation.signType || undefined);
  const [gpsLat, setGpsLat] = useState(annotation.gpsLat);
  const [gpsLon, setGpsLon] = useState(annotation.gpsLon);

  const handleSave = () => {
    const updates: Partial<Annotation> = {
      label,
      signType,
      gpsLat,
      gpsLon,
    };
    
    onSave(updates);
    onClose();
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
        
        <div>
          <SignTypeSelector
            value={signType}
            onValueChange={setSignType}
            placeholder="Select a sign type (optional)"
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
