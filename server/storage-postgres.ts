import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
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
  projects,
  folders,
  videos,
  gpsData,
  annotations
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { IStorage } from "./storage";

export class PostgresStorage implements IStorage {
  private db;

  constructor(connectionString: string) {
    const client = postgres(connectionString);
    this.db = drizzle(client);
  }

  // Project methods
  async createProject(projectData: InsertProject): Promise<Project> {
    const [project] = await this.db.insert(projects).values(projectData).returning();
    return project;
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await this.db.select().from(projects).where(eq(projects.id, id)).limit(1);
    return project;
  }

  async getAllProjects(): Promise<Project[]> {
    return await this.db.select().from(projects);
  }

  async updateProject(id: string, updates: Partial<InsertProject>): Promise<Project | undefined> {
    const [project] = await this.db.update(projects).set(updates).where(eq(projects.id, id)).returning();
    return project;
  }

  async deleteProject(id: string): Promise<boolean> {
    // First delete all folders associated with this project
    const foldersToDelete = await this.db.select({ id: folders.id }).from(folders).where(eq(folders.projectId, id));
    for (const folder of foldersToDelete) {
      await this.deleteFolder(folder.id);
    }
    
    const result = await this.db.delete(projects).where(eq(projects.id, id)).returning({ id: projects.id });
    return result.length > 0;
  }
  
  // Folder methods
  async createFolder(folderData: InsertFolder): Promise<Folder> {
    const [folder] = await this.db.insert(folders).values(folderData).returning();
    return folder;
  }

  async getFolder(id: string): Promise<Folder | undefined> {
    const [folder] = await this.db.select().from(folders).where(eq(folders.id, id)).limit(1);
    return folder;
  }

  async getFoldersByProjectId(projectId: string): Promise<Folder[]> {
    return await this.db.select().from(folders).where(eq(folders.projectId, projectId));
  }

  async getAllFolders(): Promise<Folder[]> {
    return await this.db.select().from(folders);
  }

  async updateFolder(id: string, updates: Partial<InsertFolder>): Promise<Folder | undefined> {
    const [folder] = await this.db.update(folders).set(updates).where(eq(folders.id, id)).returning();
    return folder;
  }

  async deleteFolder(id: string): Promise<boolean> {
    // First delete all videos associated with this folder
    const videosToDelete = await this.db.select({ id: videos.id }).from(videos).where(eq(videos.folderId, id));
    // Videos will be deleted via cascade in database, but we should clean up associated data
    
    const result = await this.db.delete(folders).where(eq(folders.id, id)).returning({ id: folders.id });
    return result.length > 0;
  }
  
  // Video methods
  async createVideo(insertVideo: InsertVideo): Promise<Video> {
    // Check if folder already has a video
    const existingVideos = await this.getVideosByFolderId(insertVideo.folderId);
    if (existingVideos.length > 0) {
      throw new Error("Folder already contains a video. Each folder can only contain one video.");
    }
    
    const [video] = await this.db.insert(videos).values(insertVideo).returning();
    return video;
  }

  async getVideo(id: string): Promise<Video | undefined> {
    const [video] = await this.db.select().from(videos).where(eq(videos.id, id)).limit(1);
    return video;
  }

  async getVideosByFolderId(folderId: string): Promise<Video[]> {
    return await this.db.select().from(videos).where(eq(videos.folderId, folderId));
  }

  async getAllVideos(): Promise<Video[]> {
    return await this.db.select().from(videos);
  }

  // GPS data methods
  async createGpsData(insertGpsData: InsertGpsData): Promise<GpsData> {
    const [gpsDataEntry] = await this.db.insert(gpsData).values(insertGpsData).returning();
    return gpsDataEntry;
  }

  async getGpsDataByVideoId(videoId: string): Promise<GpsData | undefined> {
    const [gpsDataEntry] = await this.db.select().from(gpsData).where(eq(gpsData.videoId, videoId)).limit(1);
    return gpsDataEntry;
  }

  // Annotation methods
  async createAnnotation(insertAnnotation: InsertAnnotation): Promise<Annotation> {
    const [annotation] = await this.db.insert(annotations).values(insertAnnotation).returning();
    return annotation;
  }

  async getAnnotation(id: string): Promise<Annotation | undefined> {
    const [annotation] = await this.db.select().from(annotations).where(eq(annotations.id, id)).limit(1);
    return annotation;
  }

  async getAnnotationsByVideoId(videoId: string): Promise<Annotation[]> {
    return await this.db.select().from(annotations).where(eq(annotations.videoId, videoId));
  }

  async updateAnnotation(id: string, updates: Partial<InsertAnnotation>): Promise<Annotation | undefined> {
    const [annotation] = await this.db.update(annotations).set(updates).where(eq(annotations.id, id)).returning();
    return annotation;
  }

  async deleteAnnotation(id: string): Promise<boolean> {
    const result = await this.db.delete(annotations).where(eq(annotations.id, id)).returning({ id: annotations.id });
    return result.length > 0;
  }

  async exportAnnotations(videoId: string): Promise<AnnotationExport | undefined> {
    const [video] = await this.db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
    if (!video) return undefined;

    const annotationsList = await this.getAnnotationsByVideoId(videoId);
    
    return {
      video: {
        video_id: video.id,
        original_name: video.originalName,
        fps: video.fps || 30,
        duration_ms: (video.duration || 0) * 1000
      },
      annotations: annotationsList.map(ann => ({
        id: ann.id,
        frame_index: ann.frameIndex,
        frame_timestamp_ms: ann.frameTimestampMs,
        gps: { lat: ann.gpsLat, lon: ann.gpsLon },
        bbox: {
          x: ann.bboxX,
          y: ann.bboxY,
          width: ann.bboxWidth,
          height: ann.bboxHeight,
          unit: "pixel"
        },
        label: ann.label,
        created_at: ann.createdAt?.getTime() || Date.now(),
        updated_at: ann.updatedAt?.getTime() || Date.now()
      }))
    };
  }

  async importAnnotations(data: AnnotationExport): Promise<void> {
    // Find the video by its original name
    const [video] = await this.db.select().from(videos).where(eq(videos.originalName, data.video.original_name)).limit(1);
    
    if (!video) {
      throw new Error(`Video with original name '${data.video.original_name}' not found`);
    }
    
    // Import annotations using the found video ID
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