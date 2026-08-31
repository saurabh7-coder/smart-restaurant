import mongoose from 'mongoose';

/** Singleton settings document for the restaurant's public profile. */
const restaurantSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'primary', unique: true, immutable: true },
    name: { type: String, required: true, trim: true, default: 'Delicious Adda' },
    tagline: { type: String, trim: true, default: 'Delicious Food • Great Experience' },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    address: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    openTime: { type: String, default: '11:00' },
    closeTime: { type: String, default: '23:00' },
    mapEmbedUrl: { type: String, default: '' },
    heroImage: { type: String, default: '' },
    /**
     * Used only to produce an ESTIMATED revenue figure on the admin dashboard.
     * This system does not process orders or payments, so no actual revenue data
     * exists — the dashboard labels the number as an estimate.
     */
    avgSpendPerGuest: { type: Number, default: 600, min: 0 },
    currency: { type: String, default: 'INR' },

    /* ---- food ordering ---- */
    /** GST on restaurant food in India is 5% at the time of writing. Verify the
     *  current rate for your jurisdiction before using this commercially. */
    taxPercent: { type: Number, default: 5, min: 0, max: 100 },
    /** Minimum bill (in rupees) before an order can be placed. 0 = no minimum. */
    minOrderValue: { type: Number, default: 0, min: 0 },
    /** Earliest a takeaway can be collected, in minutes from now. */
    takeawayLeadMinutes: { type: Number, default: 30, min: 0 },
    /** Master switches so the restaurant can pause a channel without redeploying. */
    ordering: {
      preOrderEnabled: { type: Boolean, default: true },
      dineInEnabled: { type: Boolean, default: true },
      takeawayEnabled: { type: Boolean, default: true },
      deliveryEnabled: { type: Boolean, default: true },
    },

    /* ---- loyalty ---- */
    loyalty: {
      enabled: { type: Boolean, default: true },
      /** Rupees of food value that earn one point. */
      rupeesPerPoint: { type: Number, default: 10, min: 1 },
      /** Rupees of discount one point is worth when redeemed. */
      pointValue: { type: Number, default: 1, min: 0 },
      /** Points a customer must hold before they may redeem any. */
      minRedeemPoints: { type: Number, default: 100, min: 0 },
      /** Ceiling on how much of a single bill points may cover. */
      maxRedeemPercent: { type: Number, default: 30, min: 0, max: 100 },
      /** One-off welcome points on first order. */
      signupBonus: { type: Number, default: 50, min: 0 },
    },

    /* ---- delivery ---- */
    delivery: {
      /** Flat fee in rupees. */
      fee: { type: Number, default: 40, min: 0 },
      /** Order value (rupees, before the fee) above which delivery is free. 0 = never free. */
      freeAbove: { type: Number, default: 700, min: 0 },
      /** Minimum order value for delivery, which is usually higher than for pickup. */
      minOrderValue: { type: Number, default: 200, min: 0 },
      /**
       * Straight-line radius served, in km. Set a little tighter than the real
       * road range, since the check measures as the crow flies.
       */
      radiusKm: { type: Number, default: 7, min: 0 },
      /** Quoted to the customer; not a tracked promise. */
      etaMinutes: { type: Number, default: 45, min: 0 },

      /** Cash on delivery — riders carrying cash is a real risk, so it can be switched off. */
      codEnabled: { type: Boolean, default: true },
      /**
       * Largest order (rupees) a rider may collect in cash. 0 = no cap.
       * Caps how much cash is on a bike at any one time.
       */
      codMaxOrderValue: { type: Number, default: 3000, min: 0 },
    },

    /**
     * The restaurant's own pin. Without it there is nothing to measure a
     * delivery address against, so the radius check is skipped and any
     * in-city address is accepted.
     */
    lat: { type: Number, min: -90, max: 90, default: null },
    lng: { type: Number, min: -180, max: 180, default: null },
    social: {
      instagram: { type: String, default: '' },
      facebook: { type: String, default: '' },
      x: { type: String, default: '' },
    },
  },
  { timestamps: true },
);

restaurantSchema.statics.getSingleton = async function getSingleton() {
  let doc = await this.findOne({ key: 'primary' });
  if (!doc) doc = await this.create({ key: 'primary' });
  return doc;
};

export const Restaurant = mongoose.model('Restaurant', restaurantSchema);
