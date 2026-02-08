"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadBufferToCloudinary = void 0;
const cloudinary_1 = __importDefault(require("../config/cloudinary"));
const stream_1 = require("stream");
const uploadBufferToCloudinary = async (buffer, options) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary_1.default.uploader.upload_stream({
            folder: options.folder,
            resource_type: options.resourceType || 'auto',
            public_id: options.publicId,
            format: options.format,
        }, (error, result) => {
            if (result) {
                resolve({ secure_url: result.secure_url, public_id: result.public_id });
            }
            else {
                reject(error);
            }
        });
        stream_1.Readable.from(buffer).pipe(stream);
    });
};
exports.uploadBufferToCloudinary = uploadBufferToCloudinary;
//# sourceMappingURL=cloudinaryUpload.js.map