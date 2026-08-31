import { Restaurant } from '../models/Restaurant.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env, isOnlinePaymentEnabled } from '../config/env.js';
import { slotGrid } from '../utils/slots.js';

/** GET /api/restaurant — public profile plus the bookable slot grid. */
export const getRestaurant = asyncHandler(async (_req, res) => {
  const restaurant = await Restaurant.getSingleton();

  res.json({
    success: true,
    data: {
      ...restaurant.toObject(),
      booking: {
        slotMinutes: env.slotMinutes,
        maxBookingDaysAhead: env.maxBookingDaysAhead,
        slots: slotGrid(),
      },
      ordering: {
        ...(restaurant.ordering?.toObject?.() || restaurant.ordering || {}),
        taxPercent: restaurant.taxPercent,
        minOrderValue: restaurant.minOrderValue,
        takeawayLeadMinutes: restaurant.takeawayLeadMinutes,
        openTime: env.openTime,
        closeTime: env.closeTime,
        onlinePaymentEnabled: isOnlinePaymentEnabled,
        delivery: {
          ...(restaurant.delivery?.toObject?.() || restaurant.delivery || {}),
          // Whether a radius can actually be enforced, so the UI can say so.
          radiusEnforced: restaurant.lat != null && restaurant.lng != null,
        },
      },
    },
  });
});

export const updateRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.getSingleton();

  // `key` is immutable; everything else on the singleton is admin-editable.
  const { key, _id, ...updates } = req.body;
  Object.assign(restaurant, updates);
  await restaurant.save();

  res.json({ success: true, message: 'Restaurant details updated.', data: restaurant });
});
