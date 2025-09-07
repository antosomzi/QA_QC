import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import VideoPlayer from "@/components/video-player";
import MapPanel from "@/components/map-panel";
import AnnotationList from "@/components/annotation-list";
import FileUpload from "@/components/file-upload";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Video, GpsData, Annotation, AnnotationExport } from "@shared/schema";

export default function AnnotationTool() {
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const { toast } = useToast();

  // Fetch videos
  const { data: videos = [] } = useQuery<Video[]>({
    queryKey: ["/api/videos"],
  });

  // Fetch GPS data for selected video
  const { data: gpsData } = useQuery<GpsData>({
    queryKey: ["/api/gps-data/video", selectedVideoId],
    enabled: !!selectedVideoId,
  });

  // Fetch annotations for selected video
  const { data: annotations = [], refetch: refetchAnnotations } = useQuery<Annotation[]>({
    queryKey: ["/api/annotations/video", selectedVideoId],
    enabled: !!selectedVideoId,
  });

  const handleVideoUpload = useCallback((videoId: string) => {
    setSelectedVideoId(videoId);
    toast({
      title: "Video uploaded successfully",
      description: "You can now upload GPS data and start annotating.",
    });
  }, [toast]);

  const handleAnnotationCreate = useCallback(async (annotation: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!selectedVideoId) return;

    try {
      await apiRequest("POST", "/api/annotations", annotation);
      refetchAnnotations();
      toast({
        title: "Annotation created",
        description: "New annotation has been added to the video.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create annotation.",
        variant: "destructive",
      });
    }
  }, [selectedVideoId, refetchAnnotations, toast]);

  const handleAnnotationUpdate = useCallback(async (id: string, updates: Partial<Annotation>) => {
    try {
      await apiRequest("PUT", `/api/annotations/${id}`, updates);
      refetchAnnotations();
      toast({
        title: "Annotation updated",
        description: "Annotation has been successfully updated.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update annotation.",
        variant: "destructive",
      });
    }
  }, [refetchAnnotations, toast]);

  const handleAnnotationDelete = useCallback(async (id: string) => {
    try {
      await apiRequest("DELETE", `/api/annotations/${id}`);
      refetchAnnotations();
      toast({
        title: "Annotation deleted",
        description: "Annotation has been removed.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete annotation.",
        variant: "destructive",
      });
    }
  }, [refetchAnnotations, toast]);

  const handleExportAnnotations = useCallback(async () => {
    if (!selectedVideoId) return;

    try {
      const response = await fetch(`/api/annotations/export/${selectedVideoId}`);
      const data = await response.json();
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `annotations_${selectedVideoId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Export successful",
        description: "Annotations have been exported to JSON file.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export annotations.",
        variant: "destructive",
      });
    }
  }, [selectedVideoId, toast]);

  const handleImportAnnotations = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const data: AnnotationExport = JSON.parse(text);
      
      await apiRequest("POST", "/api/annotations/import", data);
      refetchAnnotations();
      
      toast({
        title: "Import successful",
        description: "Annotations have been imported successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to import annotations. Please check the file format.",
        variant: "destructive",
      });
    }
  }, [refetchAnnotations, toast]);

  const selectedVideo = videos.find(v => v.id === selectedVideoId);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-semibold text-foreground">Video Annotation Tool</h1>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <span className="w-2 h-2 bg-primary rounded-full"></span>
              <span>Ready</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportAnnotations(file);
                }}
                data-testid="input-import-json"
              />
              <Button variant="secondary" size="sm" asChild>
                <span data-testid="button-import-json">Import JSON</span>
              </Button>
            </label>
            <Button 
              onClick={handleExportAnnotations} 
              disabled={!selectedVideoId}
              size="sm"
              data-testid="button-export-json"
            >
              Export JSON
            </Button>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Left Panel - Video Player */}
        <div className="flex-1 bg-background border-r border-border">
          {!selectedVideo ? (
            <FileUpload onVideoUpload={handleVideoUpload} />
          ) : (
            <VideoPlayer
              video={selectedVideo}
              gpsData={gpsData}
              annotations={annotations}
              currentFrame={currentFrame}
              onFrameChange={setCurrentFrame}
              onAnnotationCreate={handleAnnotationCreate}
              selectedAnnotationId={selectedAnnotationId}
              onAnnotationSelect={setSelectedAnnotationId}
            />
          )}
        </div>

        {/* Right Panel - Map and Annotations */}
        <div className="w-2/5 bg-card border-l border-border flex flex-col">
          <div className="flex-1 relative">
            <MapPanel
              annotations={annotations}
              selectedAnnotationId={selectedAnnotationId}
              onAnnotationSelect={setSelectedAnnotationId}
              onMarkerMove={handleAnnotationUpdate}
            />
          </div>
          
          <div className="h-80 border-t border-border bg-background p-4">
            <AnnotationList
              annotations={annotations}
              selectedAnnotationId={selectedAnnotationId}
              onAnnotationSelect={setSelectedAnnotationId}
              onAnnotationUpdate={handleAnnotationUpdate}
              onAnnotationDelete={handleAnnotationDelete}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
