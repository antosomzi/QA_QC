import type { Annotation, BoundingBox } from "@shared/schema";

export interface DrawingBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Checks if a bounding box has changed significantly to warrant an update
 */
export function hasSignificantChange(initial: BoundingBox, current: BoundingBox): boolean {
  const MIN_CHANGE_THRESHOLD = 2; // 2 pixels minimum change to trigger update
  return (
    Math.abs(initial.bboxX - current.bboxX) >= MIN_CHANGE_THRESHOLD ||
    Math.abs(initial.bboxY - current.bboxY) >= MIN_CHANGE_THRESHOLD ||
    Math.abs(initial.bboxWidth - current.bboxWidth) >= MIN_CHANGE_THRESHOLD ||
    Math.abs(initial.bboxHeight - current.bboxHeight) >= MIN_CHANGE_THRESHOLD
  );
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
 * Compute letterbox-aware transform parameters for a canvas that is scaled
 * via CSS (object-contain behavior on the underlying video).
 */
function getLetterboxTransform(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return {
      scaleAdjustX: 1,
      scaleAdjustY: 1,
      offsetCanvasX: 0,
      offsetCanvasY: 0,
    };
  }

  // Current CSS scaling from canvas space to display space
  const sx = rect.width / canvas.width;
  const sy = rect.height / canvas.height;

  // object-contain uniform scale (the actual displayed video scale)
  const s = Math.min(sx, sy);

  // Display-space offsets due to letterboxing
  const displayOffsetX = (rect.width - canvas.width * s) / 2;
  const displayOffsetY = (rect.height - canvas.height * s) / 2;

  // Convert display-space offsets back into canvas-space offsets
  const offsetCanvasX = displayOffsetX / sx;
  const offsetCanvasY = displayOffsetY / sy;

  // Scale adjustment from video pixel space to canvas space
  const scaleAdjustX = s / sx;
  const scaleAdjustY = s / sy;

  return { scaleAdjustX, scaleAdjustY, offsetCanvasX, offsetCanvasY };
}

/** Map a point from VIDEO pixel space to CANVAS space (letterbox-aware). */
export function mapVideoPointToCanvasPoint(
  canvas: HTMLCanvasElement,
  point: { x: number; y: number }
): { x: number; y: number } {
  const { scaleAdjustX, scaleAdjustY, offsetCanvasX, offsetCanvasY } = getLetterboxTransform(canvas);
  return {
    x: offsetCanvasX + point.x * scaleAdjustX,
    y: offsetCanvasY + point.y * scaleAdjustY,
  };
}

