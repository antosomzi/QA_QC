import type { Annotation, BoundingBox } from "@shared/schema";

export interface DrawingBBox {
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
 * Checks if coordinates are near a bounding box's edge or corner
 */
export function getBoundingBoxHandle(
  bbox: BoundingBox,
  x: number,
  y: number,
  tolerance = 10
) {
  const { bboxX, bboxY, bboxWidth, bboxHeight } = bbox;
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
 * Finds bounding box and handle at coordinates
 */
export function findBoundingBoxAt(
  x: number,
  y: number,
  boundingBoxes: BoundingBox[],
  currentFrame: number,
  tolerance = 10
) {
  const currentFrameBoundingBoxes = boundingBoxes.filter(
    (bbox) => bbox.frameIndex === currentFrame
  );

  // First check for handles (higher priority)
  for (const bbox of currentFrameBoundingBoxes) {
    const handle = getBoundingBoxHandle(bbox, x, y, tolerance);
    if (handle) {
      return { boundingBox: bbox, handle };
    }
  }

  // Then check for general inside bounding box
  const boundingBox = currentFrameBoundingBoxes.find(
    (bbox) =>
      x >= bbox.bboxX &&
      x <= bbox.bboxX + bbox.bboxWidth &&
      y >= bbox.bboxY &&
      y <= bbox.bboxY + bbox.bboxHeight
  );

  return boundingBox ? { boundingBox, handle: "move" } : null;
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
 * Get CSS class for annotation marker color based on index
 */
export function getAnnotationCSSColor(index: number): string {
  const colors = ['bg-primary', 'bg-accent', 'bg-yellow-500', 'bg-green-500', 'bg-purple-500'];
  return colors[index % colors.length];
}

/**
 * Get hex color for annotation based on index (for canvas drawing and maps)
 */
export function getAnnotationHexColor(index: number): string {
  const colors = ['#3B82F6', '#8B5CF6', '#EAB308', '#10B981', '#A855F7'];
  //               primary    accent    yellow-500 green-500 purple-500
  return colors[index % colors.length];
}

/**
 * Get annotation index from annotations array by annotation ID
 */
export function getAnnotationIndex(annotations: Annotation[], annotationId: string): number {
  return annotations.findIndex(ann => ann.id === annotationId);
}

/**
 * Get consistent color for an annotation based on its ID (not index)
 * This ensures the color doesn't change when annotations are reordered
 */
export function getAnnotationColor(annotations: Annotation[], annotationId: string): string {
  // Use a simple hash of the annotation ID to get a consistent color
  let hash = 0;
  for (let i = 0; i < annotationId.length; i++) {
    const char = annotationId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Use absolute value to ensure positive index
  const colorIndex = Math.abs(hash) % 5;
  return getAnnotationHexColor(colorIndex);
}

/**
 * Calculates new bounding box dimensions when resizing
 */
export function calculateResizedBbox(
  selectedBoundingBox: BoundingBox,
  resizeHandle: string,
  coords: { x: number; y: number }
) {
  const { bboxX, bboxY, bboxWidth, bboxHeight } = selectedBoundingBox;
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