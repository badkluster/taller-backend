"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const campaignController_1 = require("../controllers/campaignController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = express_1.default.Router();
router.route('/').get(authMiddleware_1.protect, authMiddleware_1.admin, campaignController_1.getCampaigns).post(authMiddleware_1.protect, authMiddleware_1.admin, campaignController_1.createCampaign);
router.route('/:id/send').post(authMiddleware_1.protect, authMiddleware_1.admin, campaignController_1.sendCampaign);
router.route('/track/open').get(campaignController_1.trackOpen);
exports.default = router;
//# sourceMappingURL=campaignRoutes.js.map