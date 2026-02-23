import { ColumnBaseConfig, ColumnDataType, sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp, jsonb, ExtraConfigColumn, unique, bigint } from "drizzle-orm/pg-core";
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
  label: text("label").notNull(),
  signType: varchar("sign_type", { length: 50 }), // Sign type ID (optional)
  gpsLat: real("gps_lat").notNull(),
  gpsLon: real("gps_lon").notNull(),
  classificationConfidence: real("classification_confidence"),
  detectionConfidence: real("detection_confidence"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const boundingBoxes = pgTable("bounding_boxes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  annotationId: varchar("annotation_id").references(() => annotations.id, { onDelete: "cascade" }).notNull(),
  frameIndex: integer("frame_index").notNull(),
  frameTimestampMs: bigint("frame_timestamp_ms", { mode: "number" }).notNull(),
  bboxX: integer("bbox_x").notNull(),
  bboxY: integer("bbox_y").notNull(),
  bboxWidth: integer("bbox_width").notNull(),
  bboxHeight: integer("bbox_height").notNull(),
  classificationConfidence: real("classification_confidence"),
  detectionConfidence: real("detection_confidence"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  annotationFrameUnique: unique().on(table.annotationId, table.frameIndex),
}));

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
});

export const insertBoundingBoxSchema = createInsertSchema(boundingBoxes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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
export type InsertBoundingBox = z.infer<typeof insertBoundingBoxSchema>;
export type BoundingBox = typeof boundingBoxes.$inferSelect;

// Type pour annotation avec ses bounding boxes
export type AnnotationWithBoundingBoxes = Annotation & { boundingBoxes: BoundingBox[] };

// Additional types for the application
export type GPSPoint = {
  timestamp: number;
  lat: number;
  lon: number;
  frameIndex?: number;
};

// Type pour représenter une bounding box individuelle
export type BoundingBoxData = {
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
    gps: { lat: number; lon: number };
    label: string;
    signType?: string;
    created_at: number;
    updated_at: number;
    classification_confidence?: number;
    detection_confidence?: number;
    boundingBoxes: Array<{
      frame_index: number;
      frame_timestamp_ms: number;
      x: number;
      y: number;
      width: number;
      height: number;
      unit: "pixel";
      classification_confidence?: number;
      detection_confidence?: number;
    }>;
  }>;
};
