import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

let cloudinaryConfigured = false;

function ensureCloudinaryConfigured(): void {
  if (cloudinaryConfigured) {
    return;
  }

  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new AppError(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET',
      500,
      'CLOUDINARY_NOT_CONFIGURED',
    );
  }

  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  cloudinaryConfigured = true;
}

function uploadSinglePhoto(fileBuffer: Buffer, folder: string): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        if (!result) {
          reject(new Error('No upload result returned from Cloudinary'));
          return;
        }

        resolve(result);
      },
    );

    uploadStream.end(fileBuffer);
  });
}

export async function uploadPhotosToCloudinary(files: Express.Multer.File[], folder = 'kribo/photos'): Promise<string[]> {
  ensureCloudinaryConfigured();

  if (!Array.isArray(files) || files.length === 0) {
    throw new AppError('At least one photo file is required', 400, 'PHOTO_FILE_REQUIRED');
  }

  const invalidFile = files.find((file) => {
    const mimeType = file.mimetype.toLowerCase();
    return !mimeType.startsWith('image/') && mimeType !== 'application/pdf';
  });
  if (invalidFile) {
    throw new AppError('Only image files and PDF documents are allowed', 400, 'INVALID_PHOTO_FILE_TYPE');
  }

  const uploaded = await Promise.all(files.map((file) => uploadSinglePhoto(file.buffer, folder)));
  return uploaded.map((item) => item.secure_url);
}
