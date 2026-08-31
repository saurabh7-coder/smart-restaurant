import { Order } from '../models/Order.js';
import { Reservation } from '../models/Reservation.js';
import { ApiError } from './ApiError.js';
import { ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, RESERVATION_STATUS } from '../constants.js';

/**
 * How many times one customer has actually used a code.
 *
 * Counts the same things the global counter does — an order only counts once it
 * is payable (pay-at-restaurant) or paid, and a cancelled order or booking gives
 * the use back — so the per-customer and global views can never disagree.
 */
export async function countCustomerUses(code, userId) {
  if (!code || !userId) return 0;

  const [orders, bookings] = await Promise.all([
    Order.countDocuments({
      user: userId,
      offerCode: code,
      status: { $ne: ORDER_STATUS.CANCELLED },
      $or: [
        { 'payment.method': PAYMENT_METHOD.AT_RESTAURANT },
        { 'payment.status': PAYMENT_STATUS.PAID },
      ],
    }),
    Reservation.countDocuments({
      user: userId,
      offerCode: code,
      status: { $nin: [RESERVATION_STATUS.CANCELLED, RESERVATION_STATUS.NO_SHOW] },
    }),
  ]);

  return orders + bookings;
}

/**
 * Rejects a code this customer has already exhausted.
 *
 * Anonymous callers are allowed through: there is no identity to count against
 * yet, and the check runs again for real when the order or booking is created.
 */
export async function assertOfferAvailableTo(offer, user) {
  if (!offer || offer.perCustomerLimit == null || !user) return;

  const used = await countCustomerUses(offer.code, user._id);
  if (used < offer.perCustomerLimit) return;

  throw ApiError.badRequest(
    offer.perCustomerLimit === 1
      ? `You have already used ${offer.code} — it is one per customer.`
      : `You have used ${offer.code} ${used} times; the limit is ${offer.perCustomerLimit} per customer.`,
    { offerCode: 'Already used on this account' },
  );
}
