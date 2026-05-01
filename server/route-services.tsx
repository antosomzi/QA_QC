import fs from 'fs'; 
import { buildS3Key, uploadVideoToS3, videoExistsInS3 } from './s3-service';
import { insertVideoSchema } from '@shared/schema';
import path from 'path';
import { storage } from './storage-postgres';
import { extractPtsData, getVideoMetadata } from './video-utils';


export const deleteTempFile = (filePath: string) => {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

export async function resolvePtsDataForUpload(
  videoFilePath: string,
  isEffectivelyCfr: boolean | null,
  logPrefix: string,
): Promise<number[] | null> {
  console.log(`[${logPrefix}] Auto frame-sync detection started (CFR/VFR)`);

  if (isEffectivelyCfr === true) {
    console.log(`[${logPrefix}] Frame-sync decision: CFR => skip PTS extraction`);
    return null;
  }

  try {
    const extractedPts = await extractPtsData(videoFilePath);
    console.log(`[${logPrefix}] Frame-sync decision: VFR/unknown => store PTS (${extractedPts.length} frames)`);
    return extractedPts;
  } catch (error) {
    console.warn(`[${logPrefix}] Failed to auto-detect frame-sync mode from PTS:`, error);
    return null;
  }
}


// 1. La fonction commune qui gère toute la logique d'upload
export async function processAndStoreVideo(req: any, res: any, project: any) {

  const { filename, originalname } = req.file;
  const tempPath = path.join('uploads', filename);
  const folderName = path.parse(originalname).name;

  const abort = (status: number, message: string) => {
    deleteTempFile(tempPath);
    return res.status(status).json({ message });
  };

  try {
    // Vérification des doublons dans ce projet
    const existingFolders = await storage.getFoldersByProjectId(project.id);
    if (existingFolders.some(f => f.name === folderName)) {
      return abort(409, `A recording named "${folderName}" already exists in this project.`);
    }

    // Création du dossier lié au projet
    const folder = await storage.createFolder({ name: folderName, projectId: project.id });

    // Gestion S3
    const s3Key = buildS3Key(filename);
    const alreadyInS3 = await videoExistsInS3(s3Key);

    // Préparation des données par défaut
    let videoData: {
      filename: string;
      originalName: string;
      folderId: string;
      s3Key?: string;
      ptsData: number[] | null;
      duration: number;
      fps: number;
      width: number;
      height: number;
    } = {
      filename,
      originalName: originalname,
      folderId: folder.id,
      s3Key: alreadyInS3 ? s3Key : undefined,
      ptsData: null,
      duration: req.body.duration ? parseFloat(req.body.duration) : 0,
      fps: req.body.fps ? parseFloat(req.body.fps) : 30,
      width: req.body.width ? parseInt(req.body.width) : 0,
      height: req.body.height ? parseInt(req.body.height) : 0,
    };
    
    let isEffectivelyCfr: boolean | null = null;

    if (!alreadyInS3) {
      try {
        const metadata = await getVideoMetadata(tempPath);
        videoData = {
          ...videoData,
          fps: metadata.fps,
          duration: metadata.duration,
          width: metadata.width,
          height: metadata.height,
        };
        isEffectivelyCfr = metadata.isEffectivelyCfr;
      } catch (e) {
        console.warn(
          `[upload-video] Metadata probe failed, using defaults:`,
          e instanceof Error ? e.message : String(e),
        );
      }

      videoData.ptsData = await resolvePtsDataForUpload(tempPath, isEffectivelyCfr, "upload-video");
    }

    // Validation et création en Base de Données
    const validatedData = insertVideoSchema.parse(videoData);
    const video = await storage.createVideo(validatedData);

    // Upload vers S3 ou nettoyage
    if (alreadyInS3) {
      console.log(`[upload-video] Reused existing S3 object: ${s3Key}`);
      deleteTempFile(tempPath);
    } else {
      try {
        await uploadVideoToS3(tempPath, s3Key);
        await storage.updateVideo(video.id, { s3Key });
        video.s3Key = s3Key;
      } catch (s3Error) {
        console.error(`[upload-video] Failed to upload to S3:`, s3Error);
      } finally {
        deleteTempFile(tempPath);
      }
    }

    return res.json({ folder, video });

  } catch (error) {
    return abort(400, error instanceof Error ? error.message : "Failed to upload video");
  }
}