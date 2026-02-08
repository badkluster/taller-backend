"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const appointmentRequestController_1 = require("../controllers/appointmentRequestController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = express_1.default.Router();
router.route('/public/plate/:plate').get(appointmentRequestController_1.getPublicVehicleByPlate);
router.route('/public').post(appointmentRequestController_1.createAppointmentRequest);
router.route('/').get(authMiddleware_1.protect, authMiddleware_1.admin, appointmentRequestController_1.getAppointmentRequests);
router.route('/:id/confirm').post(authMiddleware_1.protect, authMiddleware_1.admin, appointmentRequestController_1.confirmAppointmentRequest);
router.route('/:id/reject').post(authMiddleware_1.protect, authMiddleware_1.admin, appointmentRequestController_1.rejectAppointmentRequest);
exports.default = router;
//# sourceMappingURL=appointmentRequestRoutes.js.map