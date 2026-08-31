import mongoose from 'mongoose';
import { FOOD_TYPES } from '../constants.js';

const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },
    price: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    image: { type: String, default: '' },
    ingredients: { type: [String], default: [] },
    allergens: { type: [String], default: [] },
    /**
     * 0 = not spicy, 5 = very hot. Guests filter on this constantly at an
     * Indian restaurant, and it is the one thing a photo cannot convey.
     */
    spiceLevel: { type: Number, min: 0, max: 5, default: 0 },

    calories: { type: Number, min: 0, default: null },
    foodType: { type: String, enum: FOOD_TYPES, required: true, index: true },
    isAvailable: { type: Boolean, default: true, index: true },
    isPopular: { type: Boolean, default: false },
    isTodaysSpecial: { type: Boolean, default: false },
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0, min: 0 },
    },
  },
  { timestamps: true },
);

menuItemSchema.index({ name: 'text', description: 'text' });
menuItemSchema.index({ price: 1 });
menuItemSchema.index({ 'rating.average': -1 });

/** Recomputes the cached rating from the Review collection. */
menuItemSchema.statics.refreshRating = async function refreshRating(menuItemId) {
  const Review = mongoose.model('Review');
  const [agg] = await Review.aggregate([
    { $match: { menuItem: new mongoose.Types.ObjectId(String(menuItemId)) } },
    { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  await this.findByIdAndUpdate(menuItemId, {
    'rating.average': agg ? Math.round(agg.average * 10) / 10 : 0,
    'rating.count': agg ? agg.count : 0,
  });
};

export const MenuItem = mongoose.model('MenuItem', menuItemSchema);
