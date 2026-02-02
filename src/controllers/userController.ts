import { Request, Response } from 'express';
import User from '../models/User';

// @desc    Get all users (admin)
// @route   GET /api/users
// @access  Private/Admin
export const getUsers = async (req: Request, res: Response) => {
  const pageSize = Number(req.query.pageSize) || 20;
  const page = Number(req.query.pageNumber) || 1;
  const keyword = req.query.keyword
    ? {
        $or: [
          { name: { $regex: req.query.keyword as string, $options: 'i' } },
          { userName: { $regex: req.query.keyword as string, $options: 'i' } },
          { email: { $regex: req.query.keyword as string, $options: 'i' } },
        ],
      }
    : {};

  const baseFilter = { userName: { $ne: 'admin' } };
  const count = await User.countDocuments({ ...baseFilter, ...keyword });
  const users = await User.find({ ...baseFilter, ...keyword })
    .select('-password')
    .limit(pageSize)
    .skip(pageSize * (page - 1))
    .sort({ createdAt: -1 });

  res.json({ users, page, pages: Math.ceil(count / pageSize), totalCount: count });
};

// @desc    Create user (admin)
// @route   POST /api/users
// @access  Private/Admin
export const createUser = async (req: Request, res: Response) => {
  const { name, userName, email, password, role, isActive } = req.body;

  if (!name || !email || !password || !userName) {
    res.status(400);
    throw new Error('Nombre, usuario, email y contraseña son obligatorios');
  }

  const exists = await User.findOne({ email });
  if (exists) {
    res.status(400);
    throw new Error('Ya existe un usuario con ese email');
  }

  const userNameExists = await User.findOne({ userName: String(userName).toLowerCase() });
  if (userNameExists) {
    res.status(400);
    throw new Error('Ya existe un usuario con ese nombre de usuario');
  }

  const user = await User.create({
    name,
    userName,
    email,
    password,
    role: role || 'employee',
    isActive: isActive !== undefined ? isActive : true,
  });

  res.status(201).json({
    _id: user._id,
    name: user.name,
    userName: user.userName,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: (user as any).createdAt,
    updatedAt: (user as any).updatedAt,
  });
};

// @desc    Update user (admin)
// @route   PATCH /api/users/:id
// @access  Private/Admin
export const updateUser = async (req: Request, res: Response) => {
  const { name, userName, email, role, isActive, password } = req.body;

  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('Usuario no encontrado');
  }

  if (email && email !== user.email) {
    const exists = await User.findOne({ email });
    if (exists) {
      res.status(400);
      throw new Error('Ya existe un usuario con ese email');
    }
    user.email = email;
  }

  if (userName && userName !== user.userName) {
    const userNameExists = await User.findOne({ userName: String(userName).toLowerCase() });
    if (userNameExists) {
      res.status(400);
      throw new Error('Ya existe un usuario con ese nombre de usuario');
    }
    user.userName = userName;
  }

  if (name !== undefined) user.name = name;
  if (role !== undefined) user.role = role;
  if (isActive !== undefined) user.isActive = isActive;
  if (password) user.password = password;

  const updated = await user.save();
  res.json({
    _id: updated._id,
    name: updated.name,
    userName: updated.userName,
    email: updated.email,
    role: updated.role,
    isActive: updated.isActive,
    createdAt: (updated as any).createdAt,
    updatedAt: (updated as any).updatedAt,
  });
};

// @desc    Delete user (admin)
// @route   DELETE /api/users/:id
// @access  Private/Admin
export const deleteUser = async (req: Request, res: Response) => {
  if (req.user && req.user._id.toString() === req.params.id) {
    res.status(400);
    throw new Error('No puedes eliminar tu propio usuario');
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('Usuario no encontrado');
  }

  if (user.role === 'admin') {
    const admins = await User.countDocuments({ role: 'admin', isActive: true });
    if (admins <= 1) {
      res.status(400);
      throw new Error('No se puede eliminar el último administrador');
    }
  }

  await user.deleteOne();
  res.json({ message: 'Usuario eliminado' });
};

// @desc    Change own password
// @route   PATCH /api/users/me/password
// @access  Private
export const changeMyPassword = async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400);
    throw new Error('Debes completar la contraseña actual y la nueva');
  }

  if (String(newPassword).length < 6) {
    res.status(400);
    throw new Error('La nueva contraseña debe tener al menos 6 caracteres');
  }

  const user = await User.findById(req.user?._id);
  if (!user) {
    res.status(404);
    throw new Error('Usuario no encontrado');
  }

  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) {
    res.status(400);
    throw new Error('La contraseña actual no es correcta');
  }

  user.password = newPassword;
  await user.save();
  res.json({ message: 'Contraseña actualizada' });
};
