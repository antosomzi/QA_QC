export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Folder {
  id: string;
  name: string;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoWithFolder {
  id: string;
  filename: string;
  originalName: string;
  duration?: number;
  fps?: number;
  width?: number;
  height?: number;
  folderId: string;
  createdAt: Date;
}