import mongoose from 'mongoose';

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

const CronExecution = mongoose.model('CronExecution', cronExecutionSchema);
export default CronExecution;
