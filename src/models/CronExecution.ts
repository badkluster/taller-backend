import mongoose from 'mongoose';

const LOG_RETENTION_SECONDS = 7 * 24 * 60 * 60;

const cronExecutionSchema = new mongoose.Schema(
  {
    job: { type: String, required: true },
    dayKey: { type: String, required: true },
  },
  {
    timestamps: true,
  },
);

cronExecutionSchema.index({ job: 1, dayKey: 1 }, { unique: true });
cronExecutionSchema.index({ createdAt: 1 }, { expireAfterSeconds: LOG_RETENTION_SECONDS });

const CronExecution = mongoose.model('CronExecution', cronExecutionSchema);
export default CronExecution;
