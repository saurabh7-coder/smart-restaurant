import { Order } from '../models/Order.js';
import { Offer } from '../models/Offer.js';
import { Table } from '../models/Table.js';
import { Reservation } from '../models/Reservation.js';
import { Restaurant } from '../models/Restaurant.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { priceOrder, toRupees } from '../utils/pricing.js';
import { haversineKm } from '../models/addressSchema.js';
import { assertOwnerOrStaff as assertOwnership, isOwner, isStaff } from '../utils/ownership.js';
import { assertOfferAvailableTo } from '../utils/offerUsage.js';
import {
  assertRedeemable,
  computeRedemption,
  loyaltySummary,
  pointsEarnedFor,
} from '../utils/loyalty.js';
import { isOnlinePaymentEnabled } from '../config/env.js';
import { env } from '../config/env.js';
import { localMinutes, parseTimeToMinutes } from '../utils/slots.js';
import {
  CUSTOMER_CANCELLABLE,
  KITCHEN_STATUSES,
  ORDER_STATUS,
  ORDER_TYPE,
  allowedTransitions,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  PAY_LATER_METHODS,
  RESERVATION_STATUS,
} from '../constants.js';

const assertOwnerOrStaff = (order, user) => assertOwnership(order, user, 'order');

/** Fee inputs handed to the pricing engine; null unless this is a delivery. */
const deliveryPricing = (restaurant, isDelivery) =>
  isDelivery
    ? {
        applies: true,
        fee: restaurant.delivery?.fee ?? 0,
        freeAbove: restaurant.delivery?.freeAbove ?? 0,
      }
    : null;

/**
 * Folds a points redemption into an already-priced bill.
 *
 * Applied after tax rather than before it: points are a payment towards the
 * bill, not a discount on the food, so the tax owed does not shrink because a
 * customer chose to spend rewards.
 */
function applyRedemption(amounts, redemption) {
  amounts.pointsDiscount = redemption.discountPaise;
  amounts.total = Math.max(amounts.total - redemption.discountPaise, 0);
  return amounts;
}

/** Delivery usually carries a higher minimum than collection. */
const minimumFor = (restaurant, isDelivery) =>
  (isDelivery ? restaurant.delivery?.minOrderValue : restaurant.minOrderValue) || 0;

/**
 * Whether this order actually consumed one of a promo code's uses.
 *
 * Pay-later orders (at the restaurant, or cash on delivery) count at creation
 * because they reach the kitchen straight away; online orders count only once
 * the payment verifies. Without this test, cancelling an unpaid online order
 * would hand back a use that was never taken, letting the counter drift below
 * reality and quietly over-issuing a limited offer.
 */
const consumedOfferUse = (order) =>
  Boolean(order.offerCode) &&
  (PAY_LATER_METHODS.includes(order.payment?.method) ||
    order.payment?.status === PAYMENT_STATUS.PAID);

function assertTransitionAllowed(order, to) {
  const from = order.status;
  const allowed = allowedTransitions(order.orderType, from);
  if (!allowed.includes(to)) {
    throw ApiError.badRequest(
      `A ${order.orderType.replace('_', ' ')} order that is "${from}" cannot become "${to}".` +
        (allowed.length ? ` Allowed next: ${allowed.join(', ')}.` : ' It is already final.'),
    );
  }
}

/**
 * Resolves the address for a delivery order.
 *
 * Accepts either a saved address id from the customer's book, or a full address
 * typed at checkout. Either way the returned object is a plain snapshot that
 * gets copied onto the order.
 */
async function resolveDeliveryAddress(body, user) {
  if (body.savedAddressId) {
    const saved = user.addresses?.id(body.savedAddressId);
    if (!saved) throw ApiError.badRequest('That saved address no longer exists.');
    return saved.toObject();
  }

  const a = body.deliveryAddress;
  if (!a || typeof a !== 'object') {
    throw ApiError.badRequest('A delivery address is required.', {
      deliveryAddress: 'Required for delivery',
    });
  }

  const missing = ['line1', 'city', 'pincode'].filter((k) => !String(a[k] || '').trim());
  if (missing.length) {
    throw ApiError.badRequest('Please complete the delivery address.', {
      deliveryAddress: `Missing: ${missing.join(', ')}`,
    });
  }
  if (!/^[1-9][0-9]{5}$/.test(String(a.pincode).trim())) {
    throw ApiError.badRequest('Enter a valid 6-digit PIN code.', { pincode: 'Invalid PIN code' });
  }

  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  const lat = num(a.lat);
  const lng = num(a.lng);
  const hasPin = Number.isFinite(lat) && Number.isFinite(lng);

  return {
    label: String(a.label || 'Home').slice(0, 24),
    line1: String(a.line1).trim().slice(0, 160),
    line2: String(a.line2 || '').trim().slice(0, 160),
    landmark: String(a.landmark || '').trim().slice(0, 120),
    city: String(a.city).trim().slice(0, 80),
    pincode: String(a.pincode).trim(),
    lat: hasPin ? lat : null,
    lng: hasPin ? lng : null,
    accuracy: hasPin ? num(a.accuracy) : null,
    locationSource: hasPin ? (a.locationSource === 'gps' ? 'gps' : 'manual') : null,
    directions: String(a.directions || '').trim().slice(0, 300),
  };
}

