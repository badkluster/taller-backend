"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const vehicleController_1 = require("../controllers/vehicleController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = express_1.default.Router();
router.route('/').get(authMiddleware_1.protect, vehicleController_1.getVehicles).post(authMiddleware_1.protect, vehicleController_1.createVehicle);
router.route('/plate/:plate').get(authMiddleware_1.protect, vehicleController_1.getVehicleByPlate);
router.route('/:id')
    .get(authMiddleware_1.protect, vehicleController_1.getVehicleById)
    .patch(authMiddleware_1.protect, vehicleController_1.updateVehicle)
    .delete(authMiddleware_1.protect, vehicleController_1.deleteVehicle);
router.route('/:id/change-owner').post(authMiddleware_1.protect, vehicleController_1.changeVehicleOwner);
exports.default = router;
//# sourceMappingURL=vehicleRoutes.js.map