import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Folder } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Project } from "@/types/project";

export default function ProjectList() {
  const { data: projects = [], refetch } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
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

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Projects</h1>
          <div className="flex gap-2">
            <Input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Project name"
              className="w-64"
            />
            <Button onClick={handleCreateProject} disabled={!newProjectName.trim()}>
              <Plus className="w-4 h-4 mr-2" />
              Create Project
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <Card key={project.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{project.name}</span>
                  <Folder className="w-5 h-5 text-muted-foreground" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Created: {new Date(project.createdAt).toLocaleDateString()}
                  </span>
                  <a href={`/project/${project.id}`}>
                    <Button variant="outline" size="sm">
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