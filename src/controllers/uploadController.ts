import { Request, Response } from 'express';
import multer from 'multer';
import cloudinary from '../config/cloudinary';
import { Readable } from 'stream';

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Images only!'));
    }
  },
});

export const uploadImage = async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400);
    throw new Error('No se proporcionó ninguna imagen');
  }

  // Upload to Cloudinary using stream
  const streamUpload = (buffer: Buffer) => {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'planb_evidence' },
        (error, result) => {
          if (result) {
            resolve(result);
          } else {
            reject(error);
          }
        }
      );
      Readable.from(buffer).pipe(stream);
    });
  };

  try {
    const result: any = await streamUpload(req.file.buffer);
    
    res.status(200).json({
      url: result.secure_url,
      publicId: result.public_id,
      originalName: req.file.originalname
    });
  } catch (error) {
    res.status(500);
    throw new Error('Falló la subida de la imagen');
  }
};
