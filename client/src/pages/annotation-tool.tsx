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
import EditAnnotationModal from "@/components/edit-annotation-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Map, Video, X, Pencil, Check } from "lucide-react";
import { getCarPosition } from "@/lib/gps-utils";
import type { Video as VideoType, GpsData, Annotation, AnnotationWithBoundingBoxes, BoundingBox } from "@shared/schema";

type PendingAddSignBoundingBox = {
  frameIndex: number;
  frameTimestampMs: number;
  bboxX: number;
  bboxY: number;
  bboxWidth: number;
  bboxHeight: number;
};

export default function AnnotationTool() {
  const params = useParams();
  const folderId = params.folderId as string;
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [shouldZoomToSelection, setShouldZoomToSelection] = useState<boolean>(true);
  const [showGpsBanner, setShowGpsBanner] = useState<boolean>(true);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [viewMode, setViewMode] = useState<"video" | "map">("video");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isPlacementMode, setIsPlacementMode] = useState<boolean>(false);
  const [ghostMarkerPosition, setGhostMarkerPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [restoreAnnotation, setRestoreAnnotation] = useState<Annotation | null>(null);
  const [isAddSignDrawingMode, setIsAddSignDrawingMode] = useState<boolean>(false);
  const [pendingAddSignBoundingBox, setPendingAddSignBoundingBox] = useState<PendingAddSignBoundingBox | null>(null);
  const { toast } = useToast();
  const videoPlayerRef = useRef<VideoPlayerHandle | null>(null);
  const [isFilteredMode, setIsFilteredMode] = useState(false);

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

  // Fetch PTS data for VFR-safe frame navigation
  const { data: ptsData } = useQuery<number[] | null>({
    queryKey: ["video-pts", selectedVideo?.id],
    queryFn: async () => {
      if (!selectedVideo) return null;
      const response = await fetch(`/api/videos/${selectedVideo.id}/pts`);
      const data = await response.json();
      return data.ptsData ?? null;
    },
    enabled: !!selectedVideo,
  });

  // Fetch annotations with bounding boxes for selected folder
  const { data: annotationsWithBboxes = [], refetch: refetchAnnotations } = useQuery<AnnotationWithBoundingBoxes[]>({
    queryKey: ["folder-annotations-with-bboxes", folderId],
    queryFn: () => fetch(`/api/annotations/folder/${folderId}/with-bboxes`).then(res => res.json()),
  });

  // - false (default): hide filtered annotations
  // - true: show filtered + non-filtered annotations
  const annotations: Annotation[] = useMemo(() => {
    return annotationsWithBboxes
      .filter(annotation => isFilteredMode || annotation.isFiltered !== true)
      .map(({ boundingBoxes, ...annotation }) => annotation);
  }, [annotationsWithBboxes, isFilteredMode]);

  const boundingBoxes: BoundingBox[] = useMemo(() => {
    return annotationsWithBboxes
      .filter(annotation => isFilteredMode || annotation.isFiltered !== true)
      .flatMap(annotation => annotation.boundingBoxes);
  }, [annotationsWithBboxes, isFilteredMode]);

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
    if (id && isFilteredMode) {
      const selectedAnnotationData = annotationsWithBboxes.find(ann => ann.id === id);
      if (selectedAnnotationData?.isFiltered === true) {
        setShouldZoomToSelection(true);
        setSelectedAnnotationId(id);
        setRestoreAnnotation(selectedAnnotationData);
        return;
      }
    }

    setShouldZoomToSelection(true);
    setSelectedAnnotationId(id);
    // No frame navigation - stay on current frame
  }, [isFilteredMode, annotationsWithBboxes]);

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

     if (!window.confirm("Are you sure you want to delete this annotation? This action cannot be undone.")) {
      return;
    }
    
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
    annotationData: Pick<Annotation, 'folderId' | 'videoId' | 'signType' | 'gpsLat' | 'gpsLon'>,
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

  const handleRestoreSave = useCallback(async (updates: Partial<Annotation>) => {
    if (!restoreAnnotation) return;
    await handleAnnotationUpdate(restoreAnnotation.id, {
      ...updates,
      isFiltered: false,
    });
  }, [restoreAnnotation, handleAnnotationUpdate]);

  const handleRestoreClose = useCallback(() => {
    setRestoreAnnotation(null);
  }, []);

  const handleAddAnnotation = useCallback(() => {
    if (isAddSignDrawingMode) {
      setIsAddSignDrawingMode(false);
      setPendingAddSignBoundingBox(null);
      toast({
        title: "Add sign cancelled",
        description: "Bounding box drawing mode has been cancelled.",
      });
      return;
    }

    if (!selectedVideo) {
      toast({
        title: "No video loaded",
        description: "Load a video before adding a sign.",
        variant: "destructive",
      });
      return;
    }

    if (!gpsData) {
      toast({
        title: "No GPS data",
        description: "Cannot place sign without GPS data.",
        variant: "destructive",
      });
      return;
    }

    setPendingAddSignBoundingBox(null);
    setIsAddSignDrawingMode(true);
    toast({
      title: "Draw bounding box",
      description: "Draw a box on the current frame to continue sign creation.",
    });
  }, [gpsData, selectedVideo, toast, isAddSignDrawingMode]);

  const handleAddSignBoundingBoxDrawn = useCallback((boundingBoxData: PendingAddSignBoundingBox) => {
    if (!gpsData) {
      setIsAddSignDrawingMode(false);
      setPendingAddSignBoundingBox(null);
      return;
    }

    const frameForPlacement = Number.isFinite(boundingBoxData.frameIndex)
      ? boundingBoxData.frameIndex
      : currentFrame;

    const carPos = getCarPosition(gpsData, frameForPlacement, selectedVideo?.fps || 30);
    if (!carPos) {
      setIsAddSignDrawingMode(false);
      setPendingAddSignBoundingBox(null);
      return;
    }

    setPendingAddSignBoundingBox(boundingBoxData);
    setGhostMarkerPosition({ lat: carPos.lat, lon: carPos.lon });
    setIsAddSignDrawingMode(false);
    setIsPlacementMode(true);
  }, [gpsData, selectedVideo, currentFrame]);

  const handleSavePlacement = useCallback(() => {
    if (!ghostMarkerPosition) return;
    // Open the edit modal with the ghost marker position
    setShowEditModal(true);
  }, [ghostMarkerPosition]);

  const handleCancelPlacement = useCallback(() => {
    setIsPlacementMode(false);
    setGhostMarkerPosition(null);
    setPendingAddSignBoundingBox(null);
    setIsAddSignDrawingMode(false);
  }, []);

  const handleModalSave = useCallback(async (updates: Partial<Annotation>) => {
    if (!ghostMarkerPosition) return;

    try {
      const newAnnotationData = {
        folderId: folderId,
        videoId: selectedVideo?.id,
        signType: updates.signType ?? "",
        gpsLat: ghostMarkerPosition.lat,
        gpsLon: ghostMarkerPosition.lon,
        classificationConfidence: 1.0,
        detectionConfidence: 1.0,
      };

      const response = await apiRequest("POST", "/api/annotations", newAnnotationData);
      const createdAnnotation = await response.json();

      if (pendingAddSignBoundingBox) {
        await apiRequest("POST", "/api/bounding-boxes", {
          annotationId: createdAnnotation.id,
          ...pendingAddSignBoundingBox,
        });
      }

      refetchAnnotations();
      handleAnnotationListSelection(createdAnnotation.id);

      toast({
        title: "Annotation created",
        description: "New annotation has been added to the folder.",
      });

      setIsPlacementMode(false);
      setGhostMarkerPosition(null);
      setShowEditModal(false);
      setPendingAddSignBoundingBox(null);
      setIsAddSignDrawingMode(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create annotation.",
        variant: "destructive",
      });
    }
  }, [ghostMarkerPosition, folderId, selectedVideo, refetchAnnotations, toast, handleAnnotationListSelection, pendingAddSignBoundingBox]);

  const handleModalClose = useCallback(() => {
    setShowEditModal(false);
    setIsPlacementMode(false);
    setGhostMarkerPosition(null);
    setPendingAddSignBoundingBox(null);
    setIsAddSignDrawingMode(false);
  }, []);

      
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
    if (!window.confirm("Are you sure you want to delete this video? This action cannot be undone.")) {
      return;
    }

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

  const handleExportCSV = useCallback(async () => {
    try {
      const response = await fetch(`/api/annotations/export-csv/folder/${folderId}`);
      if (!response.ok) {
        throw new Error('Failed to export CSV');
      }
      
      const csvContent = await response.text();
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Get folder name for filename
      const folderResponse = await fetch(`/api/folders/${folderId}`);
      const folder = await folderResponse.json();
      const filename = folder.name.replace(/\s+/g, '_');
      a.download = `signs_${filename}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Export successful",
        description: "Signs have been exported to CSV file.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export signs as CSV.",
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

  // Folder rename
  const handleStartRename = useCallback(() => {
    if (folder) {
      setEditedName(folder.name);
      setIsEditingName(true);
    }
  }, [folder]);

  const handleConfirmRename = useCallback(async () => {
    if (!editedName.trim() || !folder) return;
    if (editedName.trim() === folder.name) {
      setIsEditingName(false);
      return;
    }
    try {
      await apiRequest("PUT", `/api/folders/${folderId}`, { name: editedName.trim() });
      // Refresh folder data
      queryClient.invalidateQueries({ queryKey: ["folder", folderId] });
      setIsEditingName(false);
      toast({ title: "Folder renamed" });
    } catch {
      toast({ title: "Error", description: "Failed to rename folder.", variant: "destructive" });
    }
  }, [editedName, folder, folderId, toast]);

  const onShowFilteredSigns = () => {
    setIsFilteredMode(prev => !prev);
  };

  return (
    <div className="h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4 pr-32">
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
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              {isEditingName ? (
                <span className="flex items-center gap-2">
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleConfirmRename();
                      if (e.key === "Escape") setIsEditingName(false);
                    }}
                    className="h-8 w-64 text-lg font-semibold"
                    autoFocus
                  />
                  <Button variant="ghost" size="sm" onClick={handleConfirmRename} className="h-8 w-8 p-0">
                    <Check className="w-4 h-4 text-green-600" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setIsEditingName(false)} className="h-8 w-8 p-0">
                    <X className="w-4 h-4 text-gray-400" />
                  </Button>
                </span>
              ) : (
                <span
                  className="cursor-pointer hover:text-blue-600 transition-colors group flex items-center gap-2"
                  onClick={handleStartRename}
                  title="Click to rename"
                >
                  {folder?.name || (viewMode === "video" ? "Video Annotation Tool" : "Map Annotation Tool")}
                  <Pencil className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </span>
              )}
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
              onClick={handleExportCSV}
              size="sm"
              data-testid="button-export-csv"
            >
              Export CSV
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
            {selectedVideo && !gpsData && showGpsBanner && (
              <div className="px-6 py-3 bg-card border-b border-border">
                <GpsUpload 
                  videoId={selectedVideo.id} 
                  onUploadComplete={() => refetchGpsData()}
                  compact={true}
                  onClose={() => setShowGpsBanner(false)}
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
                      ptsData={ptsData ?? undefined}
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
                      isFilteredMode={isFilteredMode}
                      isAddSignDrawingMode={isAddSignDrawingMode}
                      onAddSignBoundingBoxDrawn={handleAddSignBoundingBoxDrawn}
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
                      onAnnotationUpdate={handleAnnotationUpdate}
                      onAnnotationDelete={handleAnnotationDelete}
                      onCheckSign={() => {
                        videoPlayerRef.current?.toggleFullscreen();
                      }}
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
                <div className={`border-t border-border bg-background flex flex-col flex-shrink-0 h-[50vh]`}>
                  <div className="p-4 flex-1 min-h-0">
                    <AnnotationList
                      annotations={annotations}
                      boundingBoxes={boundingBoxes}
                      selectedAnnotationId={selectedAnnotationId}
                      onAnnotationSelect={handleAnnotationListSelection}
                      onAnnotationUpdate={handleAnnotationUpdate}
                      onAnnotationDelete={handleAnnotationDelete}
                      isAddSignDrawingMode={isAddSignDrawingMode}
                      onAddAnnotation={handleAddAnnotation}
                      isFilteredMode={isFilteredMode}
                      onShowFilteredSigns={onShowFilteredSigns}
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
              isFilteredMode={isFilteredMode}
              onAnnotationSelect={setSelectedAnnotationId}
              onAnnotationUpdate={handleAnnotationUpdate}
              onAnnotationDelete={handleAnnotationDelete}
              onAddAnnotation={handleAddAnnotation}
              onShowFilteredSigns={onShowFilteredSigns}
              onBackToVideoView={() => setViewMode("video")}
              carPosition={getCarPosition(gpsData, currentFrame, selectedVideo?.fps || 30)}
            />
          </div>
        )}
      </div>

      {/* Placement Mode Overlay - rendered on top of everything */}
      {isPlacementMode && (
        <>
          <MapOnlyView
            annotations={annotations}
            boundingBoxes={boundingBoxes}
            selectedAnnotationId={selectedAnnotationId}
            isFilteredMode={isFilteredMode}
            onAnnotationSelect={setSelectedAnnotationId}
            onAnnotationUpdate={handleAnnotationUpdate}
            onAnnotationDelete={handleAnnotationDelete}
            onAddAnnotation={handleAddAnnotation}
            onShowFilteredSigns={onShowFilteredSigns}
            onBackToVideoView={() => {}}
            carPosition={getCarPosition(gpsData, currentFrame, selectedVideo?.fps || 30)}
            isPlacementMode={true}
            ghostMarkerPosition={ghostMarkerPosition}
            onGhostMarkerChange={setGhostMarkerPosition}
          />
          {/* Placement Controls - rendered ABOVE the map (outside MapOnlyView to avoid z-index issues) */}
          <div className="fixed inset-0 z-[99998] pointer-events-none">
            {/* Top Bar - Title and Cancel */}
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancelPlacement}
                className="shadow-lg pointer-events-auto"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </div>

            {/* Bottom Right - Save Button */}
            <div className="absolute bottom-8 right-8 pointer-events-auto">
              <Button
                size="lg"
                onClick={handleSavePlacement}
                className="bg-green-600 hover:bg-green-700 text-white shadow-lg"
              >
                <Check className="w-5 h-5 mr-2" />
                Save Sign
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Edit Modal for creating new annotation */}
      {showEditModal && ghostMarkerPosition && (
        <EditAnnotationModal
          mode="create"
          initialGpsLat={ghostMarkerPosition.lat}
          initialGpsLon={ghostMarkerPosition.lon}
          onSave={handleModalSave}
          onClose={handleModalClose}
        />
      )}

      {/* Restore modal from filtered sign click in video player */}
      {restoreAnnotation && (
        <EditAnnotationModal
          annotation={restoreAnnotation}
          mode="edit"
          submitLabel="Restore"
          onSave={handleRestoreSave}
          onClose={handleRestoreClose}
        />
      )}
    </div>
  );
}