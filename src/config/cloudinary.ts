import { v2 as cloudinary } from 'cloudinary';
import { logger } from '../utils/logger.js';

const isConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (isConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  logger.info('Cloudinary initialized with custom credentials');
} else {
  logger.info('Cloudinary not configured with API keys. Using direct image URLs and optimized placeholders.');
}

export { cloudinary, isConfigured as isCloudinaryConfigured };
