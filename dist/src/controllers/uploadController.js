"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadImage = exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const cloudinaryUpload_1 = require("../utils/cloudinaryUpload");
const storage = multer_1.default.memoryStorage();
exports.upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 },
});
const uploadImage = async (req, res) => {
    const file = req.file ||
        (req.files && req.files[0]) ||
        (req.files && req.files.file && req.files.file[0]) ||
        (req.files && req.files.image && req.files.image[0]);
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
        const result = await (0, cloudinaryUpload_1.uploadBufferToCloudinary)(file.buffer, {
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
    }
    catch (error) {
        res.status(500);
        throw new Error('Falló la subida del archivo');
    }
};
exports.uploadImage = uploadImage;
//# sourceMappingURL=uploadController.js.map