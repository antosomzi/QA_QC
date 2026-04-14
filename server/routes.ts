import type { Express } from "express";
import { createServer, type Server } from "http";
import pg from "pg";
import { initializeStorage } from "./storage";
import { insertProjectSchema, insertFolderSchema, insertVideoSchema, insertGpsDataSchema, insertAnnotationSchema, insertBoundingBoxSchema } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { getVideoMetadata, extractPtsData } from "./video-utils";
import { createSessionMiddleware, createAuthRoutes, requireAuth } from "./auth";
import { buildS3Key, uploadVideoToS3, getPresignedVideoUrl, deleteVideoFromS3, videoExistsInS3, s3Config, uploadProgressCache } from "./s3-service";
import { deleteTempFile } from "./route-services";

const { Pool } = pg;

// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/',
    filename: function (req, file, cb) {
          // Conserver le même nom que le fichier original
          cb(null, file.originalname);
        }
  }),
  limits: {
  // Increase single-file upload limit to 15GB to allow very large video uploads.
  // Note: reverse proxies (nginx, caddy, etc.) must also allow large bodies (client_max_body_size).
  // Example: set nginx `client_max_body_size 16G;` to give a small overhead margin.
  fileSize: 15 * 1024 * 1024 * 1024, // 15GB limit
  },
});

/**
 * Clean up all video and GPS files (S3 + local) for a given folder.
 * Call this BEFORE deleting the folder from the DB so we still have the video records.
 */
