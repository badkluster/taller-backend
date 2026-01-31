import express from 'express';
import { upload, uploadImage } from '../controllers/uploadController';
import { protect } from '../middlewares/authMiddleware';

const router = express.Router();

router.post('/', protect as any, upload.single('image'), uploadImage as any);

export default router;
