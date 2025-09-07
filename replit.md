# Video Annotation Tool

## Overview

This is a professional video annotation application that allows users to create georeferenced bounding box annotations on video content. The system synchronizes video frames with GPS data to create spatially-aware annotations that can be visualized on both video and map interfaces. Users can upload videos, associate GPS tracking data, and create precise annotations with geographic coordinates for each frame.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: shadcn/ui components built on Radix UI primitives for consistent, accessible interface components
- **Styling**: Tailwind CSS with a dark theme configuration and custom CSS variables for theming
- **State Management**: TanStack Query for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Map Integration**: Leaflet.js for interactive map functionality with OpenStreetMap tiles

### Backend Architecture
- **Framework**: Express.js with TypeScript for RESTful API endpoints
- **File Upload**: Multer middleware for handling video and GPS file uploads with 500MB file size limits
- **Storage**: In-memory storage implementation with interface for future database integration
- **Development**: Vite integration for hot module replacement and development server proxying

### Data Storage Solutions
- **Database ORM**: Drizzle ORM configured for PostgreSQL with schema-first approach
- **Schema Design**: Three main entities - videos, GPS data, and annotations with proper foreign key relationships
- **Migration System**: Drizzle Kit for database schema migrations and version control
- **Current Storage**: In-memory implementation for development, ready for PostgreSQL production deployment

### File Management
- **Video Storage**: Local filesystem storage in uploads directory with unique filename generation
- **GPS Data**: Support for both CSV and JSON formats with parsing utilities
- **File Validation**: Metadata extraction for video files including duration, FPS, and dimensions

### Core Features Architecture
- **Video Player**: Custom HTML5 video player with frame-accurate navigation and overlay canvas for bounding box drawing
- **Annotation System**: Real-time annotation creation with GPS coordinate association based on frame timestamps
- **Map Synchronization**: Bidirectional sync between video timeline and map markers with drag-and-drop marker repositioning
- **Export/Import**: JSON-based annotation data exchange with structured format for external tool integration

### API Design
- **RESTful Endpoints**: Standardized CRUD operations for videos, GPS data, and annotations
- **File Upload API**: Multipart form data handling for video and GPS file uploads
- **Error Handling**: Centralized error middleware with proper HTTP status codes and error messages
- **Request Logging**: Development middleware for API request tracking and debugging

## External Dependencies

### Database Services
- **Neon Database**: Serverless PostgreSQL provider via @neondatabase/serverless
- **Connection**: Environment-based DATABASE_URL configuration for production deployment

### Map Services
- **Leaflet**: Client-side mapping library loaded via CDN
- **OpenStreetMap**: Free tile service for map visualization
- **Geographic Utilities**: Built-in GPS coordinate interpolation and parsing functions

### Development Tools
- **Replit Integration**: Vite plugins for Replit-specific development features including error overlays and cartographer
- **TypeScript**: Full type safety across client, server, and shared code
- **ESBuild**: Fast bundling for production server builds

### UI Framework Dependencies
- **Radix UI**: Comprehensive set of accessible React components for consistent user interface
- **Lucide React**: Icon library for consistent iconography throughout the application
- **Class Variance Authority**: Type-safe utility for component variant management
- **React Hook Form**: Form validation and management with Zod schema integration

### File Processing
- **Multer**: Express middleware for multipart/form-data file upload handling
- **Native APIs**: Browser File API and HTMLVideoElement for client-side video metadata extraction