import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { ALLERGENS, LOYALTY_LEDGER_REASONS, ROLES, ROLE_VALUES, tierFor } from '../constants.js';
import { addressSchema } from './addressSchema.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ROLE_VALUES, default: ROLES.CUSTOMER, index: true },
    isBlocked: { type: Boolean, default: false },
    lastLoginAt: { type: Date },

    /** The customer's address book, reused across delivery orders. */
    addresses: { type: [addressSchema], default: [] },

    /**
     * Declared food allergies, from a fixed vocabulary.
     *
     * Free text would be friendlier to type and useless to match against —
     * "peanut" vs "peanuts" vs "groundnut" must all reliably flag the same
     * dishes, and a warning that silently fails to fire is the worst possible
     * outcome for this particular field.
     */
    allergies: {
      type: [{ type: String, enum: ALLERGENS }],
      default: [],
    },

    /**
     * Loyalty balance.
     *
     * `points` is spendable and goes down on redemption; `lifetimePoints` only
     * ever rises and is what the tier is derived from — so spending your points
     * can never demote you.
     *
     * Every movement is also appended to `loyaltyLedger`, because a balance with
     * no history is impossible to audit when a customer disputes it.
     */
    loyalty: {
      points: { type: Number, default: 0, min: 0 },
      lifetimePoints: { type: Number, default: 0, min: 0 },
    },

    loyaltyLedger: {
      type: [
        new mongoose.Schema(
          {
            points: { type: Number, required: true },
            reason: { type: String, enum: LOYALTY_LEDGER_REASONS, required: true },
            order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
            note: { type: String, maxlength: 160, default: '' },
            balanceAfter: { type: Number, required: true },
            at: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
      // Keep the tail only; a full history would grow without bound on the user
      // document, and older movements are reconstructable from the orders.
      validate: {
        validator: (v) => v.length <= 100,
        message: 'Ledger overflow',
      },
    },
  },
  { timestamps: true },
);

/**
 * Keeps exactly one address flagged default.
 *
 * Two defaults would make "which address does checkout preselect?" arbitrary,
 * and none would mean a returning customer re-picks every time — so the first
 * address added is promoted automatically.
 */
userSchema.pre('save', function normaliseDefaultAddress(next) {
  if (!this.isModified('addresses') || this.addresses.length === 0) return next();

  const chosen = this.addresses.filter((a) => a.isDefault);
  if (chosen.length === 0) {
    this.addresses[0].isDefault = true;
  } else if (chosen.length > 1) {
    // The most recently flagged one wins; clear the rest.
    const keep = chosen[chosen.length - 1];
    this.addresses.forEach((a) => {
      a.isDefault = a === keep;
    });
  }
  return next();
});

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, env.bcryptRounds);
  return next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    phone: this.phone,
    role: this.role,
    isBlocked: this.isBlocked,
    addresses: this.addresses,
    allergies: this.allergies || [],
    loyalty: {
      points: this.loyalty?.points || 0,
      lifetimePoints: this.loyalty?.lifetimePoints || 0,
      tier: tierFor(this.loyalty?.lifetimePoints || 0),
    },
    createdAt: this.createdAt,
  };
};

/**
 * Applies a points movement and records it, keeping balance and ledger in step.
 * `points` is positive to award and negative to spend.
 */
userSchema.methods.moveLoyaltyPoints = function moveLoyaltyPoints({ points, reason, order, note }) {
  const delta = Math.round(points);
  if (!delta) return this;

  const current = this.loyalty?.points || 0;
  if (delta < 0 && current + delta < 0) {
    throw new Error('Insufficient points');
  }

  this.loyalty.points = current + delta;
  if (delta > 0) this.loyalty.lifetimePoints = (this.loyalty.lifetimePoints || 0) + delta;

  this.loyaltyLedger.push({
    points: delta,
    reason,
    order: order || undefined,
    note: note || '',
    balanceAfter: this.loyalty.points,
    at: new Date(),
  });
  if (this.loyaltyLedger.length > 100) this.loyaltyLedger = this.loyaltyLedger.slice(-100);

  return this;
};

export const User = mongoose.model('User', userSchema);
