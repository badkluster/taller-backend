import mongoose from 'mongoose';

const LOG_RETENTION_SECONDS = 7 * 24 * 60 * 60;

const errorLogSchema = new mongoose.Schema(
  {
    message: { type: String, required: true },
    stack: { type: String },
    statusCode: { type: Number },
    path: { type: String },
    method: { type: String },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    requestBody: { type: mongoose.Schema.Types.Mixed },
    requestQuery: { type: mongoose.Schema.Types.Mixed },
    requestParams: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true },
);

// MongoDB removes expired documents automatically via its TTL monitor.
errorLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: LOG_RETENTION_SECONDS });

const ErrorLog = mongoose.model('ErrorLog', errorLogSchema);
export default ErrorLog;