/** Straight-line km from the restaurant, or null when either pin is missing. */
function deliveryDistanceKm(address, restaurant) {
  const hasAddressPin = Number.isFinite(address?.lat) && Number.isFinite(address?.lng);
  const hasShopPin = Number.isFinite(restaurant?.lat) && Number.isFinite(restaurant?.lng);
  if (!hasAddressPin || !hasShopPin) return null;

  return Number(
    haversineKm(
      { lat: restaurant.lat, lng: restaurant.lng },
      { lat: address.lat, lng: address.lng },
    ).toFixed(2),
  );
}

/**
 * Validates the requirements specific to each ordering channel and returns the
 * links (reservation / table / pickup time / address) the order should carry.
 */
async function resolveChannel({ orderType, body, user, restaurant }) {
  const channels = {
    [ORDER_TYPE.PRE_ORDER]: restaurant.ordering?.preOrderEnabled,
    [ORDER_TYPE.DINE_IN]: restaurant.ordering?.dineInEnabled,
    [ORDER_TYPE.TAKEAWAY]: restaurant.ordering?.takeawayEnabled,
    [ORDER_TYPE.DELIVERY]: restaurant.ordering?.deliveryEnabled,
  };
  if (channels[orderType] === false) {
    throw ApiError.conflict('That ordering option is currently switched off. Please choose another.');
  }

  if (orderType === ORDER_TYPE.PRE_ORDER) {
    if (!body.reservation) {
      throw ApiError.badRequest('Choose which booking this pre-order is for.', {
        reservation: 'Required for a pre-order',
      });
    }

    const reservation = await Reservation.findById(body.reservation);
    if (!reservation) throw ApiError.notFound('That booking does not exist.');
    if (!isStaff(user) && !isOwner(reservation, user)) {
      throw ApiError.forbidden('That booking belongs to another customer.');
    }
    if (![RESERVATION_STATUS.PENDING, RESERVATION_STATUS.CONFIRMED].includes(reservation.status)) {
      throw ApiError.badRequest(
        `You can only pre-order for an upcoming booking — this one is ${reservation.status}.`,
      );
    }
    if (reservation.slotStart <= new Date()) {
      throw ApiError.badRequest(
        'That seating has already started. Order from your table instead of pre-ordering.',
      );
    }

    return { reservation: reservation._id, table: reservation.table, pickupAt: null };
  }

  if (orderType === ORDER_TYPE.DINE_IN) {
    if (!body.table) {
      throw ApiError.badRequest('Scan the QR code on your table, or pick your table number.', {
        table: 'Required for a dine-in order',
      });
    }

    const table = await Table.findById(body.table).lean();
    if (!table) throw ApiError.notFound('That table does not exist.');

    // If this guest has a seating in progress, attach the order to it so the
    // bill and the booking line up on the staff board.
    const now = new Date();
    const seating = await Reservation.findOne({
      user: user._id,
      table: table._id,
      slotStart: { $lte: now },
      slotEnd: { $gt: now },
      status: { $in: [RESERVATION_STATUS.CONFIRMED, RESERVATION_STATUS.ARRIVED] },
    }).lean();

    return { reservation: seating ? seating._id : null, table: table._id, pickupAt: null };
  }

  if (orderType === ORDER_TYPE.DELIVERY) {
    const address = await resolveDeliveryAddress(body, user);
    const distanceKm = deliveryDistanceKm(address, restaurant);

    const radius = restaurant.delivery?.radiusKm ?? 0;
    if (distanceKm !== null && radius > 0 && distanceKm > radius) {
      throw ApiError.badRequest(
        `That address is about ${distanceKm.toFixed(1)} km away, outside our ${radius} km delivery area. Takeaway collection is still available.`,
        { deliveryAddress: 'Outside the delivery area' },
      );
    }

    return {
      reservation: null,
      table: null,
      pickupAt: null,
      deliveryAddress: address,
      deliveryDistanceKm: distanceKm,
    };
  }

  /* takeaway */
  if (!body.pickupAt) {
    throw ApiError.badRequest('Choose a collection time.', { pickupAt: 'Required for takeaway' });
  }

  const pickupAt = new Date(body.pickupAt);
  if (Number.isNaN(pickupAt.getTime())) {
    throw ApiError.badRequest('That collection time is not a valid date.', {
      pickupAt: 'Invalid date',
    });
  }

  const lead = restaurant.takeawayLeadMinutes ?? 30;
  const earliest = Date.now() + lead * 60_000;
  if (pickupAt.getTime() < earliest) {
    throw ApiError.badRequest(
      `We need at least ${lead} minutes to prepare your order. Please pick a later collection time.`,
      { pickupAt: `Earliest is ${lead} minutes from now` },
    );
  }

  const maxAhead = Date.now() + 7 * 24 * 60 * 60_000;
  if (pickupAt.getTime() > maxAhead) {
    throw ApiError.badRequest('Takeaway orders can be placed up to 7 days ahead.', {
      pickupAt: 'Too far in the future',
    });
  }

  const minutes = localMinutes(pickupAt);
  const open = parseTimeToMinutes(env.openTime);
  const close = parseTimeToMinutes(env.closeTime);
  if (minutes < open || minutes > close) {
    throw ApiError.badRequest(
      `We are open ${env.openTime}–${env.closeTime}. Please choose a collection time inside those hours.`,
      { pickupAt: `Must be between ${env.openTime} and ${env.closeTime}` },
    );
  }

  return { reservation: null, table: null, pickupAt };
}

