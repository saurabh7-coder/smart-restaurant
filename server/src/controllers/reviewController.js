import { Review } from '../models/Review.js';
import { MenuItem } from '../models/MenuItem.js';
import { Reservation } from '../models/Reservation.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ORDER_STATUS, RESERVATION_STATUS, ROLES } from '../constants.js';
import { Order } from '../models/Order.js';

export const listReviews = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.menuItem) filter.menuItem = req.query.menuItem;
  if (req.query.restaurantOnly === 'true') filter.menuItem = null;

  // Only staff can see unmoderated reviews.
  if (!(req.user && [ROLES.ADMIN, ROLES.STAFF].includes(req.user.role))) {
    filter.isApproved = true;
  }

  const reviews = await Review.find(filter)
    .populate('user', 'name')
    .populate('menuItem', 'name image')
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(req.query.limit) || 50, 100))
    .lean();

  res.json({ success: true, data: reviews });
});

export const getMyReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ user: req.user._id })
    .populate('menuItem', 'name image')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, data: reviews });
});

export const createReview = asyncHandler(async (req, res) => {
  const { menuItem = null, rating, comment } = req.body;

  // Reviews come from people who actually dined here — this keeps ratings honest
  // and is the kind of rule a paper-menu system could never enforce.
  /*
   * Eligibility, strongest evidence first: having ordered this very dish and
   * received it beats having merely sat at a table. Checking the specific dish
   * is what makes a rating mean "I ate this", not "I have been here".
   */
  const ateThisDish = menuItem
    ? await Order.exists({
        user: req.user._id,
        status: ORDER_STATUS.COMPLETED,
        'items.menuItem': menuItem,
      })
    : null;

  if (!ateThisDish) {
    const hasDined =
      (await Order.exists({ user: req.user._id, status: ORDER_STATUS.COMPLETED })) ||
      (await Reservation.exists({
        user: req.user._id,
        status: { $in: [RESERVATION_STATUS.ARRIVED, RESERVATION_STATUS.COMPLETED] },
      }));

    if (!hasDined) {
      throw ApiError.forbidden(
        'You can review once you have eaten with us — order something or dine in first.',
      );
    }
  }

  if (menuItem) {
    const exists = await MenuItem.exists({ _id: menuItem });
    if (!exists) throw ApiError.notFound('That dish is not on the menu.');
  }

  const duplicate = await Review.findOne({ user: req.user._id, menuItem: menuItem || null });
  if (duplicate) {
    throw ApiError.conflict('You have already reviewed this. Edit your existing review instead.');
  }

  const review = await Review.create({
    user: req.user._id,
    menuItem: menuItem || null,
    rating: Number(rating),
    comment: comment || '',
  });

  if (review.menuItem) await MenuItem.refreshRating(review.menuItem);

  await review.populate('user', 'name');
  res.status(201).json({ success: true, message: 'Thanks for your review.', data: review });
});

export const updateReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw ApiError.notFound('Review not found.');

  const isAdmin = req.user.role === ROLES.ADMIN;
  if (!isAdmin && String(review.user) !== String(req.user._id)) {
    throw ApiError.forbidden('You can only edit your own review.');
  }

  if (req.body.rating !== undefined) review.rating = Number(req.body.rating);
  if (req.body.comment !== undefined) review.comment = req.body.comment;
  if (isAdmin && req.body.isApproved !== undefined) review.isApproved = req.body.isApproved;

  await review.save();
  if (review.menuItem) await MenuItem.refreshRating(review.menuItem);

  res.json({ success: true, message: 'Review updated.', data: review });
});

export const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw ApiError.notFound('Review not found.');

  if (req.user.role !== ROLES.ADMIN && String(review.user) !== String(req.user._id)) {
    throw ApiError.forbidden('You can only delete your own review.');
  }

  const { menuItem } = review;
  await review.deleteOne();
  if (menuItem) await MenuItem.refreshRating(menuItem);

  res.json({ success: true, message: 'Review deleted.' });
});

/**
 * GET /api/reviews/pending
 *
 * Dishes this customer has eaten but not yet rated.
 *
 * Reviews are worth more when they come from someone who actually had the dish,
 * so rather than opening a free-for-all form, the app asks about specific
 * plates from specific completed orders. Anything already reviewed drops off
 * the list, so the prompt empties as it is answered.
 */
export const getPendingReviews = asyncHandler(async (req, res) => {
  const eaten = await Order.find({
    user: req.user._id,
    status: ORDER_STATUS.COMPLETED,
  })
    .select('orderNumber items.menuItem items.name updatedAt orderType')
    .sort({ updatedAt: -1 })
    .limit(15)
    .lean();

  const reviewed = new Set(
    (await Review.find({ user: req.user._id }).select('menuItem').lean())
      .map((r) => String(r.menuItem))
      .filter(Boolean),
  );

  // Most recently eaten wins when the same dish appears in several orders.
  const seen = new Set();
  const pending = [];
  for (const order of eaten) {
    for (const line of order.items) {
      const id = String(line.menuItem);
      if (reviewed.has(id) || seen.has(id)) continue;
      seen.add(id);
      pending.push({
        menuItem: id,
        name: line.name,
        orderNumber: order.orderNumber,
        orderId: order._id,
        eatenAt: order.updatedAt,
      });
    }
  }

  const dishes = await MenuItem.find({ _id: { $in: pending.map((p) => p.menuItem) } })
    .select('name image foodType price')
    .lean();
  const byId = new Map(dishes.map((d) => [String(d._id), d]));

  res.json({
    success: true,
    data: pending
      .filter((p) => byId.has(p.menuItem))
      .map((p) => ({ ...p, dish: byId.get(p.menuItem) }))
      .slice(0, 12),
  });
});
