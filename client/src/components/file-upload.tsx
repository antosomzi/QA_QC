import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Video } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import GpsUpload from "@/components/gps-upload";

interface FileUploadProps {
  onVideoUpload: (videoId: string) => void;
  folderId?: string;
}

export default function FileUpload({ onVideoUpload, folderId }: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedVideoId, setUploadedVideoId] = useState<string | null>(null);
  const { toast } = useToast();

  const handleVideoUpload = useCallback(async (file: File) => {
    if (!file) return;

    setIsUploading(true);
    try {
      // Get video metadata
      const video = document.createElement('video');
      video.preload = 'metadata';
      
      const getVideoMetadata = (): Promise<{ duration: number; width: number; height: number }> => {
        return new Promise((resolve, reject) => {
          video.onloadedmetadata = () => {
            resolve({
              duration: video.duration,
              width: video.videoWidth,
              height: video.videoHeight,
            });
          };
          
          video.onerror = () => {
            reject(new Error("Failed to load video metadata"));
          };
          
          video.src = URL.createObjectURL(file);
        });
      };

      const metadata = await getVideoMetadata();
      URL.revokeObjectURL(video.src);

      // Upload video file
      const formData = new FormData();
      formData.append('video', file);
      formData.append('duration', metadata.duration.toString());
      formData.append('fps', '30'); // Default FPS, can be detected from video
      formData.append('width', metadata.width.toString());
      formData.append('height', metadata.height.toString());
      
      // Determine the upload endpoint based on whether we have a folderId
      const uploadEndpoint = folderId 
        ? `/api/folders/${folderId}/videos` 
        : "/api/videos";
        
      const response = await apiRequest("POST", uploadEndpoint, formData);
      console.log("Received response:", response);
      const videoData = await response.json();
      
      setUploadedVideoId(videoData.id);
      onVideoUpload(videoData.id);
      
      toast({
        title: "Video uploaded successfully",
        description: "You can now upload GPS data and start annotating.",
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload video file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [onVideoUpload, toast, folderId]);



  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const files = Array.from(e.dataTransfer.files);
    const file = files[0];
    
    if (!file) return;

    if (file.type.startsWith('video/')) {
      handleVideoUpload(file);
    } else {
      toast({
        title: "Invalid file type",
        description: "Please upload a video file (MP4, AVI, MOV, etc.)",
        variant: "destructive",
      });
    }
  }, [handleVideoUpload, toast]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
  }, []);

  return (
    <div className="p-6 border-b border-border bg-card/50 h-full flex flex-col">
      <h2 className="text-lg font-medium mb-4">Upload Files</h2>
      <div className="flex-1 flex flex-col gap-4">
        {/* Video Upload */}
        <Card className={uploadedVideoId ? "flex-shrink-0" : "flex-1"}>
          <CardContent className="p-0 h-full">
            <div
              className={`file-drop-zone h-full p-6 text-center cursor-pointer flex flex-col items-center justify-center space-y-4 border-2 border-dashed border-border rounded-lg transition-all duration-300 hover:border-primary hover:bg-primary/5 ${
                isUploading ? 'opacity-50 pointer-events-none' : ''
              }`}
              onDrop={handleFileDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'video/*';
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handleVideoUpload(file);
                };
                input.click();
              }}
              data-testid="video-upload-zone"
            >
              <Video className="w-12 h-12 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  {isUploading ? 'Uploading...' : 'Drop video file here'}
                </p>
                <p className="text-xs text-muted-foreground">
                  or click to browse (MP4, AVI, MOV)
                </p>
              </div>
              {uploadedVideoId && (
                <div className="text-xs text-primary">
                  ✓ Video uploaded successfully
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* GPS Upload - only show after video upload */}
        {uploadedVideoId && (
          <div className="flex-1">
            <h3 className="text-sm font-medium mb-2 text-muted-foreground">Optional: Upload GPS data to enable annotation creation</h3>
            <GpsUpload videoId={uploadedVideoId} />
          </div>
        )}
      </div>
      
      <div className="mt-6 text-sm text-muted-foreground">
        <p className="mb-2"><strong>Instructions:</strong></p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Upload a video file (MP4, AVI, MOV formats supported)</li>
          <li>Optionally upload GPS data file (CSV format: timestamp,lat,lon or JSON) to enable annotation creation</li>
          <li>You can view imported annotations without GPS data</li>
          <li>To create new annotations, GPS data is required</li>
        </ol>
      </div>
    </div>
  );
}