import mongoose from 'mongoose';

const sequenceSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Number, required: true, default: 0 },
  },
  {
    timestamps: true,
  },
);

const Sequence = mongoose.model('Sequence', sequenceSchema);

export default Sequence;
