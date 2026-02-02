import cloudinary from '../config/cloudinary';
import { Readable } from 'stream';

type UploadOptions = {
  folder: string;
  resourceType?: 'image' | 'video' | 'raw' | 'auto';
  publicId?: string;
  format?: string;
};

export const uploadBufferToCloudinary = async (buffer: Buffer, options: UploadOptions) => {
  return new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        resource_type: options.resourceType || 'auto',
        public_id: options.publicId,
        format: options.format,
      },
      (error, result) => {
        if (result) {
          resolve({ secure_url: result.secure_url, public_id: result.public_id });
        } else {
          reject(error);
        }
      }
    );
    Readable.from(buffer).pipe(stream);
  });
};
