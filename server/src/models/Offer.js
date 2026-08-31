import mongoose from 'mongoose';

const offerSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 24,
    },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    discountType: { type: String, enum: ['percent', 'flat'], default: 'percent' },
    discountValue: { type: Number, required: true, min: 0 },
    minGuests: { type: Number, default: 1, min: 1 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    /**
     * Total uses allowed across ALL customers. null = unlimited.
     * Use this for a genuinely scarce promotion ("first 100 orders").
     */
    usageLimit: { type: Number, default: null, min: 1 },
    usedCount: { type: Number, default: 0, min: 0 },

    /**
     * Uses allowed per customer. null = unlimited.
     *
     * This is what a welcome offer actually needs: 1 here means every customer
     * may use it once, forever, without a shared pool running dry. Capping only
     * the global total meant the first few customers consumed the whole offer
     * and everyone afterwards was refused — which looks exactly like a broken
     * promo code.
     */
    perCustomerLimit: { type: Number, default: null, min: 1 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

offerSchema.methods.validityError = function validityError(guests, now = new Date()) {
  if (!this.isActive) return 'This offer is no longer active.';
  if (now < this.startDate) return 'This offer has not started yet.';
  if (now > this.endDate) return 'This offer has expired.';
  if (guests < this.minGuests) return `This offer requires at least ${this.minGuests} guests.`;
  if (this.usageLimit !== null && this.usedCount >= this.usageLimit) {
    return 'This offer has reached its usage limit.';
  }
  return null;
};

export const Offer = mongoose.model('Offer', offerSchema);
