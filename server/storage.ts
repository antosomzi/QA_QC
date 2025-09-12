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
  type InsertFolder
} from "@shared/schema";
import { randomUUID } from "crypto";

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
  
  // GPS data methods
  createGpsData(gpsData: InsertGpsData): Promise<GpsData>;
  getGpsDataByVideoId(videoId: string): Promise<GpsData | undefined>;
  
  // Annotation methods
  createAnnotation(annotation: InsertAnnotation): Promise<Annotation>;
  getAnnotation(id: string): Promise<Annotation | undefined>;
  getAnnotationsByVideoId(videoId: string): Promise<Annotation[]>;
  updateAnnotation(id: string, annotation: Partial<InsertAnnotation>): Promise<Annotation | undefined>;
  deleteAnnotation(id: string): Promise<boolean>;
  
  // Export/Import methods
  exportAnnotations(videoId: string): Promise<AnnotationExport | undefined>;
  importAnnotations(data: AnnotationExport): Promise<void>;
}

export class MemStorage implements IStorage {
  private projects: Map<string, Project>;
  private folders: Map<string, Folder>;
  private videos: Map<string, Video>;
  private gpsDataMap: Map<string, GpsData>;
  private annotationsMap: Map<string, Annotation>;

  constructor() {
    this.projects = new Map();
    this.folders = new Map();
    this.videos = new Map();
    this.gpsDataMap = new Map();
    this.annotationsMap = new Map();
  }

