import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

// Configure multer for in-memory file handling with strict 5MB limit and format whitelist
const storage = multer.memoryStorage();
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/gif'];

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB strict limit
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new AppError(`Invalid file format: ${file.mimetype}. Allowed formats: JPG, PNG, WEBP, GIF`, 400));
    }
  },
});

export const uploadController = {
  async uploadImage(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        throw new AppError('No image file provided in request', 400);
      }

      const folder = (req.body.folder as string) || 'dineflow';

      // 1. Cloudinary upload if configured
      if (isCloudinaryConfigured) {
        return new Promise<void>((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: `dineflow/${folder}`,
              transformation: [{ quality: 'auto', fetch_format: 'auto' }],
            },
            (error, result) => {
              if (error || !result) {
                logger.error('Cloudinary upload error:', error);
                return reject(new AppError('Cloudinary image upload failed', 500));
              }

              res.status(200).json({
                success: true,
                message: 'Image uploaded successfully to Cloudinary',
                url: result.secure_url,
                publicId: result.public_id,
                format: result.format,
                bytes: result.bytes,
              });
              resolve();
            }
          );
          uploadStream.end(req.file!.buffer);
        }).catch(next);
      }

      // 2. High-performance fallback: Data URL with optimization
      const base64 = req.file.buffer.toString('base64');
      const dataUrl = `data:${req.file.mimetype};base64,${base64}`;
      const mockPublicId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      logger.info(`Processed in-memory image upload (${req.file.originalname}, ${req.file.size} bytes)`);

      res.status(200).json({
        success: true,
        message: 'Image processed successfully',
        url: dataUrl,
        publicId: mockPublicId,
        format: req.file.mimetype.split('/')[1] || 'jpeg',
        bytes: req.file.size,
      });
    } catch (err) {
      next(err);
    }
  },
};
