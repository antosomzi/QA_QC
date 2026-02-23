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
import { eq, and, inArray } from "drizzle-orm";
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
    const existingVideos = await this.getVideosByFolderId(insertVideo.folderId as string);
    if (existingVideos.length > 0) {
      throw new Error("Folder already contains a video. Each folder can only contain one video.");
    }
    // Use actual FPS from video metadata, don't force it
    // Old behavior: insertVideo.fps = 30; (caused drift with 29.99 fps videos)
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

  async deleteGpsData(id: string): Promise<boolean> {
    const result = await this.db.delete(gpsData).where(eq(gpsData.id, id)).returning({ id: gpsData.id });
    return result.length > 0;
  }

  async deleteVideo(id: string): Promise<boolean> {
    // GPS data and annotations will be deleted via cascade in database
    const result = await this.db.delete(videos).where(eq(videos.id, id)).returning({ id: videos.id });
    return result.length > 0;
  }

  // Annotation methods
  async createAnnotation(insertAnnotation: InsertAnnotation): Promise<Annotation> {
    // If folderId is not provided but videoId is, get folderId from the video
    if (!insertAnnotation.folderId && insertAnnotation.videoId) {
      const [video] = await this.db.select().from(videos).where(eq(videos.id, insertAnnotation.videoId)).limit(1);
      if (video && video.folderId) {
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

  async deleteAnnotationsByFolder(folderId: string): Promise<void> {
    // First get all annotation IDs in this folder
    const annotationIds = await this.db.select({ id: annotations.id })
      .from(annotations)
      .where(eq(annotations.folderId, folderId));

    if (annotationIds.length > 0) {
      // Delete all bounding boxes associated with these annotations
      await this.db.delete(boundingBoxes)
        .where(
          inArray(
            boundingBoxes.annotationId,
            annotationIds.map(row => row.id)
          )
        );
    }

    // Then delete all annotations in this folder
    await this.db.delete(annotations)
      .where(eq(annotations.folderId, folderId));
  }

  async importAnnotationsByFolder(folderId: string, data: any): Promise<void> {
    // Only support the new frame-by-frame detector output format.
    // Expected structure: { output: { frames: [...] } } or { frames: [...] }
    const frames = (data && data.output && Array.isArray(data.output.frames))
      ? data.output.frames
      : (Array.isArray(data.frames) ? data.frames : null);

    if (!frames || !Array.isArray(frames)) {
      throw new Error('Unsupported import format: expected frame-by-frame JSON with output.frames or frames array');
    }

    type ClusterAgg = {
      label: string;
      // assume same 'class' for a given cluster_id
      gpsLat?: number;
      gpsLon?: number;
      bboxes: Array<{
        frameIndex: number;
        frameTimestampMs: number;
        x: number;
        y: number;
        width: number;
        height: number;
        classificationConfidence?: number;
        detectionConfidence?: number;
      }>;
    };

    const clusters = new Map<string, ClusterAgg>();

    for (const frame of frames) {
      const rawFrameIndex = frame.frame_number;
      const frameIndex = typeof rawFrameIndex === 'string' ? parseInt(rawFrameIndex, 10) || 0 : (rawFrameIndex || 0);
      const frameTs = frame.location && (frame.location.time ?? frame.location.timestamp)
        ? Math.round(frame.location.time ?? frame.location.timestamp)
        : 0;
      const signs = Array.isArray(frame.signs) ? frame.signs : [];
      for (const sign of signs) {
        const clusterId = sign.cluster_id;
        const fallbackKey = `${sign.class || 'unknown'}_${(sign.coordinates || []).join('_')}`;
        const key = (clusterId !== undefined && clusterId !== null) ? `cluster_${clusterId}` : `fallback_${fallbackKey}`;

        if (!clusters.has(key)) {
          clusters.set(key, {
            label: sign.class || 'unknown',
            bboxes: []
          });
        }

        const agg = clusters.get(key)!;

        // Prefer per-sign location (if available), otherwise use frame location
        const lat = sign.location && typeof sign.location.lat === 'number' ? sign.location.lat : (frame.location && typeof frame.location.lat === 'number' ? frame.location.lat : undefined);
        const lon = sign.location && typeof sign.location.lon === 'number' ? sign.location.lon : (frame.location && typeof frame.location.lon === 'number' ? frame.location.lon : undefined);
        if ((agg.gpsLat === undefined || agg.gpsLon === undefined) && lat !== undefined && lon !== undefined) {
          agg.gpsLat = lat;
          agg.gpsLon = lon;
        }

        const coords = Array.isArray(sign.coordinates) ? sign.coordinates : [];
        const [x = 0, y = 0, w = 0, h = 0] = coords.map((n: any) => Number(n || 0));

        agg.bboxes.push({
          frameIndex,
          frameTimestampMs: frameTs,
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(w),
          height: Math.round(h),
          classificationConfidence: sign.classification_confidence,
          detectionConfidence: sign.detection_confidence,
        });
      }
    }

    // Persist clusters as annotations + bounding boxes
    for (const [key, cluster] of Array.from(clusters.entries())) {
      // Skip clusters without a GPS location (annotations require gpsLat/gpsLon)
      if (cluster.gpsLat === undefined || cluster.gpsLon === undefined) {
        continue;
      }

      // Skip the first 2 bounding boxes of each cluster to avoid inconsistencies and bugs
      // This addresses the issue where the first frames often have inaccurate detections
      // that are spatially inconsistent with the rest of the frames for the same object
      const filteredBboxes = cluster.bboxes.sort((a, b) => a.frameIndex - b.frameIndex).slice(2);

      // Calculate average confidence values from all bounding boxes
      const validClassificationConfidences = filteredBboxes
        .map(b => b.classificationConfidence)
        .filter((c): c is number => c !== undefined && c !== null);
      const validDetectionConfidences = filteredBboxes
        .map(b => b.detectionConfidence)
        .filter((c): c is number => c !== undefined && c !== null);

      const avgClassificationConfidence = validClassificationConfidences.length > 0
        ? validClassificationConfidences.reduce((sum, c) => sum + c, 0) / validClassificationConfidences.length
        : undefined;
      const avgDetectionConfidence = validDetectionConfidences.length > 0
        ? validDetectionConfidences.reduce((sum, c) => sum + c, 0) / validDetectionConfidences.length
        : undefined;

      // signType is the label we recorded from the detector's 'class' field
      const signType = cluster.label || undefined;
      const insertAnnotation: InsertAnnotation = {
        folderId: folderId,
        gpsLat: cluster.gpsLat,
        gpsLon: cluster.gpsLon,
        label: cluster.label,
        signType: signType as any,
        classificationConfidence: avgClassificationConfidence,
        detectionConfidence: avgDetectionConfidence,
      };

      const createdAnnotation = await this.createAnnotation(insertAnnotation);

      for (const bbox of filteredBboxes) {
        const insertBoundingBox: InsertBoundingBox = {
          annotationId: createdAnnotation.id,
          frameIndex: bbox.frameIndex,
          frameTimestampMs: bbox.frameTimestampMs,
          bboxX: bbox.x,
          bboxY: bbox.y,
          bboxWidth: bbox.width,
          bboxHeight: bbox.height,
          classificationConfidence: bbox.classificationConfidence,
          detectionConfidence: bbox.detectionConfidence,
        };
        try {
          await this.createBoundingBox(insertBoundingBox);
        } catch (err) {
          console.error("Erreur création BoundingBox:", err);
          console.error("Données rejetées:", insertBoundingBox);
          // Ignore duplicate-frame errors (unique constraint) or other bbox insert issues per bbox
        }
      }
    }
  }
}