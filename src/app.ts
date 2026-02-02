import express from "express";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";

import cookieParser from "cookie-parser";
import { errorHandler, notFound } from "./middlewares/errorMiddleware";

import authRoutes from "./routes/authRoutes";
import uploadRoutes from "./routes/uploadRoutes";
import vehicleRoutes from "./routes/vehicleRoutes";
import clientRoutes from "./routes/clientRoutes";
import appointmentRoutes from "./routes/appointmentRoutes";
import workOrderRoutes from "./routes/workOrderRoutes";
import financeRoutes from "./routes/financeRoutes";
import dashboardRoutes from "./routes/dashboardRoutes";
import campaignRoutes from "./routes/campaignRoutes";
import cronRoutes from "./routes/cronRoutes";
import settingsRoutes from "./routes/settingsRoutes";
import userRoutes from "./routes/userRoutes";
import campaignTemplateRoutes from "./routes/campaignTemplateRoutes";
import errorLogRoutes from "./routes/errorLogRoutes";

const app = express();

const isProd = process.env.NODE_ENV === "production";
const corsOptions: CorsOptions = {
  // Allow requests from any origin (no URL restriction).
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

// Middlewares
app.use(helmet());
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

app.use((req, res, next) => {
  const start = Date.now();
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[RES] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`,
    );
  });
  next();
});

// Routes (Placeholders)
app.get("/", (req, res) => {
  res.send("API is running...");
});

app.use("/api/auth", authRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/workorders", workOrderRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/campaign-templates", campaignTemplateRoutes);
app.use("/api/cron", cronRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/users", userRoutes);
app.use("/api/error-logs", errorLogRoutes);

// Error Handling
app.use(notFound);
app.use(errorHandler);

export default app;