async function cleanupFolderFiles(storage: Awaited<ReturnType<typeof initializeStorage>>, folderId: string) {
  const videosInFolder = await storage.getVideosByFolderId(folderId);
  for (const video of videosInFolder) {
    // Delete from S3
    if (video.s3Key) {
      try {
        await deleteVideoFromS3(video.s3Key);
      } catch (err) {
        console.error(`[cleanup] Failed to delete S3 object ${video.s3Key}:`, err);
      }
    }
    // Delete local video file
    const videoPath = path.join('uploads', video.filename);
    if (fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
    // Delete associated GPS data file
    try {
      const gpsData = await storage.getGpsDataByVideoId(video.id);
      if (gpsData) {
        const gpsPath = path.join('uploads', gpsData.filename);
        if (fs.existsSync(gpsPath)) {
          fs.unlinkSync(gpsPath);
        }
      }
    } catch {
      // GPS data might not exist, that's okay
    }
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize storage based on environment
  const storage = await initializeStorage();

  // Create PostgreSQL pool for session store
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
  });

  // Add session middleware
  const sessionMiddleware = createSessionMiddleware(pool);
  app.use(sessionMiddleware);

  // Add auth routes
  app.use("/api/auth", createAuthRoutes());

  // Debug route - temporary endpoint to see all data in storage
  app.get("/api/debug/memory", async (_req, res) => {
    try {
      const projects = await storage.getAllProjects();
      const folders = await storage.getAllFolders();
      const videos = await storage.getAllVideos();
      const allAnnotations = [];
      const allGpsData = [];
      
      // Get all annotations for all videos
      for (const video of videos) {
        const annotations = await storage.getAnnotationsByVideoId(video.id);
        allAnnotations.push(...annotations);
        
        const gpsData = await storage.getGpsDataByVideoId(video.id);
        if (gpsData) {
          allGpsData.push(gpsData);
        }
      }
      
      res.json({
        projects,
        folders,
        videos,
        annotations: allAnnotations,
        gpsData: allGpsData
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch debug data", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Project routes
  app.post("/api/projects", async (req, res) => {
    try {
      const validatedData = insertProjectSchema.parse(req.body);
      const project = await storage.createProject(validatedData);
      res.json(project);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create project" });
    }
  });

  app.get("/api/projects", async (req, res) => {
    try {
      const projects = await storage.getAllProjects();
      res.json(projects);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  app.put("/api/projects/:id", async (req, res) => {
    try {
      const validatedData = insertProjectSchema.partial().parse(req.body);
      const project = await storage.updateProject(req.params.id, validatedData);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    try {
      // Clean up all video/GPS files for every folder in this project before DB cascade
      const projectFolders = await storage.getFoldersByProjectId(req.params.id);
      for (const folder of projectFolders) {
        await cleanupFolderFiles(storage, folder.id);
      }

      const success = await storage.deleteProject(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  // Folder routes
  app.post("/api/projects/:projectId/folders", async (req, res) => {
    try {
      // Vérifier que le projet existe
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const validatedData = insertFolderSchema.parse({...req.body, projectId: req.params.projectId});
      const folder = await storage.createFolder(validatedData);
      res.json(folder);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create folder" });
    }
  });

  app.get("/api/projects/:projectId/folders", async (req, res) => {
    try {
      const folders = await storage.getFoldersByProjectId(req.params.projectId);
      res.json(folders);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch folders" });
    }
  });

  app.get("/api/folders/:id", async (req, res) => {
    try {
      const folder = await storage.getFolder(req.params.id);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }
      res.json(folder);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch folder" });
    }
  });

  app.put("/api/folders/:id", async (req, res) => {
    try {
      const validatedData = insertFolderSchema.partial().parse(req.body);
      const folder = await storage.updateFolder(req.params.id, validatedData);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }
      res.json(folder);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to update folder" });
    }
  });

  app.delete("/api/folders/:id", async (req, res) => {
    try {
      // Clean up video/GPS files (S3 + local) before DB cascade deletes the records
      await cleanupFolderFiles(storage, req.params.id);

      const success = await storage.deleteFolder(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Folder not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete folder" });
    }
  });

  // Upload video and auto-create a folder in one operation.
  // The folder name is derived from the video filename (without extension).
  app.post("/api/projects/:projectId/upload-video", upload.single('video'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No video file provided" });
    }

    const { projectId } = req.params;
    const { filename, originalname } = req.file;
    const tempPath = path.join('uploads', filename);
    const folderName = path.parse(originalname).name;

    const abort = (status: number, message: string) => {
      deleteTempFile(tempPath);
      return res.status(status).json({ message });
    };

    try {
      const project = await storage.getProject(projectId);
      if (!project) return abort(404, "Project not found");

      const existingFolders = await storage.getFoldersByProjectId(projectId);
      if (existingFolders.some(f => f.name === folderName)) {
        return abort(409, `A recording named "${folderName}" already exists in this project.`);
      }


      const folder = await storage.createFolder({ name: folderName, projectId });
      const s3Key = buildS3Key(filename);
      const alreadyInS3 = await videoExistsInS3(s3Key);

     
      let videoData: {
        filename: string;
        originalName: string;
        folderId: string;
        s3Key?: string;
        ptsData: number[] | null;
        duration: number;
        fps: number;
        width: number;
        height: number;
      } = {
        filename,
        originalName: originalname,
        folderId: folder.id,
        s3Key: alreadyInS3 ? s3Key : undefined,
        ptsData: null,
        // Valeurs par défaut depuis req.body (si fournies)
        duration: req.body.duration ? parseFloat(req.body.duration) : 0,
        fps: req.body.fps ? parseFloat(req.body.fps) : 30,
        width: req.body.width ? parseInt(req.body.width) : 0,
        height: req.body.height ? parseInt(req.body.height) : 0,
      };

      if (!alreadyInS3) {
        // Extraction des métadonnées réelles uniquement si la vidéo n'est pas déjà sur S3
        try {
          const metadata = await getVideoMetadata(tempPath);
          videoData = { ...videoData, ...metadata }; // Écrase les valeurs par défaut
        } catch (e) {
          console.warn(
            `[upload-video] Metadata probe failed, using defaults:`,
            e instanceof Error ? e.message : String(e),
          );
        }

        try {
          videoData.ptsData = await extractPtsData(tempPath);
        } catch (e) {
          console.warn(
            `[upload-video] PTS extraction failed:`,
            e instanceof Error ? e.message : String(e),
          );
        }
      }

    
      const validatedData = insertVideoSchema.parse(videoData);
      const video = await storage.createVideo(validatedData);

   
      if (alreadyInS3) {
        console.log(`[upload-video] Reused existing S3 object: ${s3Key}`);
        deleteTempFile(tempPath); // On nettoie immédiatement
      } else {
        try {
          await uploadVideoToS3(tempPath, s3Key);
          await storage.updateVideo(video.id, { s3Key });
          video.s3Key = s3Key;
        } catch (s3Error) {
          console.error(`[upload-video] Failed to upload to S3:`, s3Error);
        } finally {
          deleteTempFile(tempPath); 
        }
      }

     
      return res.json({ folder, video });

    } catch (error) {
      return abort(400, error instanceof Error ? error.message : "Failed to upload video");
    }
  });
app.post("/api/folders/:folderId/videos", upload.single('video'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No video file provided" });
      }

      const folder = await storage.getFolder(req.params.folderId);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }

      const existingVideos = await storage.getVideosByFolderId(req.params.folderId);
      if (existingVideos.length > 0) {
        return res.status(400).json({ message: "Folder already contains a video. Each folder can only contain one video." });
      }

      const videoFilePath = path.join('uploads', req.file.filename);
      let extractedMetadata = { fps: 30, duration: 0, width: 0, height: 0 };
      let ptsData: null | number[] = null;
      
      try {
        extractedMetadata = await getVideoMetadata(videoFilePath);
        console.log(`[upload] Extracted metadata from video: fps=${extractedMetadata.fps}, duration=${extractedMetadata.duration}`);
      } catch (probeError) {
        console.warn(`[upload] Failed to probe video metadata, using defaults:`, probeError);
        extractedMetadata = {
          fps: req.body.fps ? parseFloat(req.body.fps) : 30,
          duration: req.body.duration ? parseFloat(req.body.duration) : 0,
          width: req.body.width ? parseInt(req.body.width) : 0,
          height: req.body.height ? parseInt(req.body.height) : 0,
        };
      }

      try {
        ptsData = await extractPtsData(videoFilePath);
        console.log(`[upload] Extracted ${ptsData.length} PTS values`);
      } catch (ptsError) {
        console.warn(`[upload] Failed to extract PTS data (VFR navigation will fall back to CFR):`, ptsError);
      }

      const videoData = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        duration: extractedMetadata.duration,
        fps: extractedMetadata.fps,
        width: extractedMetadata.width,
        height: extractedMetadata.height,
        ptsData: ptsData,
        folderId: req.params.folderId,
      };

      const validatedData = insertVideoSchema.parse(videoData);
      const video = await storage.createVideo(validatedData);

      const s3Key = buildS3Key(req.file.filename);
      video.s3Key = s3Key; 

      console.log(`🔑 [POST] Clé générée pour le cache S3 : "${s3Key}"`);

      // Upload video to S3 and store the key
      try {
        // ⏳ Le Front-end reste à 99% tant que l'upload S3 n'est pas terminé
        await uploadVideoToS3(videoFilePath, s3Key);

        await storage.updateVideo(video.id, { s3Key });

        if (fs.existsSync(videoFilePath)) {
          fs.unlinkSync(videoFilePath);
          console.log(`[upload] Local file deleted after S3 upload: ${videoFilePath}`);
        }
      } catch (s3Error) {
        console.error(`[upload] Failed to upload video to S3, keeping local file:`, s3Error);
      }

      const annotations = await storage.getAnnotationsByFolderId(req.params.folderId);
      for (const annotation of annotations) {
        if (!annotation.videoId) {
          await storage.updateAnnotation(annotation.id, { videoId: video.id });
        }
      }

      res.json(video);

    } catch (error) {
      if (error instanceof Error && error.message.includes("already contains a video")) {
        return res.status(400).json({ message: error.message });
      }
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to upload video" });
    }
  });

  app.get("/api/folders/:folderId/videos", async (req, res) => {
    try {
      // Vérifier que le dossier existe
      const folder = await storage.getFolder(req.params.folderId);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }
      
      const videos = await storage.getVideosByFolderId(req.params.folderId);
      res.json(videos);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch videos" });
    }
  });

  app.get("/api/videos/:id", async (req, res) => {
    try {
      const video = await storage.getVideo(req.params.id);
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }
      res.json(video);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch video" });
    }
  });

  // Upload progress for video transfer to S3
  app.get("/api/videos/:videoId/upload-progress", async (req, res) => {
    try {
      const { videoId } = req.params;
      const video = await storage.getVideo(videoId);

      if (!video) {
        return res.status(404).json({ status: "not_found", progress: 0 });
      }

      // s3Key may not yet be persisted while upload is running; derive the same key used by upload.
      const trackingS3Key = video.s3Key ?? buildS3Key(video.filename);
      const progress = uploadProgressCache.get(trackingS3Key);

  console.log(`🔍 [GET Polling] Recherche clé : "${trackingS3Key}" | Résultat : ${progress}`);

      // Not in cache: either upload completed or unknown video
      if (progress === undefined) {
        if (video && video.s3Key) {
          return res.json({ status: "completed", progress: 100 });
        }
        return res.status(404).json({ status: "not_found", progress: 0 });
      }

      if (progress === -1) {
        return res.status(500).json({ status: "error", progress: 0 });
      }

      return res.json({ status: "uploading", progress });
    } catch (error) {
      return res.status(500).json({ status: "error", progress: 0 });
    }
  });

  // Serve uploaded video files
  // If the video has an S3 key, redirect to a presigned URL; otherwise serve from local disk.
  app.get("/api/videos/:id/file", async (req, res) => {
    try {
      const video = await storage.getVideo(req.params.id);
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }

      // Prefer S3 if available
      if (video.s3Key) {
        const presignedUrl = await getPresignedVideoUrl(video.s3Key);
        return res.redirect(presignedUrl);
      }

      // Fallback: serve from local uploads/
      const filePath = path.join('uploads', video.filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "Video file not found (neither S3 nor local)" });
      }
      
      res.sendFile(path.resolve(filePath));
    } catch (error) {
      res.status(500).json({ message: "Failed to serve video file" });
    }
  });

  // Serve PTS (presentation timestamps) data for VFR-safe frame navigation
  app.get("/api/videos/:id/pts", async (req, res) => {
    try {
      const video = await storage.getVideo(req.params.id);
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }
      // ptsData is a JSONB column — may be null for older videos uploaded before this feature
      res.json({ ptsData: video.ptsData ?? null });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch PTS data" });
    }
  });

  // Delete video and associated GPS data
  app.delete("/api/videos/:id", async (req, res) => {
    try {
      const video = await storage.getVideo(req.params.id);
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }

      // Delete associated GPS data and file
      try {
        const gpsData = await storage.getGpsDataByVideoId(req.params.id);
        if (gpsData) {
          // Delete GPS file from disk
          const gpsFilePath = path.join('uploads', gpsData.filename);
          if (fs.existsSync(gpsFilePath)) {
            fs.unlinkSync(gpsFilePath);
          }
          // Delete GPS data from database
          await storage.deleteGpsData(gpsData.id);
        }
      } catch (error) {
        // GPS data might not exist, that's okay
      }

      // Delete the video file from S3 if it was stored there
      if (video.s3Key) {
        await deleteVideoFromS3(video.s3Key);
      }

      // Delete the local video file if it exists
      const videoFilePath = path.join('uploads', video.filename);
      if (fs.existsSync(videoFilePath)) {
        fs.unlinkSync(videoFilePath);
      }

      // Delete video record from database
      const deleted = await storage.deleteVideo(req.params.id);

      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete video from database" });
      }

      res.json({ message: "Video deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete video" });
    }
  });

  // GPS data routes
  app.post("/api/gps-data", upload.single('gpsFile'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No GPS file provided" });
      }

      if (!req.body.videoId) {
        return res.status(400).json({ message: "Video ID is required" });
      }

      // Read and parse GPS file
      const fileContent = fs.readFileSync(req.file.path, 'utf-8');
      let gpsData;
      if (req.file.originalname.endsWith('.json')) {
        gpsData = JSON.parse(fileContent);
      } else if (req.file.originalname.endsWith('.csv')) {
          const lines = fileContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          // On saute la 1ère ligne (header)
          gpsData = lines.slice(1).map(line => {
            const cols = line.split(',');

            const timestampMs = parseFloat(cols[0]);
            const timestampSec = timestampMs / 1000;
            
            return {
              timestamp: timestampSec, // Convertir les millisecondes en secondes
              lat: parseFloat(cols[2]),       // latitude_dd
              lon: parseFloat(cols[3])        // longitude_dd
            };
          });
        } else {
          return res.status(400).json({ message: "Unsupported file format. Use JSON or CSV." });
        }

      const gpsDataEntry = {
        videoId: req.body.videoId,
        filename: req.file.filename,
        originalName: req.file.originalname,
        data: gpsData,
      };

      const validatedData = insertGpsDataSchema.parse(gpsDataEntry);
      const result = await storage.createGpsData(validatedData);
      
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      res.json(result);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to upload GPS data" });
    }
  });

  app.get("/api/gps-data/video/:videoId", async (req, res) => {
    try {
      const gpsData = await storage.getGpsDataByVideoId(req.params.videoId);
      if (!gpsData) {
        return res.status(404).json({ message: "GPS data not found for this video" });
      }
      res.json(gpsData);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch GPS data" });
    }
  });

  // Annotation routes
  app.post("/api/annotations", async (req, res) => {
    try {
      const validatedData = insertAnnotationSchema.parse(req.body);
      const annotation = await storage.createAnnotation(validatedData);
      res.json(annotation);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create annotation" });
    }
  });

  // Bounding box routes
  app.post("/api/bounding-boxes", async (req, res) => {
    try {
      const validatedData = insertBoundingBoxSchema.parse(req.body);
      const boundingBox = await storage.createBoundingBox(validatedData);
      res.json(boundingBox);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create bounding box" });
    }
  });

  app.get("/api/bounding-boxes/annotation/:annotationId", async (req, res) => {
    try {
      const boundingBoxes = await storage.getBoundingBoxesByAnnotationId(req.params.annotationId);
      res.json(boundingBoxes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch bounding boxes" });
    }
  });

  app.put("/api/bounding-boxes/:id", async (req, res) => {
    try {
      const validatedData = insertBoundingBoxSchema.partial().parse(req.body);
      const boundingBox = await storage.updateBoundingBox(req.params.id, validatedData);
      if (!boundingBox) {
        return res.status(404).json({ message: "Bounding box not found" });
      }
      res.json(boundingBox);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to update bounding box" });
    }
  });

  app.delete("/api/bounding-boxes/:id", async (req, res) => {
    try {
      const success = await storage.deleteBoundingBox(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Bounding box not found" });
      }
      res.json({ message: "Bounding box deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to delete bounding box" });
    }
  });

  app.get("/api/annotations/folder/:folderId", async (req, res) => {
    try {
      const annotations = await storage.getAnnotationsByFolderId(req.params.folderId);
      res.json(annotations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch annotations" });
    }
  });

  // Nouvelle route pour récupérer les annotations avec leurs bounding boxes par dossier
  app.get("/api/annotations/folder/:folderId/with-bboxes", async (req, res) => {
    try {
      const annotationsWithBboxes = await storage.getAnnotationsWithBoundingBoxesByFolderId(req.params.folderId);
      res.json(annotationsWithBboxes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch annotations with bounding boxes" });
    }
  });

  app.put("/api/annotations/:id", async (req, res) => {
    try {
      const validatedData = insertAnnotationSchema.partial().parse(req.body);
      const annotation = await storage.updateAnnotation(req.params.id, validatedData);
      if (!annotation) {
        return res.status(404).json({ message: "Annotation not found" });
      }
      res.json(annotation);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to update annotation" });
    }
  });

  app.delete("/api/annotations/:id", async (req, res) => {
    try {
      const success = await storage.deleteAnnotation(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Annotation not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete annotation" });
    }
  });

  // Export annotations as CSV (signs.csv format with modifications)
  app.get("/api/annotations/export-csv/folder/:folderId", async (req, res) => {
    try {
      const annotationsWithBboxes = await storage.getAnnotationsWithBoundingBoxesByFolderId(req.params.folderId);
      
      // Get folder for filename
      const folder = await storage.getFolder(req.params.folderId);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }
      const filename = folder.name.replace(/\s+/g, '_');
      
      // CSV header matching signs.csv format + Longitude, Latitude columns
      const csvHeader = "ID,MUTCD Code,Position on the Support,Height (in),Width (in),Longitude,Latitude";
      
      // Generate CSV rows from annotations
      // Each annotation becomes one row (signType = MUTCD Code, gpsLon/gpsLat for position)
      const csvRows = annotationsWithBboxes.map((annotation, index) => {
        // ID: sequential index
        const id = index;
        // MUTCD Code: use signType
        const mutcdCode = annotation.signType || '';
        // Position on the Support: default to 1
        const positionOnSupport = 1;
        // Height and Width: get from first bounding box if available (in pixels, not inches)
        const firstBbox = annotation.boundingBoxes.length > 0 ? annotation.boundingBoxes[0] : null;
        const height = firstBbox ? firstBbox.bboxHeight : 0;
        const width = firstBbox ? firstBbox.bboxWidth : 0;
        // Longitude and Latitude from annotation GPS
        const longitude = annotation.gpsLon;
        const latitude = annotation.gpsLat;

        return `${id},${mutcdCode},${positionOnSupport},${height},${width},${longitude},${latitude}`;
      });
      
      const csvContent = [csvHeader, ...csvRows].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="signs_${filename}.csv"`);
      res.send(csvContent);
    } catch (error) {
      res.status(500).json({ message: "Failed to export annotations as CSV" });
    }
  });

  app.post("/api/annotations/import/folder/:folderId", async (req, res) => {
    try {
      await storage.importAnnotationsByFolder(req.params.folderId, req.body);
      res.json({ success: true, message: "Annotations imported successfully" });
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to import annotations" });
    }
  });

  // Route to delete all annotations and their bounding boxes for a folder
  app.delete("/api/annotations/folder/:folderId", async (req, res) => {
    try {
      await storage.deleteAnnotationsByFolder(req.params.folderId);
      res.json({ success: true, message: "All annotations deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to delete annotations" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}