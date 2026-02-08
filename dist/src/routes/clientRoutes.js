"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const clientController_1 = require("../controllers/clientController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = express_1.default.Router();
router.route('/').get(authMiddleware_1.protect, clientController_1.getClients).post(authMiddleware_1.protect, clientController_1.createClient);
router.route('/:id')
    .get(authMiddleware_1.protect, clientController_1.getClientById)
    .patch(authMiddleware_1.protect, clientController_1.updateClient)
    .delete(authMiddleware_1.protect, clientController_1.deleteClient);
exports.default = router;
//# sourceMappingURL=clientRoutes.js.map