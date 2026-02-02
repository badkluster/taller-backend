import jwt from 'jsonwebtoken';
import { Response } from 'express';

const generateToken = (res: Response, userId: string) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET as string, {
    expiresIn: '30d',
  });

  const isProd = process.env.NODE_ENV === 'production';
  // Storing in cookie as per requirement/choice (secure, httpOnly)
  res.cookie('jwt', token, {
    httpOnly: true,
    secure: isProd,
    // Cross-site cookie in prod (frontend and backend on different domains)
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
};

export default generateToken;
