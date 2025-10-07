# Video Annotation Tool - AI Coding Agent Guide

## Overview
This is a professional video annotation application that creates georeferenced bounding box annotations on video content synchronized with GPS data. Users upload videos with GPS tracking data to create spatially-aware annotations visualized on both video and map interfaces.

## Architecture Fundamentals

### Tech Stack
- **Frontend**: React + TypeScript with Vite, shadcn/ui (Radix UI), TailwindCSS
- **Backend**: Express.js + TypeScript with Drizzle ORM  
- **Database**: PostgreSQL (local development)
- **Map**: Leaflet.js with OpenStreetMap tiles
- **State**: TanStack Query for server state, React hooks for local state

### Core Directory Structure
```
client/src/           # React frontend
  components/         # UI components (video-player, map-panel, etc.)
  pages/             # Route components (annotation-tool.tsx)
  lib/               # Utilities (gps-utils.ts, queryClient.ts)
server/              # Express backend
  routes.ts          # All API endpoints
  storage*.ts        # Database abstraction layer
shared/              # Type definitions and schemas
  schema.ts          # Drizzle schema + Zod validation
```

## Key Data Flow Patterns

### GPS-Video Synchronization Logic
GPS data is interpolated to match video frames using precise timestamp correlation:

```typescript
// Frame-to-GPS coordinate lookup with interpolation
const gpsPoint = getGPSForFrame(gpsPoints, frameIndex, fps);
// Implementation: client/src/lib/gps-utils.ts
```

**Critical GPS Synchronization Details:**
- GPS data supports CSV (timestamp_ms,lat,lon) and JSON formats
- Timestamps are interpolated between GPS points when exact frame matches don't exist
- GPS coordinates are calculated using linear interpolation between nearest GPS points
- Video time (seconds) is converted to frame index: `Math.round(time * fps)`

### Video Player Frame Management
The video player uses a sophisticated frame synchronization system:

**Single Source of Truth Pattern:**
```typescript
// Video time drives frame updates, not the reverse
const handleTimeUpdate = useCallback(() => {
  if (isManualNavigation) return; // Skip during manual navigation
  const time = videoRef.current.currentTime;
  const frame = Math.round(time * video.fps); // Math.round for better sync
  if (frame !== currentFrame) {
    onFrameChange(frame);
  }
}, [video.fps, onFrameChange, isManualNavigation, currentFrame]);
```

**Manual Frame Navigation System:**
```typescript
// Precise frame-by-frame navigation with temporal positioning
const navigateToFrame = useCallback((targetFrame: number) => {
  setIsManualNavigation(true);
  // Position at middle of frame for reliable display update
  const targetTime = (targetFrame + 0.5) / video.fps;
  videoRef.current.currentTime = targetTime;
  onFrameChange(targetFrame);
  setTimeout(() => setIsManualNavigation(false), 100);
}, [video.fps, onFrameChange]);
```

**Key Video Player Insights:**
- Uses `+0.5` frame offset to position cursor in middle of target frame
- This prevents visual update bugs when navigating between nearby frames  
- Manual navigation temporarily disables automatic time-based updates
- `Math.round()` provides better frame synchronization than `Math.floor()`

### Annotation-BoundingBox Relationship
Core domain model separating objects from their temporal positions:
- **One annotation** = one detected object with fixed GPS coordinates
- **Multiple bounding boxes** = same object tracked across different video frames
- GPS coordinates stored at annotation level (interpolated from first detection frame)
- Unique constraint: `(annotationId, frameIndex)` prevents duplicate boxes per frame

### Bidirectional Map-Video Sync
- Video frame changes → update map marker positions
- Map marker click → navigate video to corresponding frame
- Drag marker on map → update annotation GPS coordinates

## Essential Development Commands

```bash
# Development (runs both client + server)
npm run dev

# Database operations
npm run db:push              # Push schema changes to DB
# No migrations - uses Drizzle push mode

# Production build
npm run build               # Builds client + server bundle
npm start                  # Runs production server
```

## Critical Code Patterns

### API Request Pattern
All API calls use centralized `apiRequest` function:
```typescript
// In: client/src/lib/queryClient.ts
const response = await apiRequest("POST", "/api/annotations", data);
```

### File Upload Strategy
- Videos/GPS files uploaded to `uploads/` directory
- Multer handles multipart uploads with 500MB limit
- Original filenames preserved for user clarity

### Canvas Drawing System
Video player uses HTML5 canvas overlay for bounding box interaction:
```typescript
// Drawing state managed in video-player.tsx
// Helper functions in components/helpers/video-player-helpers.ts
const canvasCoords = getCanvasCoordinates(e, canvasRef);
```

### Database Schema Key Points
- UUID primary keys with PostgreSQL `gen_random_uuid()`
- Cascade deletes: project → folder → video → annotations → bounding boxes
- GPS data stored as JSONB array in `gps_data.data`
- Unique constraint on `(annotationId, frameIndex)` for bounding boxes

## Integration Points

### External Dependencies
- **Leaflet**: Loaded via CDN in `client/index.html`
- **PostgreSQL**: Local database via standard `postgres` driver (not Neon)
- **Replit Platform**: Development plugins in `vite.config.ts`

### Component Communication
- Parent-child props for data flow
- TanStack Query for server state caching
- Toast notifications via shadcn/ui toast system

## Development Conventions

### Error Handling
- API errors return structured JSON with `message` field
- Client displays errors via toast notifications
- Missing GPS data treated as non-blocking (shows upload prompt)

### Styling Approach
- TailwindCSS with custom CSS variables for theming
- Dark theme configured in `tailwind.config.ts`
- Responsive design with explicit height calculations for panels

### Type Safety
- Shared types in `shared/schema.ts` used across frontend/backend
- Zod schemas for runtime validation
- Interface definitions in `client/src/types/` for component-specific types

When working on this codebase, prioritize understanding the GPS-video synchronization logic and the annotation-bounding box relationship, as these are the core domain concepts that drive all feature development.