/** Map a point from CANVAS space to VIDEO pixel space (letterbox-aware). */
export function mapCanvasPointToVideoPoint(
  canvas: HTMLCanvasElement,
  point: { x: number; y: number }
): { x: number; y: number } {
  const { scaleAdjustX, scaleAdjustY, offsetCanvasX, offsetCanvasY } = getLetterboxTransform(canvas);
  return {
    x: (point.x - offsetCanvasX) / (scaleAdjustX || 1),
    y: (point.y - offsetCanvasY) / (scaleAdjustY || 1),
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
 * Convert hex color to RGBA with alpha
 */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Get hex color for annotation based on index (for canvas drawing and maps)
 */
export function getAnnotationHexColor(index: number): string {
  // Couleurs "néon" très voyantes pour maximiser la visibilité sur la vidéo
  const colors = [
    '#FF0000', // Rouge vif
    '#00FF00', // Vert fluo
    '#FFFF00', // Jaune vif
    '#FF00FF', // Magenta
    '#00FFFF', // Cyan
    '#FFA500', // Orange vif
    '#FF1493', // Rose profond
    '#7FFF00'  // Chartreuse
  ];
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

/**
 * Sets appropriate cursor style based on bounding box handle type
 */
export function setCursorForHandle(canvas: HTMLCanvasElement, handle: string | null): void {
  if (!handle) {
    canvas.style.cursor = 'crosshair';
    return;
  }

  switch (handle) {
    case 'nw':
    case 'se':
      canvas.style.cursor = 'nwse-resize';
      break;
    case 'ne':
    case 'sw':
      canvas.style.cursor = 'nesw-resize';
      break;
    case 'n':
    case 's':
      canvas.style.cursor = 'ns-resize';
      break;
    case 'w':
    case 'e':
      canvas.style.cursor = 'ew-resize';
      break;
    case 'move':
      canvas.style.cursor = 'move';
      break;
    default:
      canvas.style.cursor = 'crosshair';
  }
}

/**
 * Calculates frame number from video time with offset correction.
 * If ptsData is provided, uses binary search for VFR-accurate mapping.
 * Falls back to CFR calculation (Math.floor + epsilon) when no PTS data.
 */
export function calculateFrameFromTime(time: number, fps: number, ptsData?: number[]): number {
  if (ptsData && ptsData.length > 0) {
    return ptsDataBinarySearch(ptsData, time);
  }
  // CFR fallback: Math.floor + epsilon for consistency
  return Math.floor(time * fps + 0.001);
}

/**
 * Calculates video time from frame number.
 * If ptsData is provided, returns the exact PTS for that frame (VFR-safe).
 * Falls back to mid-frame offset CFR calculation when no PTS data.
 */
export function calculateTimeFromFrame(frame: number, fps: number, ptsData?: number[]): number {
  if (ptsData && frame >= 0 && frame < ptsData.length) {
    // For PTS-based seeking, target the midpoint between this frame's PTS
    // and the next frame's PTS to ensure the browser shows the correct frame.
    // This is the VFR equivalent of the +0.5 mid-frame trick for CFR.
    if (frame + 1 < ptsData.length) {
      return (ptsData[frame] + ptsData[frame + 1]) / 2;
    }
    // Last frame: add a small offset past the PTS
    return ptsData[frame] + 0.001;
  }
  // CFR fallback: +0.3 offset as documented in bug_video_correction.md
  return (frame + 0.3) / fps;
}

/**
 * Binary search to find the closest frame index for a given time in PTS data.
 * Returns the index of the frame whose PTS is closest to the target time.
 * For VFR videos, this is the only correct way to map time → frame.
 */
export function ptsDataBinarySearch(ptsData: number[], time: number): number {
  if (ptsData.length === 0) return 0;
  if (time <= ptsData[0]) return 0;
  if (time >= ptsData[ptsData.length - 1]) return ptsData.length - 1;

  let lo = 0;
  let hi = ptsData.length - 1;

  while (lo < hi - 1) {
    const mid = (lo + hi) >>> 1;
    if (ptsData[mid] <= time) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  // lo is the last frame whose PTS <= time, hi is the first frame whose PTS > time
  // Return whichever is closer
  if (hi < ptsData.length && (time - ptsData[lo]) > (ptsData[hi] - time)) {
    return hi;
  }
  return lo;
}

/**
 * Validates if a bounding box meets minimum size requirements
 */
export function isValidBoundingBoxSize(bbox: { width: number; height: number }, minSize: number = 10): boolean {
  return bbox.width >= minSize && bbox.height >= minSize;
}

/**
 * Check if an annotation has low confidence scores
 * Returns the type of low confidence issue
 */
export function getLowConfidenceIssue(annotation: Annotation & { 
  classificationConfidence?: number | null;
  detectionConfidence?: number | null;
}): {
  isLowConfidence: boolean;
  lowClassification: boolean;
  lowDetection: boolean;
} {
  const LOW_CONFIDENCE_THRESHOLD = 0.3;
  
  const lowClassification = annotation.classificationConfidence !== undefined && 
                            annotation.classificationConfidence !== null && 
                            annotation.classificationConfidence < LOW_CONFIDENCE_THRESHOLD;
  
  const lowDetection = annotation.detectionConfidence !== undefined && 
                       annotation.detectionConfidence !== null && 
                       annotation.detectionConfidence < LOW_CONFIDENCE_THRESHOLD;
  
  return {
    isLowConfidence: lowClassification || lowDetection,
    lowClassification,
    lowDetection
  };
}

/**
 * Creates bounding box data object for API calls
 * Uses actual video currentTime for precise timestamp to avoid drift
 */
export function createBoundingBoxData(
  currentFrame: number,
  currentTime: number,
  bbox: { x: number; y: number; width: number; height: number }
) {
  return {
    frameIndex: currentFrame,
    frameTimestampMs: Math.floor(currentTime * 1000),
    bboxX: Math.round(bbox.x),
    bboxY: Math.round(bbox.y),
    bboxWidth: Math.round(bbox.width),
    bboxHeight: Math.round(bbox.height),
  };
}

/**
 * Draws a bounding box with label on canvas
 */
export function drawBoundingBox(
  ctx: CanvasRenderingContext2D,
  bbox: BoundingBox,
  annotation: Annotation,
  annotations: Annotation[],
  isSelected: boolean,
  options: {
    showHandles?: boolean;
    isDashed?: boolean;
  } = {}
): void {
  const canvas = ctx.canvas;
  const topLeft = mapVideoPointToCanvasPoint(canvas, { x: bbox.bboxX, y: bbox.bboxY });
  const bottomRight = mapVideoPointToCanvasPoint(canvas, { x: bbox.bboxX + bbox.bboxWidth, y: bbox.bboxY + bbox.bboxHeight });
  const drawX = topLeft.x;
  const drawY = topLeft.y;
  const drawW = bottomRight.x - topLeft.x;
  const drawH = bottomRight.y - topLeft.y;
  const annotationColor = getAnnotationColor(annotations, annotation.id);
  // Utiliser un violet néon très distinct pour la sélection (différent de toutes les couleurs d'annotation)
  const strokeColor = isSelected ? '#BF00FF' : annotationColor; // Violet néon électrique
  // Augmenter l'épaisseur des traits pour une meilleure visibilité
  const lineWidth = isSelected ? 6 : 3;

  // Dessiner une ombre portée pour le contraste
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 1;

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  
  if (options.isDashed) {
    ctx.setLineDash([5, 5]);
  }
  
  ctx.strokeRect(drawX, drawY, drawW, drawH);
  
  // Réinit les ombres pour éviter d'affecter le texte ou les autres éléments
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;

  if (options.isDashed) {
    ctx.setLineDash([]);
  }

  // Draw background for label to make it readable
  const fontSize = isSelected ? 32 : 28;
  ctx.font = `bold ${fontSize}px Inter`;
  const text = annotation.signType;
  const metrics = ctx.measureText(text);
  const textHeight = fontSize; // Use the actual font size

  // Fond de la même couleur que la bounding box avec opacité pour meilleure lisibilité
  ctx.fillStyle = hexToRgba(strokeColor, 0.8);
  ctx.fillRect(drawX, drawY - textHeight - 8, metrics.width + 10, textHeight + 8);

  // Draw label text in bright white
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(text, drawX + 5, drawY - 6);
}

/**
 * Draws resize handles on a bounding box
 */
export function drawBoundingBoxHandles(
  ctx: CanvasRenderingContext2D,
  bbox: BoundingBox,
  handleSize: number = 8,
  color: string = '#BF00FF' // Violet néon pour correspondre à la sélection
): void {
  ctx.fillStyle = color;
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 4;


  const canvas = ctx.canvas;
  const topLeft = mapVideoPointToCanvasPoint(canvas, { x: bbox.bboxX, y: bbox.bboxY });
  const bottomRight = mapVideoPointToCanvasPoint(canvas, { x: bbox.bboxX + bbox.bboxWidth, y: bbox.bboxY + bbox.bboxHeight });
  
  const corners = [
    { x: topLeft.x, y: topLeft.y }, // nw
    { x: bottomRight.x, y: topLeft.y }, // ne
    { x: topLeft.x, y: bottomRight.y }, // sw
    { x: bottomRight.x, y: bottomRight.y } // se
  ];
  
  corners.forEach(corner => {
    ctx.fillRect(
      corner.x - handleSize / 2,
      corner.y - handleSize / 2,
      handleSize,
      handleSize
    );
  });
}

/**
 * Draws a temporary bounding box during creation
 */
export function drawTemporaryBoundingBox(
  ctx: CanvasRenderingContext2D,
  bbox: { x: number; y: number; width: number; height: number },
  color: string = '#FF6B6B'
): void {
  const canvas = ctx.canvas;
  const topLeft = mapVideoPointToCanvasPoint(canvas, { x: bbox.x, y: bbox.y });
  const bottomRight = mapVideoPointToCanvasPoint(canvas, { x: bbox.x + bbox.width, y: bbox.y + bbox.height });
  const drawX = topLeft.x;
  const drawY = topLeft.y;
  const drawW = bottomRight.x - topLeft.x;
  const drawH = bottomRight.y - topLeft.y;

  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(drawX, drawY, drawW, drawH);
  ctx.setLineDash([]);
}