/* ────────────────────────────── quote ────────────────────────────── */

/**
 * POST /api/orders/quote
 * Prices a cart without creating anything, so the checkout screen can show the
 * real total (including tax and any promo) using the same server-side maths that
 * will be used for the actual charge.
 */
export const quoteOrder = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.getSingleton();
  const isDelivery = req.body.orderType === ORDER_TYPE.DELIVERY;

  const { items, amounts, offer } = await priceOrder({
    items: req.body.items,
    offerCode: req.body.offerCode,
    taxPercent: restaurant.taxPercent,
    guests: Number(req.body.guests) || 1,
    delivery: deliveryPricing(restaurant, isDelivery),
  });

  // Checked while quoting too, so the cart says "already used" instead of
  // letting the customer reach checkout and fail there.
  await assertOfferAvailableTo(offer, req.user);

  const redemption = computeRedemption({
    requestedPoints: req.body.redeemPoints,
    availablePoints: req.user.loyalty?.points,
    taxablePaise: amounts.taxable,
    config: restaurant.loyalty,
  });
  applyRedemption(amounts, redemption);

  res.json({
    success: true,
    data: {
      items,
      amounts,
      loyalty: {
        ...loyaltySummary(req.user, restaurant.loyalty),
        redeemed: redemption.points,
        redeemedValuePaise: redemption.discountPaise,
        redeemNote: redemption.reason,
        wouldEarn: pointsEarnedFor({
          taxablePaise: amounts.taxable,
          config: restaurant.loyalty,
          lifetimePoints: req.user.loyalty?.lifetimePoints,
        }),
      },
      currency: restaurant.currency,
      offer: offer ? { code: offer.code, description: offer.description } : null,
      minOrderValue: minimumFor(restaurant, isDelivery),
      meetsMinimum: toRupees(amounts.taxable) >= minimumFor(restaurant, isDelivery),
      onlinePaymentAvailable: isOnlinePaymentEnabled,
      delivery: isDelivery
        ? {
            fee: restaurant.delivery?.fee ?? 0,
            freeAbove: restaurant.delivery?.freeAbove ?? 0,
            etaMinutes: restaurant.delivery?.etaMinutes ?? null,
            isFree: amounts.deliveryFee === 0,
          }
        : null,
    },
  });
});

/* ────────────────────────────── create ────────────────────────────── */

/**
 * POST /api/orders
 *
 * The client sends dish ids and quantities only. Prices, discount, tax and total
 * are all recomputed here from the database — see utils/pricing.js. An order
 * paid online is created in `awaiting_payment` and stays invisible to the
 * kitchen until a verified payment callback promotes it to `placed`.
 */
