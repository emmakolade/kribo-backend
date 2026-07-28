import type { Request, Response } from 'express';
import { uploadPhotosToCloudinary } from '../services/media.service';
import { AppError } from '../utils/AppError';

export async function uploadPhotosController(req: Request, res: Response): Promise<void> {
  const files = req.files;
  if (!Array.isArray(files) || files.length === 0) {
    throw new AppError('At least one photo file is required', 400, 'PHOTO_FILE_REQUIRED');
  }

  const urls = await uploadPhotosToCloudinary(files);
  res.status(201).json({
    urls,
  });
}
