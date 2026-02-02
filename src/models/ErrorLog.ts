import mongoose from 'mongoose';

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

const ErrorLog = mongoose.model('ErrorLog', errorLogSchema);
export default ErrorLog;
