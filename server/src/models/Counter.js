import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

/**
 * Atomic sequence generator. Used for human-readable reservation IDs so two
 * simultaneous bookings can never be handed the same number.
 */
counterSchema.statics.next = async function next(key) {
  const doc = await this.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
  return doc.seq;
};

export const Counter = mongoose.model('Counter', counterSchema);
