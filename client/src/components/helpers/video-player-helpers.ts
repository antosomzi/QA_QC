import type { Annotation } from "@shared/schema";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Converts mouse coordinates to canvas coordinates
 */
export function getCanvasCoordinates(
  e: React.MouseEvent,
  canvasRef: React.RefObject<HTMLCanvasElement>
): { x: number; y: number } {
  const canvas = canvasRef.current;
  if (!canvas) return { x: 0, y: 0 };

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

/**
 * Checks if coordinates are near an annotation's edge or corner
 */
export function getAnnotationHandle(
  ann: Annotation,
  x: number,
  y: number,
  tolerance = 10
) {
  const { bboxX, bboxY, bboxWidth, bboxHeight } = ann;
  const right = bboxX + bboxWidth;
  const bottom = bboxY + bboxHeight;

  // Check corners
  if (Math.abs(x - bboxX) <= tolerance && Math.abs(y - bboxY) <= tolerance)
    return "nw";
  if (Math.abs(x - right) <= tolerance && Math.abs(y - bboxY) <= tolerance)
    return "ne";
  if (Math.abs(x - bboxX) <= tolerance && Math.abs(y - bottom) <= tolerance)
    return "sw";
  if (Math.abs(x - right) <= tolerance && Math.abs(y - bottom) <= tolerance)
    return "se";

  // Check edges
  if (Math.abs(x - bboxX) <= tolerance && y >= bboxY && y <= bottom)
    return "w";
  if (Math.abs(x - right) <= tolerance && y >= bboxY && y <= bottom)
    return "e";
  if (Math.abs(y - bboxY) <= tolerance && x >= bboxX && x <= right)
    return "n";
  if (Math.abs(y - bottom) <= tolerance && x >= bboxX && x <= right)
    return "s";

  // Check if inside
  if (x >= bboxX && x <= right && y >= bboxY && y <= bottom) return "move";

  return null;
}

/**
 * Finds annotation and handle at coordinates
 */
export function findAnnotationAt(
  x: number,
  y: number,
  annotations: Annotation[],
  currentFrame: number,
  tolerance = 10
) {
  const currentFrameAnnotations = annotations.filter(
    (ann) => ann.frameIndex === currentFrame
  );

  // First check for handles (higher priority)
  for (const ann of currentFrameAnnotations) {
    const handle = getAnnotationHandle(ann, x, y, tolerance);
    if (handle) {
      return { annotation: ann, handle };
    }
  }

  // Then check for general inside bounding box
  const annotation = currentFrameAnnotations.find(
    (ann) =>
      x >= ann.bboxX &&
      x <= ann.bboxX + ann.bboxWidth &&
      y >= ann.bboxY &&
      y <= ann.bboxY + ann.bboxHeight
  );

  return annotation ? { annotation, handle: "move" } : null;
}

/**
 * Formats time in seconds to MM:SS format
 */
export function formatTime(time: number) {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

/**
 * Calculates new bounding box dimensions when resizing
 */
export function calculateResizedBbox(
  selectedAnnotation: Annotation,
  resizeHandle: string,
  coords: { x: number; y: number }
) {
  const { bboxX, bboxY, bboxWidth, bboxHeight } = selectedAnnotation;
  let newBboxX = bboxX;
  let newBboxY = bboxY;
  let newBboxWidth = bboxWidth;
  let newBboxHeight = bboxHeight;

  switch (resizeHandle) {
    case "nw": // North-west (top-left)
      newBboxX = Math.min(coords.x, bboxX + bboxWidth);
      newBboxY = Math.min(coords.y, bboxY + bboxHeight);
      newBboxWidth = Math.abs(coords.x - (bboxX + bboxWidth));
      newBboxHeight = Math.abs(coords.y - (bboxY + bboxHeight));
      break;
    case "ne": // North-east (top-right)
      newBboxX = Math.min(bboxX, coords.x);
      newBboxY = Math.min(coords.y, bboxY + bboxHeight);
      newBboxWidth = Math.abs(coords.x - bboxX);
      newBboxHeight = Math.abs(coords.y - (bboxY + bboxHeight));
      break;
    case "sw": // South-west (bottom-left)
      newBboxX = Math.min(coords.x, bboxX + bboxWidth);
      newBboxY = Math.min(bboxY, coords.y);
      newBboxWidth = Math.abs(coords.x - (bboxX + bboxWidth));
      newBboxHeight = Math.abs(coords.y - bboxY);
      break;
    case "se": // South-east (bottom-right)
      newBboxX = Math.min(bboxX, coords.x);
      newBboxY = Math.min(bboxY, coords.y);
      newBboxWidth = Math.abs(coords.x - bboxX);
      newBboxHeight = Math.abs(coords.y - bboxY);
      break;
    case "n": // North (top)
      newBboxY = Math.min(coords.y, bboxY + bboxHeight);
      newBboxHeight = Math.abs(coords.y - (bboxY + bboxHeight));
      break;
    case "s": // South (bottom)
      newBboxY = bboxY;
      newBboxHeight = Math.abs(coords.y - bboxY);
      break;
    case "w": // West (left)
      newBboxX = Math.min(coords.x, bboxX + bboxWidth);
      newBboxWidth = Math.abs(coords.x - (bboxX + bboxWidth));
      break;
    case "e": // East (right)
      newBboxX = bboxX;
      newBboxWidth = Math.abs(coords.x - bboxX);
      break;
  }

  // Ensure minimum size
  if (newBboxWidth < 10) {
    newBboxWidth = 10;
  }
  if (newBboxHeight < 10) {
    newBboxHeight = 10;
  }

  return {
    bboxX: Math.round(newBboxX),
    bboxY: Math.round(newBboxY),
    bboxWidth: Math.round(newBboxWidth),
    bboxHeight: Math.round(newBboxHeight),
  };
}