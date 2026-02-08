"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const appointmentController_1 = require("../controllers/appointmentController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = express_1.default.Router();
router.route('/').get(authMiddleware_1.protect, appointmentController_1.getAppointments).post(authMiddleware_1.protect, appointmentController_1.createAppointment);
router.route('/:id')
    .patch(authMiddleware_1.protect, appointmentController_1.updateAppointment)
    .delete(authMiddleware_1.protect, appointmentController_1.deleteAppointment);
router.route('/:id/cancel').post(authMiddleware_1.protect, appointmentController_1.cancelAppointment);
router.route('/:id/convert-to-workorder').post(authMiddleware_1.protect, appointmentController_1.convertToWorkOrder);
exports.default = router;
//# sourceMappingURL=appointmentRoutes.js.map