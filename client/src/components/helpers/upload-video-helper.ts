import { useCallback, useState } from "react";

type UploadVideoOptions = {
  file: File;
  folderId?: string;
  projectId?: string;
  onProgress?: (percent: number) => void;
};

type UploadVideoResult = {
  videoId: string;
  payload: unknown;
};

type UseVideoUploadWithProgressOptions = {
  folderId?: string;
  projectId?: string;
  onProgressError?: () => void;
  onSuccess?: () => void;
};

export async function uploadVideoWithContext({ file, folderId, projectId, onProgress }: UploadVideoOptions): Promise<UploadVideoResult> {
  if (!folderId && !projectId) {
    throw new Error("Missing folderId or projectId for video upload");
  }

  // On crée le FormData et on y met UNIQUEMENT le fichier vidéo
  const formData = new FormData();
  formData.append("video", file);

  const uploadEndpoint = folderId
    ? `/api/folders/${folderId}/videos`
    : `/api/projects/${projectId}/upload-video`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadEndpoint);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 80);
        onProgress?.(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
          const videoId = payload?.id ?? payload?.video?.id;

          if (!videoId) {
            throw new Error("Upload succeeded but no video id was returned");
          }

          resolve({ videoId, payload });
        } catch (error) {
          reject(error);
        }
      } else {
        try {
          const payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
          reject(new Error(payload?.message || `Server error: ${xhr.statusText}`));
        } catch {
          reject(new Error(`Server error: ${xhr.statusText}`));
        }
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));

    xhr.send(formData);
  });
}

export function useVideoUploadWithProgress({
  folderId,
  projectId,
  onProgressError,
  onSuccess,
}: UseVideoUploadWithProgressOptions) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
  const [statusText, setStatusText] = useState("Uploading...");

  const uploadVideo = useCallback(async (file: File): Promise<UploadVideoResult> => {
    if (!file) {
      throw new Error("Missing video file");
    }

    setIsUploading(true);
    setIsProgressModalOpen(true);
    setUploadProgress(0);
    setStatusText("Transferring to server...");

    let completionTimeoutId: number | null = null;
    let hasUiCompleted = false;
    let completionStarted = false;

    const completeUiNow = () => {
      if (hasUiCompleted) return;
      hasUiCompleted = true;
      setUploadProgress(100);
      setStatusText("Completed!");
      setIsProgressModalOpen(false);
      onSuccess?.();
    };

    try {
      const result = await uploadVideoWithContext({
        file,
        folderId,
        projectId,
        onProgress: (percent) => {
          setUploadProgress(percent);
          if (percent >= 80) {
            setStatusText("Upload sent to server. Finalizing...");

            // Start fixed UI timer once data is fully sent to the server.
            if (!completionStarted) {
              completionStarted = true;
              completionTimeoutId = window.setTimeout(() => {
                completeUiNow();
              }, 20000);
            }
          }
        },
      });

      // If server answered before the 20s timer, still complete UI immediately.
      completeUiNow();

      return result;
    } catch (error) {
      if (completionTimeoutId) {
        window.clearTimeout(completionTimeoutId);
        completionTimeoutId = null;
      }
      setIsProgressModalOpen(false);
      if (!hasUiCompleted) {
        onProgressError?.();
      }
      throw error;
    } finally {
      if (completionTimeoutId) {
        window.clearTimeout(completionTimeoutId);
      }
      setIsUploading(false);
    }
  }, [folderId, projectId, onSuccess, onProgressError]);

  return {
    isUploading,
    uploadProgress,
    isProgressModalOpen,
    statusText,
    uploadVideo,
  };
}