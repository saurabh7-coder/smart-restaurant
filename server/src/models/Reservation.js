import mongoose from 'mongoose';
import { Counter } from './Counter.js';
import { HOLDING_STATUSES, RESERVATION_STATUS, RESERVATION_STATUS_VALUES } from '../constants.js';

const reservationSchema = new mongoose.Schema(
  {
    reservationId: { type: String, required: true, unique: true, uppercase: true, trim: true },

    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    table: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', required: true },

    /** Absolute UTC start of the seating slot. Always exactly on the slot grid. */
    slotStart: { type: Date, required: true },
    slotEnd: { type: Date, required: true },

    guests: { type: Number, required: true, min: 1, max: 30 },

    /**
     * Contact details are snapshotted onto the reservation. If the customer later
     * edits their profile, the booking still shows who the restaurant should expect.
     */
    contact: {
      name: { type: String, required: true, trim: true, maxlength: 80 },
      phone: { type: String, required: true, trim: true, maxlength: 20 },
      email: { type: String, required: true, trim: true, lowercase: true },
    },

    specialRequest: { type: String, trim: true, maxlength: 500, default: '' },

    status: {
      type: String,
      enum: RESERVATION_STATUS_VALUES,
      default: RESERVATION_STATUS.PENDING,
      index: true,
    },

    /**
     * THE double-booking guard. True for every status that still occupies the
     * table; false once cancelled or marked a no-show. The partial unique index
     * below only indexes documents where this is true, so a released slot becomes
     * immediately re-bookable while an occupied one cannot be booked twice.
     *
     * Never set this field directly — use `releaseHold()` / status transitions.
     */
    isActive: { type: Boolean, default: true },

    offerCode: { type: String, uppercase: true, trim: true, default: null },
    discountAmount: { type: Number, default: 0, min: 0 },

    statusHistory: [
      {
        status: { type: String, enum: RESERVATION_STATUS_VALUES },
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: { type: String, maxlength: 200 },
      },
    ],
  },
  { timestamps: true },
);

/**
 * ────────────────────────────────────────────────────────────────────────────
 * THE CORE INVARIANT
 * ────────────────────────────────────────────────────────────────────────────
 * One table can hold at most ONE active reservation per seating slot. This is a
 * database-level unique constraint, not an application check, so it holds even
 * when two requests execute simultaneously on different processes: MongoDB will
 * accept exactly one insert and reject the other with error code 11000, which
 * the controller translates into a clean HTTP 409.
 *
 * A `findOne()`-then-`create()` check in application code CANNOT provide this
 * guarantee — both requests can pass the read before either performs the write.
 */
reservationSchema.index(
  { table: 1, slotStart: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
    name: 'uniq_active_table_slot',
  },
);

reservationSchema.index({ slotStart: 1, status: 1 });
reservationSchema.index({ user: 1, slotStart: -1 });
reservationSchema.index({ 'contact.phone': 1 });

/** Generates the next human-readable booking ID, e.g. RES-2026-00125. */
reservationSchema.statics.nextReservationId = async function nextReservationId(when = new Date()) {
  const year = when.getUTCFullYear();
  const seq = await Counter.next(`reservation:${year}`);
  return `RES-${year}-${String(seq).padStart(5, '0')}`;
};

reservationSchema.methods.recordStatus = function recordStatus(status, byUserId, note) {
  this.status = status;
  this.isActive = HOLDING_STATUSES.includes(status);
  this.statusHistory.push({ status, by: byUserId || undefined, note, at: new Date() });
  return this;
};

reservationSchema.virtual('isUpcoming').get(function isUpcoming() {
  return this.slotStart > new Date();
});

reservationSchema.set('toJSON', { virtuals: true });
reservationSchema.set('toObject', { virtuals: true });

export const Reservation = mongoose.model('Reservation', reservationSchema);

/** True when a Mongo error is the unique-index rejection for a taken slot. */
export function isSlotTakenError(error) {
  return (
    error &&
    (error.code === 11000 || error.code === 11001) &&
    JSON.stringify(error.keyPattern || error.keyValue || {}).includes('table')
  );
}
