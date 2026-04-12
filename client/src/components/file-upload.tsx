import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Video } from "lucide-react";
import GpsUpload from "@/components/gps-upload";
import UploadProgressModal from "@/components/upload-progress-modal";
import { useVideoUploadWithProgress } from "@/components/helpers/upload-video-helper";

interface FileUploadProps {
  onVideoUpload: (videoId: string) => void;
  folderId?: string;
}

export default function FileUpload({ onVideoUpload, folderId }: FileUploadProps) {
  const [uploadedVideoId, setUploadedVideoId] = useState<string | null>(null);
  const { toast } = useToast();
  const {
    isUploading,
    uploadProgress,
    isProgressModalOpen,
    statusText,
    uploadVideo,
  } = useVideoUploadWithProgress({
    folderId,
    onProgressError: () => {
      toast({
        title: "Upload failed",
        description: "An error occurred while uploading the video.",
        variant: "destructive",
      });
    },
  });

  const handleVideoUpload = useCallback(async (file: File) => {
    if (!file) return;
    if (!folderId) {
      toast({
        title: "Upload failed",
        description: "Missing folder context for upload.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { videoId } = await uploadVideo(file);
      setUploadedVideoId(videoId);
      onVideoUpload(videoId);
      
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
    }
  }, [onVideoUpload, toast, folderId, uploadVideo]);



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
    <>
      <UploadProgressModal
        open={isProgressModalOpen}
        progress={uploadProgress}
        statusText={statusText}
      />

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
    </>
  );
}