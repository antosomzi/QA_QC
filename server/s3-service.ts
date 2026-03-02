/**
 * S3 service for video storage management.
 * Inspired by the traffic-sign app's s3_service.py.
 *
 * Bucket layout:
 *   s3://<S3_BUCKET_NAME>/video/<environment>/<videoId>/<filename>
 *
 * Environment is derived from NODE_ENV:
 *   - "production"   → video/production/
 *   - anything else  → video/development/
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Configuration (read once at import time)
// ---------------------------------------------------------------------------

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || "qa-qc-app";
const S3_REGION = process.env.S3_REGION || "us-east-2";
const ENVIRONMENT = process.env.NODE_ENV === "production" ? "production" : "development";
const S3_VIDEO_PREFIX = `video/${ENVIRONMENT}/`;

/** Duration (in seconds) for presigned GET URLs. Default: 1 hour. */
const PRESIGNED_URL_EXPIRY = 3600;

// ---------------------------------------------------------------------------
// S3 Client (singleton)
// ---------------------------------------------------------------------------

const s3Client = new S3Client({ region: S3_REGION });

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Build the S3 object key for a video file.
 *
 * Uses the video filename (assumed unique, e.g. timestamp-based) as the
 * folder name so the path is human-readable in the S3 console.
 *
 * @param filename – original video filename, e.g. "2025_06_01_14_22_cam.mp4"
 * @returns e.g. "video/development/2025_06_01_14_22_cam.mp4"
 */
export function buildS3Key(filename: string): string {
  return `${S3_VIDEO_PREFIX}${filename}`;
}

/**
 * Upload a local file to S3.
 *
 * @param localPath – absolute path to the file on disk
 * @param s3Key     – target S3 key (use {@link buildS3Key})
 * @returns the s3Key that was written
 */
export async function uploadVideoToS3(localPath: string, s3Key: string): Promise<string> {
  const fileStream = fs.createReadStream(localPath);
  const fileSize = fs.statSync(localPath).size;

  console.log(`📤 Uploading video to S3: s3://${S3_BUCKET_NAME}/${s3Key} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
      Body: fileStream,
      ContentType: "video/mp4",
      StorageClass: "STANDARD",
    }),
  );

  console.log(`✅ Video uploaded to S3: ${s3Key}`);
  return s3Key;
}

/**
 * Generate a presigned GET URL so the browser can stream the video directly
 * from S3 without proxying through the server.
 *
 * @param s3Key – the object key in S3
 * @param expiresIn – validity in seconds (default 1 h)
 */
export async function getPresignedVideoUrl(
  s3Key: string,
  expiresIn: number = PRESIGNED_URL_EXPIRY,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: s3Key,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Delete a video object from S3.
 *
 * @returns true if the delete call succeeded (idempotent – returns true even
 *          if the object didn't exist).
 */
export async function deleteVideoFromS3(s3Key: string): Promise<boolean> {
  try {
    console.log(`🗑️  Deleting video from S3: ${s3Key}`);
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: s3Key,
      }),
    );
    console.log(`✅ Video deleted from S3: ${s3Key}`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to delete video from S3: ${err}`);
    return false;
  }
}

/**
 * Check whether an object exists in S3 (HEAD request).
 */
export async function videoExistsInS3(s3Key: string): Promise<boolean> {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: s3Key,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

// Re-export config values for logging / debugging
export const s3Config = {
  bucket: S3_BUCKET_NAME,
  region: S3_REGION,
  environment: ENVIRONMENT,
  prefix: S3_VIDEO_PREFIX,
} as const;
