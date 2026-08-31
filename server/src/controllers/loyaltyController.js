import { Restaurant } from '../models/Restaurant.js';
import { Order } from '../models/Order.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { loyaltySummary } from '../utils/loyalty.js';
import { LOYALTY_TIERS, ORDER_STATUS } from '../constants.js';

/** GET /api/loyalty/me — balance, tier, progress and recent movements. */
export const getMyLoyalty = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.getSingleton();
  const config = restaurant.loyalty;

  const summary = loyaltySummary(req.user, { ...config, tiers: LOYALTY_TIERS });

  // Newest first, and trimmed — the ledger is an explanation, not an archive.
  const ledger = [...(req.user.loyaltyLedger || [])].reverse().slice(0, 20);

  const [ordersCounted, pendingPoints] = await Promise.all([
    Order.countDocuments({ user: req.user._id, status: ORDER_STATUS.COMPLETED }),
    // Points already promised by orders that have not been handed over yet.
    Order.aggregate([
      {
        $match: {
          user: req.user._id,
          status: { $nin: [ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED] },
        },
      },
      { $group: { _id: null, taxable: { $sum: '$amounts.taxable' } } },
    ]),
  ]);

  const perPoint = Math.max(config.rupeesPerPoint || 10, 1);
  const inFlight = Math.floor((pendingPoints[0]?.taxable || 0) / 100 / perPoint);

  res.json({
    success: true,
    data: {
      ...summary,
      tiers: LOYALTY_TIERS,
      completedOrders: ordersCounted,
      /** Not yet awarded: points only land when the food is handed over. */
      pendingPoints: inFlight,
      rupeesPerPoint: perPoint,
      ledger,
    },
  });
});

/** GET /api/loyalty/config — public rules, so the site can explain the scheme. */
export const getLoyaltyConfig = asyncHandler(async (_req, res) => {
  const restaurant = await Restaurant.getSingleton();
  const c = restaurant.loyalty;

  res.json({
    success: true,
    data: {
      enabled: Boolean(c?.enabled),
      rupeesPerPoint: c?.rupeesPerPoint ?? 10,
      pointValue: c?.pointValue ?? 1,
      minRedeemPoints: c?.minRedeemPoints ?? 0,
      maxRedeemPercent: c?.maxRedeemPercent ?? 100,
      signupBonus: c?.signupBonus ?? 0,
      tiers: LOYALTY_TIERS,
    },
  });
});
