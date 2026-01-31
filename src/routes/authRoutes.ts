import express from 'express';
import { loginUser, logoutUser, getUserProfile } from '../controllers/authController';
import { protect } from '../middlewares/authMiddleware';

const router = express.Router();

router.post('/login', loginUser as any); // Type assertion for now due to express types quirk with async/await
router.post('/logout', logoutUser);
router.get('/me', protect as any, getUserProfile as any);

export default router;
