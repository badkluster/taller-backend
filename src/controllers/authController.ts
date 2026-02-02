import { Request, Response } from 'express';
import User from '../models/User';
import generateToken from '../utils/generateToken';

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
export const loginUser = async (req: Request, res: Response) => {
  const { email, userName, identifier, password } = req.body;
  const loginValue = (identifier || email || userName || '').toString().trim().toLowerCase();

  if (!loginValue || !password) {
    res.status(400);
    throw new Error('Usuario y contraseña son obligatorios');
  }

  const user = await User.findOne({
    $or: [{ email: loginValue }, { userName: loginValue }],
  });

  if (user && (await user.matchPassword(password))) {
    if (!user.isActive) {
      res.status(401);
      throw new Error('Cuenta inactiva');
    }
    
    generateToken(res, user._id.toString()); // Convert ObjectId to string

    res.json({
      _id: user._id,
      name: user.name,
      userName: user.userName,
      email: user.email,
      role: user.role,
    });
  } else {
    res.status(401);
    throw new Error('Usuario o contraseña inválidos');
  }
};

// @desc    Logout user / clear cookie
// @route   POST /api/auth/logout
// @access  Public
export const logoutUser = (req: Request, res: Response) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('jwt', '', {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    expires: new Date(0),
  });
  res.status(200).json({ message: 'Logged out successfully' });
};

// @desc    Get user profile
// @route   GET /api/auth/me
// @access  Private
export const getUserProfile = async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401);
    throw new Error('Usuario no encontrado');
  }
  const user = {
    _id: req.user._id,
    name: req.user.name,
    userName: req.user.userName,
    email: req.user.email,
    role: req.user.role,
  };
  res.status(200).json(user);
};
