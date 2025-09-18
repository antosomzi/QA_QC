import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Project } from "@/types/project";

export default function ProjectList() {
  const { data: projects = [], refetch } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });
  
  // Fetch folder counts for each project
  const { data: folderCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["folder-counts"],
    queryFn: async () => {
      const counts: Record<string, number> = {};
      for (const project of projects) {
        try {
          const response = await fetch(`/api/projects/${project.id}/folders`);
          const folders = await response.json();
          counts[project.id] = folders.length;
        } catch (error) {
          console.error(`Failed to fetch folders for project ${project.id}:`, error);
          counts[project.id] = 0;
        }
      }
      return counts;
    },
    enabled: projects.length > 0,
  });
  
  const [newProjectName, setNewProjectName] = useState("");
  const { toast } = useToast();

  const handleCreateProject = useCallback(async () => {
    if (!newProjectName.trim()) return;

    try {
      await apiRequest("POST", "/api/projects", { name: newProjectName });
      setNewProjectName("");
      refetch();
      toast({
        title: "Project created",
        description: "New project has been created successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create project.",
        variant: "destructive",
      });
    }
  }, [newProjectName, refetch, toast]);

  const handleDeleteProject = useCallback(async (projectId: string, projectName: string) => {
    if (!confirm(`Are you sure you want to delete the project "${projectName}"? This will permanently delete the project and all its folders.`)) {
      return;
    }

    try {
      await apiRequest("DELETE", `/api/projects/${projectId}`);
      refetch();
      toast({
        title: "Project deleted",
        description: "Project has been deleted successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete project.",
        variant: "destructive",
      });
    }
  }, [refetch, toast]);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Projects</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Create new project card */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>Create New Project</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Project name"
                />
                <Button 
                  onClick={handleCreateProject} 
                  disabled={!newProjectName.trim()}
                  className="w-full"
                >
                  Create Project
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Projects list - on a new line */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {projects.map((project) => (
            <Card key={project.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{project.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDeleteProject(project.id, project.name)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Created: {new Date(project.createdAt).toLocaleDateString()}
                  </span>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-muted-foreground">
                      {folderCounts[project.id] || 0} folders
                    </span>
                    <a href={`/project/${project.id}`}>
                      <Button variant="outline" size="sm">
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