"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const workOrderController_1 = require("../controllers/workOrderController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = express_1.default.Router();
router.route('/')
    .get(authMiddleware_1.protect, workOrderController_1.getWorkOrders)
    .post(authMiddleware_1.protect, workOrderController_1.createWorkOrder);
router.route('/:id')
    .get(authMiddleware_1.protect, workOrderController_1.getWorkOrderById)
    .patch(authMiddleware_1.protect, workOrderController_1.updateWorkOrder)
    .delete(authMiddleware_1.protect, workOrderController_1.deleteWorkOrder);
router.route('/:id/evidence').post(authMiddleware_1.protect, workOrderController_1.addEvidence);
exports.default = router;
//# sourceMappingURL=workOrderRoutes.js.map