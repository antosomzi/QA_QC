import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const folders = pgTable("folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const videos = pgTable("videos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  duration: real("duration"), // in seconds
  fps: real("fps"),
  width: integer("width"),
  height: integer("height"),
  folderId: varchar("folder_id").references(() => folders.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const gpsData = pgTable("gps_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  videoId: varchar("video_id").references(() => videos.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  data: jsonb("data").notNull(), // Array of GPS points with timestamps
  createdAt: timestamp("created_at").defaultNow(),
});

export const annotations = pgTable("annotations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  folderId: varchar("folder_id").references(() => folders.id, { onDelete: "cascade" }).notNull(), // Required folder reference
  videoId: varchar("video_id").references(() => videos.id, { onDelete: "cascade" }), // Optional video reference
  frameIndex: integer("frame_index"), // Optional - only for video-based annotations
  frameTimestampMs: integer("frame_timestamp_ms"), // Optional - only for video-based annotations
  gpsLat: real("gps_lat").notNull(), // Required - GPS coordinates for map display
  gpsLon: real("gps_lon").notNull(), // Required - GPS coordinates for map display
  bboxX: integer("bbox_x").notNull(),
  bboxY: integer("bbox_y").notNull(),
  bboxWidth: integer("bbox_width").notNull(),
  bboxHeight: integer("bbox_height").notNull(),
  label: text("label").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFolderSchema = createInsertSchema(folders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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
}).partial({
  videoId: true,
  frameIndex: true,
  frameTimestampMs: true,
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertFolder = z.infer<typeof insertFolderSchema>;
export type Folder = typeof folders.$inferSelect;
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

export type VideoInfo = {
  video_id: string;
  original_name: string;
  fps: number;
  duration_ms: number;
};

export type AnnotationExport = {
  video?: VideoInfo;
  annotations: Array<{
    id: string;
    frame_index?: number;
    frame_timestamp_ms?: number;
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