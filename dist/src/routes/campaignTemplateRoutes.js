"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middlewares/authMiddleware");
const campaignTemplateController_1 = require("../controllers/campaignTemplateController");
const router = express_1.default.Router();
router.route('/').get(authMiddleware_1.protect, authMiddleware_1.admin, campaignTemplateController_1.getCampaignTemplates).post(authMiddleware_1.protect, authMiddleware_1.admin, campaignTemplateController_1.createCampaignTemplate);
router.route('/:id').delete(authMiddleware_1.protect, authMiddleware_1.admin, campaignTemplateController_1.deleteCampaignTemplate);
exports.default = router;
//# sourceMappingURL=campaignTemplateRoutes.js.map