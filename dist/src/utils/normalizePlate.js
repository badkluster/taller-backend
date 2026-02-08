"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePlate = void 0;
const normalizePlate = (plate) => {
    if (!plate)
        return '';
    return plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
};
exports.normalizePlate = normalizePlate;
//# sourceMappingURL=normalizePlate.js.map