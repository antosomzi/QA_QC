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
  type BoundingBox,
  type InsertBoundingBox,
  type AnnotationWithBoundingBoxes,
  projects,
  folders,
  videos,
  gpsData,
  annotations,
  boundingBoxes
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
    // If folderId is not provided but videoId is, get folderId from the video
    if (!insertAnnotation.folderId && insertAnnotation.videoId) {
      const [video] = await this.db.select().from(videos).where(eq(videos.id, insertAnnotation.videoId)).limit(1);
      if (video) {
        insertAnnotation.folderId = video.folderId;
      }
    }
    
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

  async getAnnotationsByFolderId(folderId: string): Promise<Annotation[]> {
    return await this.db.select().from(annotations).where(eq(annotations.folderId, folderId));
  }

  async getAnnotationsWithBoundingBoxesByFolderId(folderId: string): Promise<AnnotationWithBoundingBoxes[]> {
    // Récupérer les annotations
    const annotationsList = await this.db.select().from(annotations).where(eq(annotations.folderId, folderId));
    
    // Pour chaque annotation, récupérer ses bounding boxes
    const annotationsWithBboxes = await Promise.all(
      annotationsList.map(async (annotation) => {
        const bboxes = await this.getBoundingBoxesByAnnotationId(annotation.id);
        return {
          ...annotation,
          boundingBoxes: bboxes
        };
      })
    );

    return annotationsWithBboxes;
  }

  async updateAnnotation(id: string, updates: Partial<InsertAnnotation>): Promise<Annotation | undefined> {
    const [annotation] = await this.db.update(annotations).set(updates).where(eq(annotations.id, id)).returning();
    return annotation;
  }

  async deleteAnnotation(id: string): Promise<boolean> {
    const result = await this.db.delete(annotations).where(eq(annotations.id, id)).returning({ id: annotations.id });
    return result.length > 0;
  }

  // Bounding Box methods
  async createBoundingBox(insertBoundingBox: InsertBoundingBox): Promise<BoundingBox> {
    const [boundingBox] = await this.db.insert(boundingBoxes).values(insertBoundingBox).returning();
    return boundingBox;
  }

  async getBoundingBoxesByAnnotationId(annotationId: string): Promise<BoundingBox[]> {
    return await this.db.select().from(boundingBoxes).where(eq(boundingBoxes.annotationId, annotationId));
  }

  async updateBoundingBox(id: string, updates: Partial<InsertBoundingBox>): Promise<BoundingBox | undefined> {
    const [boundingBox] = await this.db.update(boundingBoxes).set(updates).where(eq(boundingBoxes.id, id)).returning();
    return boundingBox;
  }

  async deleteBoundingBox(id: string): Promise<boolean> {
    const result = await this.db.delete(boundingBoxes).where(eq(boundingBoxes.id, id)).returning({ id: boundingBoxes.id });
    return result.length > 0;
  }

  async exportAnnotationsByFolder(folderId: string): Promise<AnnotationExport | undefined> {
    const [folder] = await this.db.select().from(folders).where(eq(folders.id, folderId)).limit(1);
    if (!folder) return undefined;

    const annotationsList = await this.getAnnotationsByFolderId(folderId);
    
    // Check if any annotations are linked to a video
    const videoAnnotations = annotationsList.filter(ann => ann.videoId);
    let videoInfo = undefined;
    
    if (videoAnnotations.length > 0) {
      const videoId = videoAnnotations[0].videoId;
      if (videoId) {
        const [video] = await this.db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
        if (video) {
          videoInfo = {
            video_id: video.id,
            original_name: video.originalName,
            fps: video.fps || 30,
            duration_ms: (video.duration || 0) * 1000
          };
        }
      }
    }
    
    return {
      video: videoInfo,
      annotations: annotationsList.map(ann => ({
        id: ann.id,
        frame_index: ann.frameIndex !== null ? ann.frameIndex : undefined,
        frame_timestamp_ms: ann.frameTimestampMs !== null ? ann.frameTimestampMs : undefined,
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

  async importAnnotationsByFolder(folderId: string, data: any): Promise<void> {
    // Import annotations using the folder ID
    // Only look at the annotations array, ignore video/folder attributes
    const annotationsToImport = data.annotations || (Array.isArray(data) ? data : []);
    
    for (const annData of annotationsToImport) {
      const annotation: InsertAnnotation = {
        folderId: folderId,
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