export const createOrder = asyncHandler(async (req, res) => {
  const { orderType } = req.body;
  let { paymentMethod = PAYMENT_METHOD.AT_RESTAURANT } = req.body;
  const restaurant = await Restaurant.getSingleton();

  const links = await resolveChannel({ orderType, body: req.body, user: req.user, restaurant });

  const isDelivery = orderType === ORDER_TYPE.DELIVERY;

  const { items, amounts, offer } = await priceOrder({
    items: req.body.items,
    offerCode: req.body.offerCode,
    taxPercent: restaurant.taxPercent,
    guests: Number(req.body.guests) || 1,
    delivery: deliveryPricing(restaurant, isDelivery),
  });

  await assertOfferAvailableTo(offer, req.user);

  // Points are recomputed and re-capped here; whatever the browser asked for is
  // only a request, exactly as with prices.
  const redemption = computeRedemption({
    requestedPoints: req.body.redeemPoints,
    availablePoints: req.user.loyalty?.points,
    taxablePaise: amounts.taxable,
    config: restaurant.loyalty,
  });
  if (Number(req.body.redeemPoints) > 0) assertRedeemable(redemption);
  applyRedemption(amounts, redemption);

  // Measured on the food value, so the delivery fee itself can't push an order
  // over its own minimum.
  const minimum = minimumFor(restaurant, isDelivery);
  if (minimum && toRupees(amounts.taxable) < minimum) {
    throw ApiError.badRequest(
      `Minimum ${isDelivery ? 'delivery ' : ''}order is ₹${minimum}. Your items come to ₹${toRupees(amounts.taxable)}.`,
    );
  }

  const wantsOnline = paymentMethod === PAYMENT_METHOD.ONLINE;
  const wantsCod = paymentMethod === PAYMENT_METHOD.COD;

  if (wantsOnline && !isOnlinePaymentEnabled) {
    throw ApiError.badRequest(
      'Online payment is not available on this server. Please choose to pay on delivery or at the restaurant.',
    );
  }

  if (wantsCod) {
    // Cash on delivery only makes sense when someone is actually delivering.
    if (!isDelivery) {
      throw ApiError.badRequest(
        'Cash on delivery applies to delivery orders. For collection or dining in, choose to pay at the restaurant.',
      );
    }
    if (restaurant.delivery?.codEnabled === false) {
      throw ApiError.badRequest(
        'Cash on delivery is switched off right now. Please pay online instead.',
      );
    }
    const cap = restaurant.delivery?.codMaxOrderValue || 0;
    if (cap > 0 && toRupees(amounts.total) > cap) {
      throw ApiError.badRequest(
        `Cash on delivery is limited to orders up to ₹${cap}. Your total is ₹${toRupees(amounts.total)} — please pay online.`,
        { paymentMethod: `Above the ₹${cap} cash limit` },
      );
    }
  }

  if (!wantsOnline && !wantsCod && isDelivery && restaurant.delivery?.codEnabled !== false) {
    // "Pay at the restaurant" is meaningless for a delivery; treat it as cash
    // on delivery rather than creating an order nobody can settle.
    paymentMethod = PAYMENT_METHOD.COD;
  }

  const contact = {
    name: (req.body.name || req.user.name).trim(),
    phone: (req.body.phone || req.user.phone).trim(),
    email: (req.body.email || req.user.email).trim().toLowerCase(),
  };

  const status = wantsOnline ? ORDER_STATUS.AWAITING_PAYMENT : ORDER_STATUS.PLACED;
  const payLaterStatus =
    paymentMethod === PAYMENT_METHOD.COD
      ? PAYMENT_STATUS.COLLECT_ON_DELIVERY
      : PAYMENT_STATUS.PAY_AT_RESTAURANT;

  const order = await Order.create({
    orderNumber: await Order.nextOrderNumber(),
    user: req.user._id,
    orderType,
    ...links,
    items,
    amounts,
    currency: restaurant.currency,
    offerCode: offer ? offer.code : null,
    loyalty: {
      pointsRedeemed: redemption.points,
      pointsValuePaise: redemption.discountPaise,
      pointsEarned: 0,
    },
    contact,
    note: req.body.note || '',
    status,
    payment: {
      method: wantsOnline ? PAYMENT_METHOD.ONLINE : paymentMethod,
      status: wantsOnline ? PAYMENT_STATUS.PENDING : payLaterStatus,
      provider: wantsOnline ? 'razorpay' : null,
      amount: amounts.total,
    },
    statusHistory: [{ status, by: req.user._id, at: new Date() }],
  });

  if (redemption.points > 0) {
    req.user.moveLoyaltyPoints({
      points: -redemption.points,
      reason: 'redeemed',
      order: order._id,
      note: `Order ${order.orderNumber}`,
    });
    await req.user.save();
  }

  // Promo usage is only counted once the order actually reaches the kitchen;
  // an unpaid online order that is never completed must not burn a use.
  if (offer && !wantsOnline) {
    await Offer.updateOne({ _id: offer._id }, { $inc: { usedCount: 1 } });
  }

  await order.populate([
    { path: 'table', select: 'tableNumber location' },
    { path: 'reservation', select: 'reservationId slotStart' },
  ]);

  res.status(201).json({
    success: true,
    message: wantsOnline
      ? 'Order created — complete payment to send it to the kitchen.'
      : 'Order placed. Pay at the restaurant.',
    data: order,
    meta: { requiresPayment: wantsOnline },
  });
});

