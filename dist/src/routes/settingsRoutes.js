"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const settingsController_1 = require("../controllers/settingsController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = express_1.default.Router();
router.route('/')
    .get(authMiddleware_1.protect, settingsController_1.getSettings)
    .put(authMiddleware_1.protect, authMiddleware_1.admin, settingsController_1.updateSettings);
router.route('/maintenance-reminders/run')
    .post(authMiddleware_1.protect, authMiddleware_1.admin, settingsController_1.runMaintenanceReminders);
router.route('/maintenance-reminders/status')
    .get(authMiddleware_1.protect, authMiddleware_1.admin, settingsController_1.getMaintenanceRemindersStatus);
router.route('/public')
    .get(settingsController_1.getSettings);
exports.default = router;
//# sourceMappingURL=settingsRoutes.js.map