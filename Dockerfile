# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Install ffmpeg for video processing (fluent-ffmpeg dependency)
RUN apk add --no-cache ffmpeg

# Copy package files
COPY package*.json ./

# Install all dependencies (need drizzle-orm for migrations)
RUN npm ci && npm cache clean --force

# Copy built files and migration scripts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/shared ./shared

# Expose the port
EXPOSE 5001

# Set production environment
ENV NODE_ENV=production
ENV PORT=5001

# Run migrations and start the application
CMD ["sh", "-c", "npm run db:migrate && npm start"]