/* ────────────────────────────── read ────────────────────────────── */

export const getMyOrders = asyncHandler(async (req, res) => {
  const filter = { user: req.user._id };

  if (req.query.scope === 'active') filter.status = { $in: KITCHEN_STATUSES };
  else if (req.query.scope === 'past') {
    filter.status = { $in: [ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED] };
  }

  const orders = await Order.find(filter)
    .populate('table', 'tableNumber location')
    .populate('reservation', 'reservationId slotStart')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  res.json({ success: true, data: orders });
});

export const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('table', 'tableNumber location')
    .populate('reservation', 'reservationId slotStart')
    .populate('user', 'name email phone');

  if (!order) throw ApiError.notFound('Order not found.');
  assertOwnerOrStaff(order, req.user);

  res.json({ success: true, data: order });
});

/** GET /api/orders — staff/admin listing. */
export const listOrders = asyncHandler(async (req, res) => {
  const { status, orderType, q, paymentStatus, page = 1, limit = 25 } = req.query;
  const filter = {};

  if (status) filter.status = { $in: String(status).split(',') };
  if (orderType) filter.orderType = { $in: String(orderType).split(',') };
  if (paymentStatus) filter['payment.status'] = { $in: String(paymentStatus).split(',') };

  if (req.query.date) {
    const from = new Date(`${req.query.date}T00:00:00.000Z`);
    const to = new Date(from.getTime() + 24 * 60 * 60_000);
    filter.createdAt = { $gte: from, $lt: to };
  }

  if (q && String(q).trim()) {
    const safe = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    filter.$or = [{ orderNumber: rx }, { 'contact.name': rx }, { 'contact.phone': rx }];
  }

  const perPage = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const currentPage = Math.max(Number(page) || 1, 1);

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('table', 'tableNumber location')
      .populate('reservation', 'reservationId slotStart')
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * perPage)
      .limit(perPage)
      .lean(),
    Order.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: orders,
    meta: { total, page: currentPage, limit: perPage, pages: Math.max(Math.ceil(total / perPage), 1) },
  });
});

/** GET /api/orders/kitchen — live tickets for the kitchen board. */
export const getKitchenBoard = asyncHandler(async (_req, res) => {
  const orders = await Order.find({ status: { $in: KITCHEN_STATUSES } })
    .populate('table', 'tableNumber location')
    .populate('reservation', 'reservationId slotStart')
    .sort({ createdAt: 1 })
    .lean();

  const byStatus = KITCHEN_STATUSES.reduce((acc, s) => ({ ...acc, [s]: [] }), {});
  for (const order of orders) byStatus[order.status].push(order);

  res.json({
    success: true,
    data: {
      columns: byStatus,
      total: orders.length,
      itemsInProgress: orders
        .filter((o) => [ORDER_STATUS.ACCEPTED, ORDER_STATUS.PREPARING].includes(o.status))
        .reduce((n, o) => n + o.items.reduce((m, i) => m + i.quantity, 0), 0),
    },
  });
});

/* ────────────────────────────── update ────────────────────────────── */

