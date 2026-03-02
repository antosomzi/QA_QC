import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, FolderOpen, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AppHeader from "@/components/app-header";
import type { Project } from "@/types/project";

export default function ProjectList() {
  const { data: projects = [], refetch } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: folderCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["folder-counts"],
    queryFn: async () => {
      const counts: Record<string, number> = {};
      for (const project of projects) {
        try {
          const response = await fetch(`/api/projects/${project.id}/folders`);
          const folders = await response.json();
          counts[project.id] = folders.length;
        } catch {
          counts[project.id] = 0;
        }
      }
      return counts;
    },
    enabled: projects.length > 0,
  });

  const [newProjectName, setNewProjectName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const { toast } = useToast();

  const handleCreateProject = useCallback(async () => {
    if (!newProjectName.trim()) return;
    try {
      await apiRequest("POST", "/api/projects", { name: newProjectName });
      setNewProjectName("");
      setShowCreate(false);
      refetch();
      toast({ title: "Project created" });
    } catch {
      toast({ title: "Error", description: "Failed to create project.", variant: "destructive" });
    }
  }, [newProjectName, refetch, toast]);

  const handleDeleteProject = useCallback(async (projectId: string, projectName: string) => {
    if (!confirm(`Delete project "${projectName}"? This will permanently delete all its folders and data.`)) return;
    try {
      await apiRequest("DELETE", `/api/projects/${projectId}`);
      refetch();
      toast({ title: "Project deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete project.", variant: "destructive" });
    }
  }, [refetch, toast]);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader>
        <span className="text-sm text-gray-500">Projects</span>
      </AppHeader>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Title + Create button */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Your Projects</h2>
          <Button onClick={() => setShowCreate(!showCreate)} size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            New Project
          </Button>
        </div>

        {/* Inline create form */}
        {showCreate && (
          <div className="mb-6 flex gap-3 items-center">
            <Input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Project name"
              className="max-w-xs"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
            />
            <Button onClick={handleCreateProject} disabled={!newProjectName.trim()} size="sm">
              Create
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowCreate(false); setNewProjectName(""); }}>
              Cancel
            </Button>
          </div>
        )}

        {/* Projects grid */}
        {projects.length === 0 && !showCreate && (
          <div className="text-center py-16 text-gray-400">
            <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No projects yet. Create one to get started.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Card key={project.id} className="hover:shadow-md transition-shadow group">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <a href={`/project/${project.id}`} className="text-base font-semibold text-gray-900 hover:text-blue-600 transition-colors">
                    {project.name}
                  </a>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity -mt-1 -mr-2"
                    onClick={() => handleDeleteProject(project.id, project.name)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>{folderCounts[project.id] || 0} recordings</span>
                  <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}