"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserProfile = exports.logoutUser = exports.loginUser = void 0;
const User_1 = __importDefault(require("../models/User"));
const generateToken_1 = __importDefault(require("../utils/generateToken"));
const loginUser = async (req, res) => {
    const { email, userName, identifier, password } = req.body;
    const loginValue = (identifier || email || userName || '').toString().trim().toLowerCase();
    if (!loginValue || !password) {
        res.status(400);
        throw new Error('Usuario y contraseña son obligatorios');
    }
    const user = await User_1.default.findOne({
        $or: [{ email: loginValue }, { userName: loginValue }],
    });
    if (user && (await user.matchPassword(password))) {
        if (!user.isActive) {
            res.status(401);
            throw new Error('Cuenta inactiva');
        }
        (0, generateToken_1.default)(res, user._id.toString());
        res.json({
            _id: user._id,
            name: user.name,
            userName: user.userName,
            email: user.email,
            role: user.role,
        });
    }
    else {
        res.status(401);
        throw new Error('Usuario o contraseña inválidos');
    }
};
exports.loginUser = loginUser;
const logoutUser = (req, res) => {
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('jwt', '', {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
        expires: new Date(0),
    });
    res.status(200).json({ message: 'Logged out successfully' });
};
exports.logoutUser = logoutUser;
const getUserProfile = async (req, res) => {
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
exports.getUserProfile = getUserProfile;
//# sourceMappingURL=authController.js.map