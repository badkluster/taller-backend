"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.changeMyPassword = exports.deleteUser = exports.updateUser = exports.createUser = exports.getUsers = void 0;
const User_1 = __importDefault(require("../models/User"));
const getUsers = async (req, res) => {
    const pageSize = Number(req.query.pageSize) || 20;
    const page = Number(req.query.pageNumber) || 1;
    const keyword = req.query.keyword
        ? {
            $or: [
                { name: { $regex: req.query.keyword, $options: 'i' } },
                { userName: { $regex: req.query.keyword, $options: 'i' } },
                { email: { $regex: req.query.keyword, $options: 'i' } },
            ],
        }
        : {};
    const baseFilter = { userName: { $ne: 'admin' } };
    const count = await User_1.default.countDocuments({ ...baseFilter, ...keyword });
    const users = await User_1.default.find({ ...baseFilter, ...keyword })
        .select('-password')
        .limit(pageSize)
        .skip(pageSize * (page - 1))
        .sort({ createdAt: -1 });
    res.json({ users, page, pages: Math.ceil(count / pageSize), totalCount: count });
};
exports.getUsers = getUsers;
const createUser = async (req, res) => {
    const { name, userName, email, password, role, isActive } = req.body;
    if (!name || !email || !password || !userName) {
        res.status(400);
        throw new Error('Nombre, usuario, email y contraseña son obligatorios');
    }
    const exists = await User_1.default.findOne({ email });
    if (exists) {
        res.status(400);
        throw new Error('Ya existe un usuario con ese email');
    }
    const userNameExists = await User_1.default.findOne({ userName: String(userName).toLowerCase() });
    if (userNameExists) {
        res.status(400);
        throw new Error('Ya existe un usuario con ese nombre de usuario');
    }
    const user = await User_1.default.create({
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
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    });
};
exports.createUser = createUser;
const updateUser = async (req, res) => {
    const { name, userName, email, role, isActive, password } = req.body;
    const user = await User_1.default.findById(req.params.id);
    if (!user) {
        res.status(404);
        throw new Error('Usuario no encontrado');
    }
    if (email && email !== user.email) {
        const exists = await User_1.default.findOne({ email });
        if (exists) {
            res.status(400);
            throw new Error('Ya existe un usuario con ese email');
        }
        user.email = email;
    }
    if (userName && userName !== user.userName) {
        const userNameExists = await User_1.default.findOne({ userName: String(userName).toLowerCase() });
        if (userNameExists) {
            res.status(400);
            throw new Error('Ya existe un usuario con ese nombre de usuario');
        }
        user.userName = userName;
    }
    if (name !== undefined)
        user.name = name;
    if (role !== undefined)
        user.role = role;
    if (isActive !== undefined)
        user.isActive = isActive;
    if (password)
        user.password = password;
    const updated = await user.save();
    res.json({
        _id: updated._id,
        name: updated.name,
        userName: updated.userName,
        email: updated.email,
        role: updated.role,
        isActive: updated.isActive,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
    });
};
exports.updateUser = updateUser;
const deleteUser = async (req, res) => {
    if (req.user && req.user._id.toString() === req.params.id) {
        res.status(400);
        throw new Error('No puedes eliminar tu propio usuario');
    }
    const user = await User_1.default.findById(req.params.id);
    if (!user) {
        res.status(404);
        throw new Error('Usuario no encontrado');
    }
    if (user.role === 'admin') {
        const admins = await User_1.default.countDocuments({ role: 'admin', isActive: true });
        if (admins <= 1) {
            res.status(400);
            throw new Error('No se puede eliminar el último administrador');
        }
    }
    await user.deleteOne();
    res.json({ message: 'Usuario eliminado' });
};
exports.deleteUser = deleteUser;
const changeMyPassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        res.status(400);
        throw new Error('Debes completar la contraseña actual y la nueva');
    }
    if (String(newPassword).length < 6) {
        res.status(400);
        throw new Error('La nueva contraseña debe tener al menos 6 caracteres');
    }
    const user = await User_1.default.findById(req.user?._id);
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
exports.changeMyPassword = changeMyPassword;
//# sourceMappingURL=userController.js.map