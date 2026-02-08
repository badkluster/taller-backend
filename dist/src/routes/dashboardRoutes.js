"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dashboardController_1 = require("../controllers/dashboardController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = express_1.default.Router();
router.get('/summary', authMiddleware_1.protect, authMiddleware_1.admin, dashboardController_1.getDashboardSummary);
router.get('/timeseries', authMiddleware_1.protect, authMiddleware_1.admin, dashboardController_1.getDashboardTimeSeries);
exports.default = router;
//# sourceMappingURL=dashboardRoutes.js.map