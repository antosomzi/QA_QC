import { 
  type Video, 
  type InsertVideo, 
  type GpsData, 
  type InsertGpsData, 
  type Annotation, 
  type InsertAnnotation,
  type AnnotationExport 
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Video methods
  createVideo(video: InsertVideo): Promise<Video>;
  getVideo(id: string): Promise<Video | undefined>;
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
  private videos: Map<string, Video>;
  private gpsDataMap: Map<string, GpsData>;
  private annotationsMap: Map<string, Annotation>;

  constructor() {
    this.videos = new Map();
    this.gpsDataMap = new Map();
    this.annotationsMap = new Map();
  }

  async createVideo(insertVideo: InsertVideo): Promise<Video> {
    const id = randomUUID();
    const video: Video = { 
      ...insertVideo, 
      id, 
      createdAt: new Date() 
    };
    this.videos.set(id, video);
    return video;
  }

  async getVideo(id: string): Promise<Video | undefined> {
    return this.videos.get(id);
  }

  async getAllVideos(): Promise<Video[]> {
    return Array.from(this.videos.values());
  }

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
