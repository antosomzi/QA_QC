import {
  type Video,
  type InsertVideo,
  type GpsData,
  type InsertGpsData,
  type Annotation,
  type InsertAnnotation,
  type AnnotationExport,
  type Project,
  type InsertProject,
  type Folder,
  type InsertFolder,
  type BoundingBox,
  type AnnotationWithBoundingBoxes
} from "@shared/schema";
import { PostgresStorage } from "./storage-postgres";
import { db } from "./db";

export interface IStorage {
  // Project methods
  createProject(project: InsertProject): Promise<Project>;
  getProject(id: string): Promise<Project | undefined>;
  getAllProjects(): Promise<Project[]>;
  updateProject(id: string, updates: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;

  // Folder methods
  createFolder(folder: InsertFolder): Promise<Folder>;
  getFolder(id: string): Promise<Folder | undefined>;
  getFoldersByProjectId(projectId: string): Promise<Folder[]>;
  getAllFolders(): Promise<Folder[]>;
  updateFolder(id: string, updates: Partial<InsertFolder>): Promise<Folder | undefined>;
  deleteFolder(id: string): Promise<boolean>;

  // Video methods
  createVideo(video: InsertVideo): Promise<Video>;
  getVideo(id: string): Promise<Video | undefined>;
  getVideosByFolderId(folderId: string): Promise<Video[]>;
  getAllVideos(): Promise<Video[]>;
  updateVideo(id: string, updates: Partial<InsertVideo>): Promise<Video | undefined>;

  // GPS data methods
  createGpsData(gpsData: InsertGpsData): Promise<GpsData>;
  getGpsDataByVideoId(videoId: string): Promise<GpsData | undefined>;

  // Annotation methods
  createAnnotation(annotation: InsertAnnotation): Promise<Annotation>;
  getAnnotation(id: string): Promise<Annotation | undefined>;
  getAnnotationsByVideoId(videoId: string): Promise<Annotation[]>;
  getAnnotationsByFolderId(folderId: string): Promise<Annotation[]>;
  getAnnotationsWithBoundingBoxesByFolderId(folderId: string): Promise<AnnotationWithBoundingBoxes[]>;
  updateAnnotation(id: string, annotation: Partial<InsertAnnotation>): Promise<Annotation | undefined>;
  deleteAnnotation(id: string): Promise<boolean>;

  // Import method
  importAnnotationsByFolder(folderId: string, data: any): Promise<void>;

  // Delete methods
  deleteAnnotationsByFolder(folderId: string): Promise<void>;
}

