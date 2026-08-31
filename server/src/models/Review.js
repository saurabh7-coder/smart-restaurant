import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** Null means a review of the restaurant experience rather than a dish. */
    menuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MenuItem',
      default: null,
      index: true,
    },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 800, default: '' },
    isApproved: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

reviewSchema.index({ createdAt: -1 });

export const Review = mongoose.model('Review', reviewSchema);
