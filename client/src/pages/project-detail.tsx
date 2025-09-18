import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Trash2, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Project, Folder as FolderType } from "@/types/project";

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
        } catch (error) {
          console.error(`Failed to fetch annotations for folder ${folder.id}:`, error);
          counts[folder.id] = 0;
        }
      }
      return counts;
    },
    enabled: folders.length > 0,
  });
  
  const [newFolderName, setNewFolderName] = useState("");
  const { toast } = useToast();

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;

    try {
      await apiRequest("POST", `/api/projects/${projectId}/folders`, { 
        name: newFolderName,
        projectId
      });
      setNewFolderName("");
      refetch();
      toast({
        title: "Folder created",
        description: "New folder has been created successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create folder.",
        variant: "destructive",
      });
    }
  }, [newFolderName, projectId, refetch, toast]);

  const handleDeleteFolder = useCallback(async (folderId: string, folderName: string) => {
    if (!confirm(`Are you sure you want to delete the folder "${folderName}"? This will permanently delete the folder and all its data.`)) {
      return;
    }

    try {
      await apiRequest("DELETE", `/api/folders/${folderId}`);
      refetch();
      toast({
        title: "Folder deleted",
        description: "Folder has been deleted successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete folder.",
        variant: "destructive",
      });
    }
  }, [refetch, toast]);

  if (!project) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center space-x-4">
            <Link to="/">
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Projects
              </Button>
            </Link>
            <h1 className="text-3xl font-bold">{project.name}</h1>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Create new folder card */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>Create New Folder</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Folder name"
                />
                <Button 
                  onClick={handleCreateFolder} 
                  disabled={!newFolderName.trim()}
                  className="w-full"
                >
                  Create Folder
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Folders list - on a new line */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {folders.map((folder) => (
            <Card key={folder.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{folder.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDeleteFolder(folder.id, folder.name)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Created: {new Date(folder.createdAt).toLocaleDateString()}
                  </span>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-muted-foreground">
                      {annotationCounts[folder.id] || 0} annotations
                    </span>
                    <a href={`/folder/${folder.id}`}>
                      <Button variant="outline" size="sm">
                        <Play className="w-4 h-4 mr-2" />
                        Open
                      </Button>
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}