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

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Expose the port
EXPOSE 5001

# Set production environment
ENV NODE_ENV=production
ENV PORT=5001

# Start the application
CMD ["npm", "start"]