/** PATCH /api/orders/:id/status — staff/admin kitchen workflow. */
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;

  const order = await Order.findById(req.params.id);
  if (!order) throw ApiError.notFound('Order not found.');

  assertTransitionAllowed(order, status);

  // Refusing an order that has already been paid for online needs a refund, not
  // a silent cancel — surface that rather than quietly keeping the money.
  if (status === ORDER_STATUS.CANCELLED && order.payment.status === PAYMENT_STATUS.PAID) {
    throw ApiError.badRequest(
      'This order was paid online. Refund it from the payment panel, which cancels it as part of the refund.',
    );
  }

  order.recordStatus(status, req.user._id, note);
  if (status === ORDER_STATUS.CANCELLED) order.cancelReason = note || 'Cancelled by the restaurant';
  if (status === ORDER_STATUS.OUT_FOR_DELIVERY && note) order.riderNote = note;
  // "Completed" means handed over at the door for a delivery — stamp it, so the
  // customer's tracker can show when it actually arrived.
  if (status === ORDER_STATUS.COMPLETED && order.orderType === ORDER_TYPE.DELIVERY) {
    order.deliveredAt = new Date();
  }
  // Handing over a cash order IS the payment, so record it rather than leaving
  // the order forever "to collect" and under-reporting takings.
  if (
    status === ORDER_STATUS.COMPLETED &&
    order.payment.method === PAYMENT_METHOD.COD &&
    order.payment.status === PAYMENT_STATUS.COLLECT_ON_DELIVERY
  ) {
    order.payment.status = PAYMENT_STATUS.PAID;
    order.payment.gatewayMethod = 'cash';
    order.payment.paidAt = new Date();
  }
  await order.save();

  /*
   * Points are awarded when the food is actually handed over, not when the
   * order is placed — a cancelled order should never have earned anything, and
   * awarding at completion means there is nothing to claw back.
   */
  if (status === ORDER_STATUS.COMPLETED && !order.loyalty.pointsEarned) {
    const restaurant = await Restaurant.getSingleton();
    const customer = await User.findById(order.user);
    if (customer && restaurant.loyalty?.enabled) {
      const earned = pointsEarnedFor({
        taxablePaise: order.amounts.taxable,
        config: restaurant.loyalty,
        lifetimePoints: customer.loyalty?.lifetimePoints,
      });
      if (earned > 0) {
        customer.moveLoyaltyPoints({
          points: earned,
          reason: 'earned',
          order: order._id,
          note: `Order ${order.orderNumber}`,
        });
        await customer.save();
        order.loyalty.pointsEarned = earned;
      }
    }
  }

  // Cancelling gives back any points the customer spent on it.
  if (status === ORDER_STATUS.CANCELLED && order.loyalty?.pointsRedeemed > 0) {
    const customer = await User.findById(order.user);
    if (customer) {
      customer.moveLoyaltyPoints({
        points: order.loyalty.pointsRedeemed,
        reason: 'refunded',
        order: order._id,
        note: `Cancelled ${order.orderNumber}`,
      });
      await customer.save();
    }
  }

  if (status === ORDER_STATUS.CANCELLED && consumedOfferUse(order)) {
    await Offer.updateOne(
      { code: order.offerCode, usedCount: { $gt: 0 } },
      { $inc: { usedCount: -1 } },
    );
  }

  await order.populate('table', 'tableNumber location');
  res.json({ success: true, message: `Order ${order.orderNumber} → ${status}.`, data: order });
});

/** DELETE /api/orders/:id — customer cancels their own order. */
export const cancelOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw ApiError.notFound('Order not found.');
  assertOwnerOrStaff(order, req.user);

  if (!isStaff(req.user) && !CUSTOMER_CANCELLABLE.includes(order.status)) {
    throw ApiError.badRequest(
      order.status === ORDER_STATUS.ACCEPTED || order.status === ORDER_STATUS.PREPARING
        ? 'The kitchen has already started this order. Please call us if you need to change it.'
        : `An order that is "${order.status}" can no longer be cancelled.`,
    );
  }

  if (order.payment.status === PAYMENT_STATUS.PAID) {
    throw ApiError.badRequest(
      'This order is already paid. Please contact the restaurant to arrange a refund.',
    );
  }

  order.recordStatus(ORDER_STATUS.CANCELLED, req.user._id, req.body?.reason);
  order.cancelReason = req.body?.reason || 'Cancelled by the customer';
  await order.save();

  if (order.loyalty?.pointsRedeemed > 0) {
    req.user.moveLoyaltyPoints({
      points: order.loyalty.pointsRedeemed,
      reason: 'refunded',
      order: order._id,
      note: `Cancelled ${order.orderNumber}`,
    });
    await req.user.save();
  }

  if (consumedOfferUse(order)) {
    await Offer.updateOne(
      { code: order.offerCode, usedCount: { $gt: 0 } },
      { $inc: { usedCount: -1 } },
    );
  }

  res.json({ success: true, message: `Order ${order.orderNumber} cancelled.`, data: order });
});
