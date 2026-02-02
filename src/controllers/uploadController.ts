import { Request, Response } from 'express';
import multer from 'multer';
import { uploadBufferToCloudinary } from '../utils/cloudinaryUpload';

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

export const uploadImage = async (req: Request, res: Response) => {
  const file =
    (req as any).file ||
    ((req as any).files && (req as any).files[0]) ||
    ((req as any).files && (req as any).files.file && (req as any).files.file[0]) ||
    ((req as any).files && (req as any).files.image && (req as any).files.image[0]);

  if (!file) {
    res.status(400);
    throw new Error('No se proporcionó ningún archivo');
  }

  try {
    const resourceType = file.mimetype.startsWith('video/')
      ? 'video'
      : file.mimetype === 'application/pdf' || file.mimetype.startsWith('application/')
      ? 'raw'
      : 'image';

    const result = await uploadBufferToCloudinary(file.buffer, {
      folder: 'planb_evidence',
      resourceType,
    });
    
    res.status(200).json({
      url: result.secure_url,
      publicId: result.public_id,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    });
  } catch (error) {
    res.status(500);
    throw new Error('Falló la subida del archivo');
  }
};
