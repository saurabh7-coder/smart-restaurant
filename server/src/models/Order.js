import mongoose from 'mongoose';
import { Counter } from './Counter.js';
import { addressSchema } from './addressSchema.js';
import {
  KITCHEN_STATUSES,
  ORDER_STATUS,
  ORDER_STATUS_VALUES,
  ORDER_TYPE,
  ORDER_TYPE_VALUES,
  PAYMENT_METHOD_VALUES,
  PAYMENT_STATUS,
  PAYMENT_STATUS_VALUES,
} from '../constants.js';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MONEY IS STORED IN PAISE (integer minor units), never rupees as a float.
 * ─────────────────────────────────────────────────────────────────────────────
 * 0.1 + 0.2 !== 0.3 in binary floating point, and a bill is a sum of many such
 * numbers plus a percentage tax. Storing 34900 instead of 349.00 keeps every
 * arithmetic step exact, and it is also the unit Razorpay expects — so there is
 * no lossy conversion at the payment boundary either.
 *
 * Divide by 100 only at the moment of display.
 */
const paise = { type: Number, required: true, min: 0, validate: { validator: Number.isInteger, message: '{PATH} must be an integer number of paise' } };

const orderItemSchema = new mongoose.Schema(
  {
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    /**
     * Name, price and dietary type are SNAPSHOT at order time. If the kitchen
     * later renames a dish or changes its price, this order — and the bill the
     * customer already agreed to — must not silently change.
     */
    name: { type: String, required: true, trim: true },
    unitPrice: paise,
    quantity: { type: Number, required: true, min: 1, max: 50 },
    lineTotal: paise,
    foodType: { type: String, required: true },
    note: { type: String, trim: true, maxlength: 200, default: '' },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },

    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    orderType: { type: String, enum: ORDER_TYPE_VALUES, required: true, index: true },

    /** Pre-orders belong to a reservation; dine-in orders belong to a table. */
    reservation: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation', default: null },
    table: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', default: null },
    /** Takeaway collection time. */
    pickupAt: { type: Date, default: null },

    /**
     * Where a delivery order is going — snapshotted, not referenced, so editing
     * or deleting the saved address never rewrites an order in flight.
     */
    deliveryAddress: { type: addressSchema, default: null },
    /** Straight-line distance from the restaurant, recorded at order time. */
    deliveryDistanceKm: { type: Number, default: null, min: 0 },
    /** Filled in when a rider takes it out; shown to the customer. */
    deliveredAt: { type: Date, default: null },
    riderNote: { type: String, trim: true, maxlength: 200, default: '' },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'An order must contain at least one item.',
      },
    },

    /**
     * Every figure here is recomputed on the server from current database prices.
     * Nothing the client sends about money is ever trusted.
     */
    amounts: {
      subtotal: paise,
      discount: { ...paise, default: 0 },
      taxable: paise,
      tax: { ...paise, default: 0 },
      /** Charged on delivery orders only; 0 when free or not applicable. */
      deliveryFee: { ...paise, default: 0 },
      /** Value of loyalty points spent on this bill. */
      pointsDiscount: { ...paise, default: 0 },
      total: paise,
      taxPercent: { type: Number, required: true, min: 0 },
    },

    currency: { type: String, default: 'INR' },

    offerCode: { type: String, uppercase: true, trim: true, default: null },

    /** Points spent on this order, and points it earned once completed. */
    loyalty: {
      pointsRedeemed: { type: Number, default: 0, min: 0 },
      pointsValuePaise: { type: Number, default: 0, min: 0 },
      pointsEarned: { type: Number, default: 0, min: 0 },
    },

    contact: {
      name: { type: String, required: true, trim: true, maxlength: 80 },
      phone: { type: String, required: true, trim: true, maxlength: 20 },
      email: { type: String, required: true, trim: true, lowercase: true },
    },

    note: { type: String, trim: true, maxlength: 500, default: '' },

    status: {
      type: String,
      enum: ORDER_STATUS_VALUES,
      default: ORDER_STATUS.PLACED,
      index: true,
    },

    payment: {
      method: { type: String, enum: PAYMENT_METHOD_VALUES, required: true },
      status: {
        type: String,
        enum: PAYMENT_STATUS_VALUES,
        default: PAYMENT_STATUS.PAY_AT_RESTAURANT,
        index: true,
      },
      provider: { type: String, default: null },
      /** Provider order handle, created before the customer is sent to checkout. */
      providerOrderId: { type: String, default: null },
      providerPaymentId: { type: String, default: null },
      /** How the gateway says it was paid: card, upi, netbanking, wallet… */
      gatewayMethod: { type: String, default: null },
      /** Kept for audit: proves this server verified the callback itself. */
      signatureVerified: { type: Boolean, default: false },
      verifiedVia: { type: String, default: null },
      amount: { type: Number, default: 0, min: 0 },
      paidAt: { type: Date, default: null },
      failureReason: { type: String, default: null },
      refundId: { type: String, default: null },
      refundedAt: { type: Date, default: null },
    },

    statusHistory: [
      {
        status: { type: String, enum: ORDER_STATUS_VALUES },
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: { type: String, maxlength: 200 },
      },
    ],

    cancelReason: { type: String, trim: true, maxlength: 300, default: null },
  },
  { timestamps: true },
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1, createdAt: 1 });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ 'contact.phone': 1 });

/**
 * A provider order id must map to at most one of our orders — otherwise a
 * replayed payment callback could be applied to a second order.
 *
 * This MUST be a partial index, not a sparse one. `sparse` only skips documents
 * where the field is ABSENT, and this field is declared with `default: null`, so
 * it is present-with-null on every pay-at-restaurant order. A sparse unique
 * index therefore treats all those nulls as duplicates and rejects the second
 * such order outright. Filtering on `$type: 'string'` indexes only the orders
 * that really went through a gateway.
 */
orderSchema.index(
  { 'payment.providerOrderId': 1 },
  {
    unique: true,
    partialFilterExpression: { 'payment.providerOrderId': { $type: 'string' } },
    name: 'uniq_provider_order_id',
  },
);

orderSchema.statics.nextOrderNumber = async function nextOrderNumber(when = new Date()) {
  const year = when.getUTCFullYear();
  const seq = await Counter.next(`order:${year}`);
  return `ORD-${year}-${String(seq).padStart(5, '0')}`;
};

orderSchema.methods.recordStatus = function recordStatus(status, byUserId, note) {
  this.status = status;
  this.statusHistory.push({ status, by: byUserId || undefined, note, at: new Date() });
  return this;
};

/** True once the kitchen should see this ticket. */
orderSchema.virtual('isLive').get(function isLive() {
  return KITCHEN_STATUSES.includes(this.status);
});

orderSchema.virtual('typeLabel').get(function typeLabel() {
  return {
    [ORDER_TYPE.PRE_ORDER]: 'Pre-order',
    [ORDER_TYPE.DINE_IN]: 'Dine-in',
    [ORDER_TYPE.TAKEAWAY]: 'Takeaway',
    [ORDER_TYPE.DELIVERY]: 'Delivery',
  }[this.orderType];
});

orderSchema.set('toJSON', { virtuals: true });
orderSchema.set('toObject', { virtuals: true });

export const Order = mongoose.model('Order', orderSchema);
