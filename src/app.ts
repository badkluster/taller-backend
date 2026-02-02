import express from "express";
import cors from "cors";
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

const app = express();

// Middlewares
app.use(helmet());
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL
        : "http://localhost:5173",
    credentials: true,
  }),
);
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
app.use("/api/cron", cronRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/users", userRoutes);

// Error Handling
app.use(notFound);
app.use(errorHandler);

export default app;
