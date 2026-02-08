"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const errorMiddleware_1 = require("./middlewares/errorMiddleware");
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const uploadRoutes_1 = __importDefault(require("./routes/uploadRoutes"));
const vehicleRoutes_1 = __importDefault(require("./routes/vehicleRoutes"));
const clientRoutes_1 = __importDefault(require("./routes/clientRoutes"));
const appointmentRoutes_1 = __importDefault(require("./routes/appointmentRoutes"));
const appointmentRequestRoutes_1 = __importDefault(require("./routes/appointmentRequestRoutes"));
const workOrderRoutes_1 = __importDefault(require("./routes/workOrderRoutes"));
const financeRoutes_1 = __importDefault(require("./routes/financeRoutes"));
const dashboardRoutes_1 = __importDefault(require("./routes/dashboardRoutes"));
const campaignRoutes_1 = __importDefault(require("./routes/campaignRoutes"));
const cronRoutes_1 = __importDefault(require("./routes/cronRoutes"));
const settingsRoutes_1 = __importDefault(require("./routes/settingsRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const campaignTemplateRoutes_1 = __importDefault(require("./routes/campaignTemplateRoutes"));
const errorLogRoutes_1 = __importDefault(require("./routes/errorLogRoutes"));
const app = (0, express_1.default)();
const isProd = process.env.NODE_ENV === "production";
const corsOptions = {
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
};
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)(corsOptions));
app.options(/.*/, (0, cors_1.default)(corsOptions));
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
app.use((req, res, next) => {
    const start = Date.now();
    console.log(`[REQ] ${req.method} ${req.originalUrl}`);
    res.on("finish", () => {
        const duration = Date.now() - start;
        console.log(`[RES] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    });
    next();
});
app.get("/", (req, res) => {
    res.send("API is running...");
});
app.use("/api/auth", authRoutes_1.default);
app.use("/api/uploads", uploadRoutes_1.default);
app.use("/api/vehicles", vehicleRoutes_1.default);
app.use("/api/clients", clientRoutes_1.default);
app.use("/api/appointments", appointmentRoutes_1.default);
app.use("/api/appointment-requests", appointmentRequestRoutes_1.default);
app.use("/api/workorders", workOrderRoutes_1.default);
app.use("/api/finance", financeRoutes_1.default);
app.use("/api/dashboard", dashboardRoutes_1.default);
app.use("/api/campaigns", campaignRoutes_1.default);
app.use("/api/campaign-templates", campaignTemplateRoutes_1.default);
app.use("/api/cron", cronRoutes_1.default);
app.use("/api/settings", settingsRoutes_1.default);
app.use("/api/users", userRoutes_1.default);
app.use("/api/error-logs", errorLogRoutes_1.default);
app.use(errorMiddleware_1.notFound);
app.use(errorMiddleware_1.errorHandler);
exports.default = app;
//# sourceMappingURL=app.js.map