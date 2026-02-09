import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Upload, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface GpsUploadProps {
  videoId: string;
  onUploadComplete?: () => void;
  compact?: boolean;
  onClose?: () => void;
}

export default function GpsUpload({ videoId, onUploadComplete, compact = false, onClose }: GpsUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleGpsUpload = useCallback(async (file: File) => {
    if (!file || !videoId) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('gpsFile', file);
      formData.append('videoId', videoId);

      await apiRequest("POST", "/api/gps-data", formData);
      
      // Invalider les requêtes pour rafraîchir les données GPS
      queryClient.invalidateQueries({ queryKey: ["video-gps", videoId] });
      
      toast({
        title: "GPS data uploaded successfully",
        description: "GPS coordinates are now synchronized with video frames.",
      });

      if (onUploadComplete) {
        onUploadComplete();
      }
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Failed to upload GPS data. Please check the file format.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [videoId, toast, onUploadComplete]);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const files = Array.from(e.dataTransfer.files);
    const file = files[0];
    
    if (!file) return;

    if (file.name.endsWith('.csv') || file.name.endsWith('.json')) {
      handleGpsUpload(file);
    } else {
      toast({
        title: "Invalid file type",
        description: "Please upload a CSV or JSON file for GPS data.",
        variant: "destructive",
      });
    }
  }, [handleGpsUpload, toast]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
  }, []);

  const handleClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleGpsUpload(file);
    };
    input.click();
  }, [handleGpsUpload]);

  if (compact) {
    return (
      <div
        className={`flex items-center gap-3 p-3 border-2 border-dashed border-yellow-600/70 bg-yellow-500/10 rounded-lg cursor-pointer transition-all duration-300 hover:border-yellow-600 hover:bg-yellow-500/20 ${
          isUploading ? 'opacity-50 pointer-events-none' : ''
        }`}
        onDrop={handleFileDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        data-testid="gps-upload-compact"
      >
        <MapPin className="w-5 h-5 text-yellow-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {isUploading ? 'Uploading GPS data...' : 'No GPS data - Upload to enable annotation creation'}
          </p>
          <p className="text-xs text-muted-foreground">
            Click here or drag & drop a CSV or JSON file • You can view existing annotations without GPS
          </p>
        </div>
        {!isUploading && onClose && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 text-yellow-600 hover:text-yellow-700 hover:bg-yellow-500/20"
            onClick={(e) => {
              e.stopPropagation(); // Empêcher le clic de déclencher l'upload
              onClose();
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        {!onClose && <Upload className="w-4 h-4 text-yellow-600 flex-shrink-0" />}
      </div>
    );
  }

  return (
    <Card>
      <div
        className={`file-drop-zone p-6 text-center cursor-pointer flex flex-col items-center justify-center space-y-4 border-2 border-dashed border-border rounded-lg transition-all duration-300 hover:border-primary hover:bg-primary/5 ${
          isUploading ? 'opacity-50 pointer-events-none' : ''
        }`}
        onDrop={handleFileDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        data-testid="gps-upload-zone"
      >
        <MapPin className="w-12 h-12 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">
            {isUploading ? 'Uploading...' : 'Drop GPS file here'}
          </p>
          <p className="text-xs text-muted-foreground">
            or click to browse (CSV, JSON)
          </p>
        </div>
      </div>
    </Card>
  );
}
