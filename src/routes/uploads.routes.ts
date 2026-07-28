import { Router } from 'express';
import multer from 'multer';
import { uploadPhotosController } from '../controllers/uploads.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10,
  },
});

export const uploadsRouter = Router();

uploadsRouter.post(
  '/photos',
  requireAuth,
  requireRole(['host', 'guest', 'admin']),
  upload.array('photos', 10),
  uploadPhotosController,
);
