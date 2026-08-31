import mongoose from 'mongoose';

/**
 * A delivery address.
 *
 * Used in two places, deliberately as a plain schema rather than its own
 * collection:
 *   - `User.addresses[]` — the customer's reusable address book
 *   - `Order.deliveryAddress` — a SNAPSHOT taken when the order is placed
 *
 * The snapshot matters. If a customer later edits or deletes a saved address,
 * the rider must still be able to see where an in-flight order was actually
 * going, and a delivered order must keep an honest record of where it went.
 */
export const addressSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, maxlength: 24, default: 'Home' },

    line1: { type: String, required: true, trim: true, maxlength: 160 },
    line2: { type: String, trim: true, maxlength: 160, default: '' },
    landmark: { type: String, trim: true, maxlength: 120, default: '' },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    pincode: {
      type: String,
      required: true,
      trim: true,
      // Indian PIN codes: six digits, never starting at zero.
      match: [/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code'],
    },

    /**
     * Precise location, when the customer shares it. Riders navigate by the pin,
     * not the text — a typed address is often ambiguous down a lane, and this is
     * also what the delivery-radius check measures against.
     *
     * Optional: browsers can refuse geolocation, and an order should not be
     * blocked because someone declined a permission prompt.
     */
    lat: { type: Number, min: -90, max: 90, default: null },
    lng: { type: Number, min: -180, max: 180, default: null },
    /** Metres of uncertainty reported by the browser, for staff judgement. */
    accuracy: { type: Number, min: 0, default: null },
    /** How the pin was obtained, so staff know how much to trust it. */
    locationSource: {
      type: String,
      enum: ['gps', 'manual', null],
      default: null,
    },

    /** "Second gate, ring the bell twice" — read by the rider, not the kitchen. */
    directions: { type: String, trim: true, maxlength: 300, default: '' },

    isDefault: { type: Boolean, default: false },
  },
  { timestamps: false },
);

/** True when this address carries a usable map pin. */
addressSchema.methods.hasPin = function hasPin() {
  return typeof this.lat === 'number' && typeof this.lng === 'number';
};

/** One-line rendering for tickets, lists and confirmation screens. */
export function formatAddress(a) {
  if (!a) return '';
  return [a.line1, a.line2, a.landmark && `near ${a.landmark}`, a.city, a.pincode]
    .filter(Boolean)
    .join(', ');
}

/**
 * Great-circle distance in kilometres.
 *
 * Straight-line, not road distance — good enough to decide whether an address is
 * plausibly inside a delivery zone, and it needs no external routing service.
 * The radius should be set a little tighter than the real road range to allow
 * for the difference.
 */
export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
