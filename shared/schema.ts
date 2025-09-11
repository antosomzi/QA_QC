import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const videos = pgTable("videos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  duration: real("duration"), // in seconds
  fps: real("fps"),
  width: integer("width"),
  height: integer("height"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const gpsData = pgTable("gps_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  videoId: varchar("video_id").references(() => videos.id),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  data: jsonb("data").notNull(), // Array of GPS points with timestamps
  createdAt: timestamp("created_at").defaultNow(),
});

export const annotations = pgTable("annotations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  videoId: varchar("video_id").references(() => videos.id),
  frameIndex: integer("frame_index").notNull(),
  frameTimestampMs: integer("frame_timestamp_ms").notNull(),
  gpsLat: real("gps_lat").notNull(),
  gpsLon: real("gps_lon").notNull(),
  bboxX: integer("bbox_x").notNull(),
  bboxY: integer("bbox_y").notNull(),
  bboxWidth: integer("bbox_width").notNull(),
  bboxHeight: integer("bbox_height").notNull(),
  label: text("label").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertVideoSchema = createInsertSchema(videos).omit({
  id: true,
  createdAt: true,
});

export const insertGpsDataSchema = createInsertSchema(gpsData).omit({
  id: true,
  createdAt: true,
});

export const insertAnnotationSchema = createInsertSchema(annotations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type Video = typeof videos.$inferSelect;
export type InsertGpsData = z.infer<typeof insertGpsDataSchema>;
export type GpsData = typeof gpsData.$inferSelect;
export type InsertAnnotation = z.infer<typeof insertAnnotationSchema>;
export type Annotation = typeof annotations.$inferSelect;

// Additional types for the application
export type GPSPoint = {
  timestamp: number;
  lat: number;
  lon: number;
  frameIndex?: number;
};

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AnnotationExport = {
  video: {
    video_id: string;
    original_name: string;
    fps: number;
    duration_ms: number;
  };
  annotations: Array<{
    id: string;
    frame_index: number;
    frame_timestamp_ms: number;
    gps: { lat: number; lon: number };
    bbox: {
      x: number;
      y: number;
      width: number;
      height: number;
      unit: "pixel";
    };
    label: string;
    created_at: number;
    updated_at: number;
  }>;
};
