import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Link } from "wouter";
import VideoPlayer, { type VideoPlayerHandle } from "@/components/video-player";
import MapPanel from "@/components/map-panel";
import AnnotationList from "@/components/annotation-list";
import BoundingBoxList from "@/components/bounding-box-list";
import FileUpload from "@/components/file-upload";
import GpsUpload from "@/components/gps-upload";
import MapOnlyView from "@/components/map-only-view";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Map, Video } from "lucide-react";
import type { Video as VideoType, GpsData, Annotation, AnnotationWithBoundingBoxes, BoundingBox } from "@shared/schema";

export default function AnnotationTool() {
  const params = useParams();
  const folderId = params.folderId as string;
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [shouldZoomToSelection, setShouldZoomToSelection] = useState<boolean>(true);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [viewMode, setViewMode] = useState<"video" | "map">("video");
  const { toast } = useToast();
  const videoPlayerRef = useRef<VideoPlayerHandle | null>(null);

  // Fetch folder data to get project ID for back navigation
  const { data: folder } = useQuery({
    queryKey: ["folder", folderId],
    queryFn: () => fetch(`/api/folders/${folderId}`).then(res => res.json())
  });

  // Fetch videos for this folder
  const { data: videos = [], refetch: refetchVideos } = useQuery<VideoType[]>({
    queryKey: ["folder-videos", folderId],
    queryFn: () => fetch(`/api/folders/${folderId}/videos`).then(res => res.json())
  });

  // Set the selected video (since folder has only one video)
  const selectedVideo = videos.length > 0 ? videos[0] : null;

  // Fetch GPS data for selected video
  const { data: gpsData, error: gpsDataError, refetch: refetchGpsData } = useQuery<GpsData | null>({
    queryKey: ["video-gps", selectedVideo?.id],
    queryFn: async () => {
      if (!selectedVideo) return null;
      const response = await fetch(`/api/gps-data/video/${selectedVideo.id}`);
      const data = await response.json();
      // Si c'est un message d'erreur, on le traite comme une erreur
      if (data.message && data.message.includes('not found')) {
        return null; // Retourner null au lieu de throw pour permettre le mode visualisation
      }
      return data;
    },
    enabled: !!selectedVideo,
  });

  // Fetch annotations with bounding boxes for selected folder
  const { data: annotationsWithBboxes = [], refetch: refetchAnnotations } = useQuery<AnnotationWithBoundingBoxes[]>({
    queryKey: ["folder-annotations-with-bboxes", folderId],
    queryFn: () => fetch(`/api/annotations/folder/${folderId}/with-bboxes`).then(res => res.json()),
  });

  // Extract annotations and bounding boxes from the combined data
  const annotations: Annotation[] = useMemo(() => {
    return annotationsWithBboxes.map(({ boundingBoxes, ...annotation }) => annotation);
  }, [annotationsWithBboxes]);
  
  const boundingBoxes: BoundingBox[] = useMemo(() => {
    return annotationsWithBboxes.flatMap(annotation => annotation.boundingBoxes);
  }, [annotationsWithBboxes]);

  // Get the selected annotation object
  const selectedAnnotation = useMemo(() => {
    return selectedAnnotationId ? annotations.find(ann => ann.id === selectedAnnotationId) : null;
  }, [annotations, selectedAnnotationId]);

  // Function to handle selection from annotation list (with zoom and video navigation)
  const navigateToFrame = useCallback((frame: number) => {
    setCurrentFrame(frame);
    videoPlayerRef.current?.seekToFrame(frame);
  }, []);

  const handleAnnotationListSelection = useCallback((id: string | null) => {
    setShouldZoomToSelection(true);
    setSelectedAnnotationId(id);
    
    // Navigate video to the first bounding box frame of the selected annotation
    if (id) {
      const selectedAnnotationData = annotationsWithBboxes.find(ann => ann.id === id);
      if (selectedAnnotationData && selectedAnnotationData.boundingBoxes.length > 0) {
        // Sort bounding boxes by frame index and get the first one
        const sortedBoundingBoxes = [...selectedAnnotationData.boundingBoxes].sort((a, b) => a.frameIndex - b.frameIndex);
        const firstBoundingBox = sortedBoundingBoxes[0];
        
        // Navigate to the frame of the first bounding box
        navigateToFrame(firstBoundingBox.frameIndex);
      }
    }
  }, [annotationsWithBboxes, navigateToFrame]);

  // Function to handle selection from video player (without frame navigation)
  const handleVideoPlayerSelection = useCallback((id: string | null) => {
    setShouldZoomToSelection(true);
    setSelectedAnnotationId(id);
    // No frame navigation - stay on current frame
  }, []);

  // Function to handle selection from map (without zoom but with video navigation)
  const handleMapSelection = useCallback((id: string | null) => {
    setShouldZoomToSelection(false);
    setSelectedAnnotationId(id);
    
    // Navigate video to the first bounding box frame of the selected annotation
    if (id) {
      const selectedAnnotationData = annotationsWithBboxes.find(ann => ann.id === id);
      if (selectedAnnotationData && selectedAnnotationData.boundingBoxes.length > 0) {
        // Sort bounding boxes by frame index and get the first one
        const sortedBoundingBoxes = [...selectedAnnotationData.boundingBoxes].sort((a, b) => a.frameIndex - b.frameIndex);
        const firstBoundingBox = sortedBoundingBoxes[0];
        
        // Navigate to the frame of the first bounding box
        navigateToFrame(firstBoundingBox.frameIndex);
      }
    }
  }, [annotationsWithBboxes, navigateToFrame]);

  const handleVideoUpload = useCallback((videoId: string) => {
    toast({
      title: "Video uploaded successfully",
      description: "You can now upload GPS data and start annotating.",
    });
    // Rafraîchir la liste des vidéos du dossier
    refetchVideos();
  }, [toast, refetchVideos]);

  const handleVideoDelete = useCallback(async () => {
    if (!selectedVideo) return;
    
    try {
      await apiRequest("DELETE", `/api/videos/${selectedVideo.id}`);
      
      // Forcer le refetch immédiat des vidéos
      await refetchVideos();
      
      toast({
        title: "Video deleted",
        description: "Video and associated GPS data have been removed.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete video.",
        variant: "destructive",
      });
    }
  }, [selectedVideo, refetchVideos, toast]);

  const handleAnnotationCreate = useCallback(async (
    annotationData: Pick<Annotation, 'folderId' | 'videoId' | 'label' | 'gpsLat' | 'gpsLon'>,
    boundingBoxData: {
      frameIndex: number;
      frameTimestampMs: number;
      bboxX: number;
      bboxY: number;
      bboxWidth: number;
      bboxHeight: number;
    }
  ) => {
    try {
      // Create the annotation (object)
      const response = await apiRequest("POST", "/api/annotations", annotationData);
      const createdAnnotation = await response.json();
      
      // Create the bounding box for this frame
      const fullBoundingBoxData = {
        annotationId: createdAnnotation.id,
        ...boundingBoxData
      };
      
      // Create the bounding box
      await apiRequest("POST", "/api/bounding-boxes", fullBoundingBoxData);
      
      refetchAnnotations();
      
      // Select the newly created annotation with zoom (like from annotation list)
      handleAnnotationListSelection(createdAnnotation.id);
      
      toast({
        title: "Annotation created",
        description: "New annotation has been added to the folder.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create annotation.",
        variant: "destructive",
      });
    }
  }, [refetchAnnotations, toast, handleAnnotationListSelection]);

  const handleBoundingBoxCreate = useCallback(async (
    annotationId: string,
    boundingBoxData: {
      frameIndex: number;
      frameTimestampMs: number;
      bboxX: number;
      bboxY: number;
      bboxWidth: number;
      bboxHeight: number;
    }
  ) => {
    try {
      // Create the bounding box for the existing annotation
      const fullBoundingBoxData = {
        annotationId,
        ...boundingBoxData
      };
      
      // Create the bounding box
      await apiRequest("POST", "/api/bounding-boxes", fullBoundingBoxData);
      
      // Invalidate the query to trigger automatic refetch
      queryClient.invalidateQueries({ 
        queryKey: ["folder-annotations-with-bboxes", folderId] 
      });
      
      toast({
        title: "Bounding box added",
        description: "New bounding box has been added to the annotation.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create bounding box.",
        variant: "destructive",
      });
    }
  }, [folderId, toast, queryClient]);

  const handleBoundingBoxDelete = useCallback(async (id: string) => {
    try {
      await apiRequest("DELETE", `/api/bounding-boxes/${id}`);
      
      // Invalidate the query to trigger automatic refetch
      queryClient.invalidateQueries({ 
        queryKey: ["folder-annotations-with-bboxes", folderId] 
      });
      
      toast({
        title: "Bounding box deleted",
        description: "Bounding box has been removed.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete bounding box.",
        variant: "destructive",
      });
    }
  }, [folderId, toast, queryClient]);

  const handleFrameNavigate = useCallback((frame: number) => {
    navigateToFrame(frame);
  }, [navigateToFrame]);

  const handleAnnotationUpdate = useCallback(async (id: string, updates: Partial<Annotation>) => {
    try {
      // Get current data from the cache to avoid stale closures
      const currentAnnotationsWithBboxes = queryClient.getQueryData<AnnotationWithBoundingBoxes[]>(
        ["folder-annotations-with-bboxes", folderId]
      ) || [];
      
      // Optimistic update: Update local data immediately
      const optimisticAnnotations = currentAnnotationsWithBboxes.map(ann => 
        ann.id === id ? { ...ann, ...updates } : ann
      );
      
      // Update the cache optimistically
      queryClient.setQueryData(["folder-annotations-with-bboxes", folderId], optimisticAnnotations);

      // Make the API call
      await apiRequest("PUT", `/api/annotations/${id}`, updates);
      
      toast({
        title: "Annotation updated",
        description: "Annotation has been successfully updated.",
      });
    } catch (error) {
      // On error, refetch to restore correct state
      refetchAnnotations();
      toast({
        title: "Error",
        description: "Failed to update annotation.",
        variant: "destructive",
      });
    }
  }, [folderId, refetchAnnotations, toast, queryClient]);

  const handleBoundingBoxUpdate = useCallback(async (id: string, updates: Partial<BoundingBox>) => {
    try {
      // Get current data from the cache to avoid stale closures
      const currentAnnotationsWithBboxes = queryClient.getQueryData<AnnotationWithBoundingBoxes[]>(
        ["folder-annotations-with-bboxes", folderId]
      ) || [];
      
      // Optimistic update: only update the specific bounding box
      const optimisticAnnotations = currentAnnotationsWithBboxes.map(ann => {
        const hasBboxToUpdate = ann.boundingBoxes.some(bbox => bbox.id === id);
        if (!hasBboxToUpdate) {
          return ann; // Return same reference if no change needed
        }
        
        return {
          ...ann,
          boundingBoxes: ann.boundingBoxes.map(bbox => 
            bbox.id === id ? { ...bbox, ...updates } : bbox
          )
        };
      });
      
      // Update the cache optimistically
      queryClient.setQueryData(["folder-annotations-with-bboxes", folderId], optimisticAnnotations);

      // Make the API call
      await apiRequest("PUT", `/api/bounding-boxes/${id}`, updates);
      
      toast({
        title: "Bounding box updated",
        description: "Bounding box has been successfully updated.",
      });
    } catch (error) {
      // On error, refetch to restore correct state
      refetchAnnotations();
      toast({
        title: "Error",
        description: "Failed to update bounding box.",
        variant: "destructive",
      });
    }
  }, [folderId, refetchAnnotations, toast, queryClient]);

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
    try {
      const response = await fetch(`/api/annotations/export/folder/${folderId}`);
      const data = await response.json();
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Utiliser le nom du dossier pour le fichier d'export
      const folderResponse = await fetch(`/api/folders/${folderId}`);
      const folder = await folderResponse.json();
      const filename = folder.name.replace(/\s+/g, '_');
      a.download = `annotations_${filename}.json`;
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
  }, [folderId, toast]);

  const handleDeleteAllAnnotations = useCallback(async () => {
    if (window.confirm("Are you sure you want to delete ALL annotations in this folder? This action cannot be undone.")) {
      try {
        await apiRequest("DELETE", `/api/annotations/folder/${folderId}`);
        refetchAnnotations(); // Refresh the annotations list

        toast({
          title: "Success",
          description: "All annotations have been deleted successfully.",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete annotations.",
          variant: "destructive",
        });
      }
    }
  }, [folderId, refetchAnnotations, toast]);

  const handleImportAnnotations = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      await apiRequest("POST", `/api/annotations/import/folder/${folderId}`, data);
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
  }, [folderId, refetchAnnotations, toast]);

  // Functions to handle view mode changes
  const toggleViewMode = () => {
    setViewMode(viewMode === "video" ? "map" : "video");
  };

  return (
    <div className="h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {viewMode === "video" ? (
              folder ? (
                folder.projectId ? (
                  <Link to={`/project/${folder.projectId}`}>
                    <Button variant="outline" size="sm">
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back to Folders
                    </Button>
                  </Link>
                ) : null
              ) : (
                // Show a disabled back button while loading
                <Button variant="outline" size="sm" disabled>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Folders
                </Button>
              )
            ) : (
              <Button 
                onClick={toggleViewMode}
                variant="outline" 
                size="sm"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Video View
              </Button>
            )}
            <h1 className="text-xl font-semibold text-foreground">
              {viewMode === "video" ? "Video Annotation Tool" : "Map Annotation Tool"}
            </h1>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <span className="w-2 h-2 bg-primary rounded-full"></span>
              <span>Ready</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {viewMode === "video" && (
              <Button 
                onClick={toggleViewMode}
                size="sm"
                variant="outline"
                data-testid="button-toggle-view"
              >
                <Map className="w-4 h-4 mr-2" />
                Map View
              </Button>
            )}
            
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
              size="sm"
              data-testid="button-export-json"
            >
              Export JSON
            </Button>
            <Button
              onClick={handleDeleteAllAnnotations}
              size="sm"
              variant="destructive"
              data-testid="button-delete-all-annotations"
            >
              Clear All Signs
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {viewMode === "video" ? (
          <div className="flex h-[calc(100vh-80px)] flex-col">
            {/* GPS Upload Banner - show if video exists but no GPS data */}
            {selectedVideo && !gpsData && (
              <div className="px-6 py-3 bg-card border-b border-border">
                <GpsUpload 
                  videoId={selectedVideo.id} 
                  onUploadComplete={() => refetchGpsData()}
                  compact={true}
                />
              </div>
            )}
            
            <div className="flex flex-1 min-h-0">
              {/* Left Panel - Video Player and Bounding Box List */}
              <div className="flex-1 bg-background border-r border-border flex flex-col">
                {/* Video Player - use calculated height to leave space for BoundingBoxList */}
                <div style={{ height: 'calc(100% - 19vh)' }}>
                  {selectedVideo ? (
                    <VideoPlayer
                      video={selectedVideo}
                      gpsData={gpsData ?? undefined}
                      annotations={annotations}
                      boundingBoxes={boundingBoxes}
                      currentFrame={currentFrame}
                      onFrameChange={setCurrentFrame}
                      onAnnotationCreate={handleAnnotationCreate}
                      onBoundingBoxCreate={handleBoundingBoxCreate}
                      onAnnotationUpdate={handleAnnotationUpdate}
                      onBoundingBoxUpdate={handleBoundingBoxUpdate}
                      selectedAnnotationId={selectedAnnotationId}
                      onAnnotationSelect={handleVideoPlayerSelection}
                      onVideoDelete={handleVideoDelete}
                      folderId={folderId}
                      ref={videoPlayerRef}
                    />
                  ) : (
                    <FileUpload onVideoUpload={handleVideoUpload} folderId={folderId} />
                  )}
                </div>
                
                {/* Bounding Box List - only show when video is loaded */}
                {selectedVideo && (
                  <div className="h-[19vh] border-t border-border bg-card flex-shrink-0">
                    <BoundingBoxList
                      annotation={selectedAnnotation ?? null}
                      boundingBoxes={boundingBoxes}
                      currentFrame={currentFrame}
                      videoFps={selectedVideo.fps ?? undefined}
                      onFrameNavigate={handleFrameNavigate}
                      onBoundingBoxDelete={handleBoundingBoxDelete}
                      onAnnotationUpdate={handleAnnotationUpdate}
                    />
                  </div>
                )}
              </div>

              {/* Right Panel - Map and Annotations */}
              <div className="w-2/5 bg-card border-l border-border flex flex-col">
              <div className="flex-1 relative">
                <MapPanel
                  annotations={annotations}
                  selectedAnnotationId={selectedAnnotationId}
                  onAnnotationSelect={handleMapSelection}
                  onMarkerMove={handleAnnotationUpdate}
                  shouldZoomToSelection={shouldZoomToSelection}
                />
              </div>
              
                {/* AnnotationList - larger than BoundingBoxList */}
                <div className={`border-t border-border bg-background flex flex-col flex-shrink-0 h-[35vh]`}>
                  <div className="p-4 flex-1 min-h-0">
                    <AnnotationList
                      annotations={annotations}
                      boundingBoxes={boundingBoxes}
                      selectedAnnotationId={selectedAnnotationId}
                      onAnnotationSelect={handleAnnotationListSelection}
                      onAnnotationUpdate={handleAnnotationUpdate}
                      onAnnotationDelete={handleAnnotationDelete}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 h-0">
            <MapOnlyView
              annotations={annotations}
              boundingBoxes={boundingBoxes}
              selectedAnnotationId={selectedAnnotationId}
              onAnnotationSelect={setSelectedAnnotationId}
              onAnnotationUpdate={handleAnnotationUpdate}
              onAnnotationDelete={handleAnnotationDelete}
              onBackToVideoView={() => setViewMode("video")}
            />
          </div>
        )}
      </div>
    </div>
  );
}