import type { Annotation as BaseAnnotation } from "@shared/schema";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnnotationWithBBox extends BaseAnnotation {
  bbox: BoundingBox;
}

export interface DrawingState {
  isDrawing: boolean;
  startPoint: { x: number; y: number } | null;
  currentBox: BoundingBox | null;
}

export interface VideoPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  currentFrame: number;
  totalFrames: number;
}

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  frameIndex: number;
  isSelected: boolean;
}

export interface AnnotationFormData {
  label: string;
  frameIndex: number;
  gpsLat: number;
  gpsLon: number;
  bboxX: number;
  bboxY: number;
  bboxWidth: number;
  bboxHeight: number;
}

export interface FileUploadState {
  isUploading: boolean;
  progress: number;
  error: string | null;
}

export interface GPSUploadState extends FileUploadState {
  isProcessing: boolean;
  pointCount: number;
}
