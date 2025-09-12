import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Folder, Play } from "lucide-react";
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

  if (!project) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">{project.name}</h1>
          <div className="flex gap-2">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="w-64"
            />
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              <Plus className="w-4 h-4 mr-2" />
              Create Folder
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {folders.map((folder) => (
            <Card key={folder.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{folder.name}</span>
                  <Folder className="w-5 h-5 text-muted-foreground" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Created: {new Date(folder.createdAt).toLocaleDateString()}
                  </span>
                  <a href={`/folder/${folder.id}`}>
                    <Button variant="outline" size="sm">
                      <Play className="w-4 h-4 mr-2" />
                      Open
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}