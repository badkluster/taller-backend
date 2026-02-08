"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middlewares/authMiddleware");
const errorLogController_1 = require("../controllers/errorLogController");
const router = express_1.default.Router();
const superUserOnly = (req, res, next) => {
    if (req.user?.userName === 'admin')
        return next();
    res.status(403);
    throw new Error('No autorizado');
};
router.route('/').get(authMiddleware_1.protect, authMiddleware_1.admin, superUserOnly, errorLogController_1.getErrorLogs);
router.route('/:id').delete(authMiddleware_1.protect, authMiddleware_1.admin, superUserOnly, errorLogController_1.deleteErrorLog);
exports.default = router;
//# sourceMappingURL=errorLogRoutes.js.map