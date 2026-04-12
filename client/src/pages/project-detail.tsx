import { useState, useCallback, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Trash2, Upload, ArrowUpDown, ArrowUp, ArrowDown, Video, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AppHeader from "@/components/app-header";
import UploadProgressModal from "@/components/upload-progress-modal";
import { useVideoUploadWithProgress } from "@/components/helpers/upload-video-helper";
import type { Project, Folder as FolderType } from "@/types/project";

/** Parse a timestamp-style folder name like "2026_01_16_13_41_04" into a Date */
function parseFolderTimestamp(name: string): Date | null {
  // Match patterns like 2026_01_16_13_41_04 (optionally with _cam or other suffix)
  const match = name.match(/^(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    parseInt(year), parseInt(month) - 1, parseInt(day),
    parseInt(hour), parseInt(minute), parseInt(second)
  );
}

/** Format a Date into a human-readable string */
function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type SortOrder = "newest" | "oldest";

export default function ProjectDetail() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { data: project } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
  });
  const { data: folders = [], refetch } = useQuery<FolderType[]>({
    queryKey: [`/api/projects/${projectId}/folders`],
  });

  // Fetch annotation counts for each folder
  const { data: annotationCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["annotation-counts", projectId],
    queryFn: async () => {
      const counts: Record<string, number> = {};
      for (const folder of folders) {
        try {
          const response = await fetch(`/api/annotations/folder/${folder.id}`);
          const annotations = await response.json();
          counts[folder.id] = annotations.length;
        } catch {
          counts[folder.id] = 0;
        }
      }
      return counts;
    },
    enabled: folders.length > 0,
  });

  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const {
    isUploading: uploading,
    uploadProgress,
    isProgressModalOpen,
    statusText,
    uploadVideo,
  } = useVideoUploadWithProgress({
    projectId,
    onSuccess: () => {
      refetch();
      toast({ title: "Video uploaded", description: "Recording folder created successfully." });
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onProgressError: () => {
      toast({
        title: "Upload failed",
        description: "An error occurred while uploading the video.",
        variant: "destructive",
      });
    },
  });

  // Sort folders by parsed timestamp from name
  const sortedFolders = useMemo(() => {
    return [...folders].sort((a, b) => {
      const dateA = parseFolderTimestamp(a.name);
      const dateB = parseFolderTimestamp(b.name);
      // Folders without parseable dates go to the end
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return sortOrder === "newest"
        ? dateB.getTime() - dateA.getTime()
        : dateA.getTime() - dateB.getTime();
    });
  }, [folders, sortOrder]);

  const handleUploadVideo = useCallback(async (file: File) => {
    try {
      await uploadVideo(file);
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload video.",
        variant: "destructive",
      });
      // Reset file input so same file can be re-selected after failure
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [uploadVideo, toast]);

  const handleDeleteFolder = useCallback(async (folderId: string, folderName: string) => {
    if (!confirm(`Delete recording "${folderName}"? This will permanently delete all its data.`)) return;
    try {
      await apiRequest("DELETE", `/api/folders/${folderId}`);
      refetch();
      toast({ title: "Recording deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete recording.", variant: "destructive" });
    }
  }, [refetch, toast]);

  const toggleSort = () => {
    setSortOrder((prev) => (prev === "newest" ? "oldest" : "newest"));
  };

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <UploadProgressModal
        open={isProgressModalOpen}
        progress={uploadProgress}
        statusText={statusText}
      />

      <AppHeader>
        <Link to="/">
          <Button variant="ghost" size="sm" className="gap-2 text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-4 h-4" />
            Projects
          </Button>
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-700">{project.name}</span>
      </AppHeader>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Title row with upload + sort */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Recordings</h2>
          <div className="flex items-center gap-3">
            {/* Sort toggle */}
            {folders.length > 1 && (
              <Button variant="outline" size="sm" onClick={toggleSort} className="gap-2 text-gray-600">
                {sortOrder === "newest" ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                {sortOrder === "newest" ? "Newest first" : "Oldest first"}
              </Button>
            )}

            {/* Upload video button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUploadVideo(file);
              }}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              size="sm"
              className="gap-2"
            >
              <Upload className="w-4 h-4" />
              {uploading ? "Uploading..." : "Upload Video"}
            </Button>
          </div>
        </div>

        {/* Empty state */}
        {folders.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Video className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="mb-2">No recordings yet.</p>
            <p className="text-sm">Upload a video to create your first recording.</p>
          </div>
        )}

        {/* Folders grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedFolders.map((folder) => {
            const parsedDate = parseFolderTimestamp(folder.name);
            return (
              <Card key={folder.id} className="hover:shadow-md transition-shadow group">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-2">
                    <a
                      href={`/folder/${folder.id}`}
                      className="text-base font-semibold text-gray-900 hover:text-blue-600 transition-colors truncate mr-2"
                      title={folder.name}
                    >
                      {folder.name}
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity -mt-1 -mr-2 flex-shrink-0"
                      onClick={() => handleDeleteFolder(folder.id, folder.name)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Human-readable date from timestamp */}
                  {parsedDate && (
                    <p className="text-sm text-gray-500 mb-3">
                      {formatDate(parsedDate)}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      {annotationCounts[folder.id] || 0} annotations
                    </span>
                    <span>
                      Added {new Date(folder.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}