  // Project methods
  async createProject(projectData: InsertProject): Promise<Project> {
    const id = randomUUID();
    const now = new Date();
    const project: Project = {
      ...projectData,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.projects.set(id, project);
    return project;
  }

  async getProject(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async getAllProjects(): Promise<Project[]> {
    return Array.from(this.projects.values());
  }

  async updateProject(id: string, updates: Partial<InsertProject>): Promise<Project | undefined> {
    const existing = this.projects.get(id);
    if (!existing) return undefined;
    
    const updated: Project = {
      ...existing,
      ...updates,
      updatedAt: new Date()
    };
    this.projects.set(id, updated);
    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    // Supprimer aussi les dossiers associés
    const folders = await this.getFoldersByProjectId(id);
    for (const folder of folders) {
      await this.deleteFolder(folder.id);
    }
    return this.projects.delete(id);
  }
  
  // Folder methods
  async createFolder(folderData: InsertFolder): Promise<Folder> {
    const id = randomUUID();
    const now = new Date();
    const folder: Folder = {
      ...folderData,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.folders.set(id, folder);
    return folder;
  }

  async getFolder(id: string): Promise<Folder | undefined> {
    return this.folders.get(id);
  }

  async getFoldersByProjectId(projectId: string): Promise<Folder[]> {
    return Array.from(this.folders.values()).filter(folder => folder.projectId === projectId);
  }

  async getAllFolders(): Promise<Folder[]> {
    return Array.from(this.folders.values());
  }

  async updateFolder(id: string, updates: Partial<InsertFolder>): Promise<Folder | undefined> {
    const existing = this.folders.get(id);
    if (!existing) return undefined;
    
    const updated: Folder = {
      ...existing,
      ...updates,
      updatedAt: new Date()
    };
    this.folders.set(id, updated);
    return updated;
  }

  async deleteFolder(id: string): Promise<boolean> {
    // Supprimer aussi les vidéos associées
    const videos = await this.getVideosByFolderId(id);
    for (const video of videos) {
      this.videos.delete(video.id);
    }
    return this.folders.delete(id);
  }
  
  // Video methods
  async createVideo(insertVideo: InsertVideo): Promise<Video> {
    const id = randomUUID();
    const video: Video = { 
      ...insertVideo, 
      id, 
      createdAt: new Date()
    };
    
    // Check if folder already has a video
    const existingVideos = await this.getVideosByFolderId(video.folderId);
    if (existingVideos.length > 0) {
      throw new Error("Folder already contains a video. Each folder can only contain one video.");
    }
    
    this.videos.set(id, video);
    return video;
  }

  async getVideo(id: string): Promise<Video | undefined> {
    return this.videos.get(id);
  }

  async getVideosByFolderId(folderId: string): Promise<Video[]> {
    const videos = Array.from(this.videos.values()).filter(video => video.folderId === folderId);
    // Return only the first video since a folder should contain only one video
    return videos.length > 0 ? [videos[0]] : [];
  }

  async getAllVideos(): Promise<Video[]> {
    return Array.from(this.videos.values());
  }

  // GPS data methods
  async createGpsData(insertGpsData: InsertGpsData): Promise<GpsData> {
    const id = randomUUID();
    const gpsData: GpsData = { 
      ...insertGpsData, 
      id, 
      createdAt: new Date() 
    };
    this.gpsDataMap.set(id, gpsData);
    return gpsData;
  }

  async getGpsDataByVideoId(videoId: string): Promise<GpsData | undefined> {
    return Array.from(this.gpsDataMap.values()).find(gps => gps.videoId === videoId);
  }

  // Annotation methods
  async createAnnotation(insertAnnotation: InsertAnnotation): Promise<Annotation> {
    const id = randomUUID();
    const now = new Date();
    const annotation: Annotation = { 
      ...insertAnnotation, 
      id, 
      createdAt: now,
      updatedAt: now
    };
    this.annotationsMap.set(id, annotation);
    return annotation;
  }

  async getAnnotation(id: string): Promise<Annotation | undefined> {
    return this.annotationsMap.get(id);
  }

  async getAnnotationsByVideoId(videoId: string): Promise<Annotation[]> {
    return Array.from(this.annotationsMap.values()).filter(ann => ann.videoId === videoId);
  }

  async updateAnnotation(id: string, updates: Partial<InsertAnnotation>): Promise<Annotation | undefined> {
    const existing = this.annotationsMap.get(id);
    if (!existing) return undefined;
    
    const updated: Annotation = {
      ...existing,
      ...updates,
      updatedAt: new Date()
    };
    this.annotationsMap.set(id, updated);
    return updated;
  }

  async deleteAnnotation(id: string): Promise<boolean> {
    return this.annotationsMap.delete(id);
  }

  async exportAnnotations(videoId: string): Promise<AnnotationExport | undefined> {
    const video = await this.getVideo(videoId);
    if (!video) return undefined;

    const annotations = await this.getAnnotationsByVideoId(videoId);
    
    return {
      video: {
        video_id: video.id,
        original_name: video.originalName,
        fps: video.fps || 30,
        duration_ms: (video.duration || 0) * 1000
      },
      annotations: annotations.map(ann => ({
        id: ann.id,
        frame_index: ann.frameIndex,
        frame_timestamp_ms: ann.frameTimestampMs,
        gps: { lat: ann.gpsLat, lon: ann.gpsLon },
        bbox: {
          x: ann.bboxX,
          y: ann.bboxY,
          width: ann.bboxWidth,
          height: ann.bboxHeight,
          unit: "pixel" as const
        },
        label: ann.label,
        created_at: ann.createdAt?.getTime() || Date.now(),
        updated_at: ann.updatedAt?.getTime() || Date.now()
      }))
    };
  }

  async importAnnotations(data: AnnotationExport): Promise<void> {
    // Trouver la vidéo par son nom original
    const videos = await this.getAllVideos();
    const video = videos.find(v => v.originalName === data.video.original_name);
    
    if (!video) {
      throw new Error(`Video with original name '${data.video.original_name}' not found`);
    }
    
    // Utiliser l'ID de la vidéo trouvée pour importer les annotations
    for (const annData of data.annotations) {
      const annotation: InsertAnnotation = {
        videoId: video.id,
        frameIndex: annData.frame_index,
        frameTimestampMs: annData.frame_timestamp_ms,
        gpsLat: annData.gps.lat,
        gpsLon: annData.gps.lon,
        bboxX: annData.bbox.x,
        bboxY: annData.bbox.y,
        bboxWidth: annData.bbox.width,
        bboxHeight: annData.bbox.height,
        label: annData.label
      };
      await this.createAnnotation(annotation);
    }
  }
}

export const storage = new MemStorage();