"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const financeController_1 = require("../controllers/financeController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = express_1.default.Router();
router.route('/estimates').get(authMiddleware_1.protect, financeController_1.getEstimates).post(authMiddleware_1.protect, financeController_1.createEstimate);
router.route('/estimates/:id/send').post(authMiddleware_1.protect, financeController_1.sendEstimateEmail);
router.route('/invoices').get(authMiddleware_1.protect, financeController_1.getInvoices).post(authMiddleware_1.protect, financeController_1.createInvoice);
router.route('/invoices/:id').delete(authMiddleware_1.protect, financeController_1.deleteInvoice);
router.route('/invoices/:id/send').post(authMiddleware_1.protect, financeController_1.sendInvoiceEmail);
exports.default = router;
//# sourceMappingURL=financeRoutes.js.map