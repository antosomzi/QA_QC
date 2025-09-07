import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertVideoSchema, insertGpsDataSchema, insertAnnotationSchema } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Video routes
  app.post("/api/videos", upload.single('video'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No video file provided" });
      }

      const videoData = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        duration: req.body.duration ? parseFloat(req.body.duration) : undefined,
        fps: req.body.fps ? parseFloat(req.body.fps) : undefined,
        width: req.body.width ? parseInt(req.body.width) : undefined,
        height: req.body.height ? parseInt(req.body.height) : undefined,
      };

      const validatedData = insertVideoSchema.parse(videoData);
      const video = await storage.createVideo(validatedData);
      
      res.json(video);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to upload video" });
    }
  });

  app.get("/api/videos", async (req, res) => {
    try {
      const videos = await storage.getAllVideos();
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

  // Serve uploaded video files
  app.get("/api/videos/:id/file", async (req, res) => {
    try {
      const video = await storage.getVideo(req.params.id);
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }
      
      const filePath = path.join('uploads', video.filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "Video file not found" });
      }
      
      res.sendFile(path.resolve(filePath));
    } catch (error) {
      res.status(500).json({ message: "Failed to serve video file" });
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
        // Simple CSV parsing - assumes format: timestamp,lat,lon
        const lines = fileContent.split('\n').slice(1); // Skip header
        gpsData = lines.filter(line => line.trim()).map(line => {
          const [timestamp, lat, lon] = line.split(',');
          return {
            timestamp: parseFloat(timestamp),
            lat: parseFloat(lat),
            lon: parseFloat(lon)
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

  app.get("/api/annotations/video/:videoId", async (req, res) => {
    try {
      const annotations = await storage.getAnnotationsByVideoId(req.params.videoId);
      res.json(annotations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch annotations" });
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

  // Export/Import routes
  app.get("/api/annotations/export/:videoId", async (req, res) => {
    try {
      const exportData = await storage.exportAnnotations(req.params.videoId);
      if (!exportData) {
        return res.status(404).json({ message: "Video not found" });
      }
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="annotations_${req.params.videoId}.json"`);
      res.json(exportData);
    } catch (error) {
      res.status(500).json({ message: "Failed to export annotations" });
    }
  });

  app.post("/api/annotations/import", async (req, res) => {
    try {
      await storage.importAnnotations(req.body);
      res.json({ success: true, message: "Annotations imported successfully" });
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to import annotations" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
