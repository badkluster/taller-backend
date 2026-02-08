"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveLogoUrl = exports.getDefaultLogoBuffer = exports.getDefaultLogoDataUrl = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
let cachedLogoDataUrl = null;
let cachedLogoBuffer = null;
const resolveLogoPath = () => path_1.default.resolve(__dirname, '../../assets/logo-taller-sf.png');
const getDefaultLogoDataUrl = () => {
    if (process.env.DEFAULT_LOGO_URL)
        return process.env.DEFAULT_LOGO_URL;
    if (cachedLogoDataUrl)
        return cachedLogoDataUrl;
    try {
        const file = fs_1.default.readFileSync(resolveLogoPath());
        cachedLogoDataUrl = `data:image/png;base64,${file.toString('base64')}`;
        return cachedLogoDataUrl;
    }
    catch {
        return undefined;
    }
};
exports.getDefaultLogoDataUrl = getDefaultLogoDataUrl;
const getDefaultLogoBuffer = () => {
    if (cachedLogoBuffer)
        return cachedLogoBuffer;
    try {
        cachedLogoBuffer = fs_1.default.readFileSync(resolveLogoPath());
        return cachedLogoBuffer;
    }
    catch {
        return undefined;
    }
};
exports.getDefaultLogoBuffer = getDefaultLogoBuffer;
const resolveLogoUrl = (logoUrl) => logoUrl || (0, exports.getDefaultLogoDataUrl)();
exports.resolveLogoUrl = resolveLogoUrl;
//# sourceMappingURL=branding.js.map