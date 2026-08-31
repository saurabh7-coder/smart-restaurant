import { User } from '../models/User.js';
import { Table } from '../models/Table.js';
import { MenuItem } from '../models/MenuItem.js';
import { Reservation } from '../models/Reservation.js';
import { Review } from '../models/Review.js';
import { Restaurant } from '../models/Restaurant.js';
import { Order } from '../models/Order.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';
import {
  HOLDING_STATUSES,
  KITCHEN_STATUSES,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  RESERVATION_STATUS,
  ROLES,
  TABLE_STATUS,
} from '../constants.js';
import { dayBounds, formatTimeLabel, localMinutes, todayLocal } from '../utils/slots.js';

/** GET /api/stats/dashboard — the admin dashboard tiles. */
export const getDashboard = asyncHandler(async (req, res) => {
  const date = req.query.date || todayLocal();
  const { from, to } = dayBounds(date);
  const now = new Date();

  const [restaurant, totalReservations, todaysBookings, totalCustomers, menuItems, totalTables] =
    await Promise.all([
      Restaurant.getSingleton(),
      Reservation.countDocuments({}),
      Reservation.countDocuments({ slotStart: { $gte: from, $lt: to }, isActive: true }),
      User.countDocuments({ role: ROLES.CUSTOMER }),
      MenuItem.countDocuments({}),
      Table.countDocuments({ status: { $ne: TABLE_STATUS.MAINTENANCE } }),
    ]);

  // "Available now" means free for the slot currently in progress, not the
  // staff-set floor flag — that is what a customer walking in would experience.
  const inProgress = await Reservation.find({
    slotStart: { $lte: now },
    slotEnd: { $gt: now },
    isActive: true,
  })
    .select('table')
    .lean();
  const occupiedNow = new Set(inProgress.map((r) => String(r.table)));
  const availableTables = Math.max(totalTables - occupiedNow.size, 0);

  const byStatus = await Reservation.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  /**
   * ACTUAL revenue, from orders that were really paid or billed. Money is stored
   * in paise, so this is exact — no floating-point drift across the sum.
   */
  const [billedAgg] = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: monthStart },
        status: ORDER_STATUS.COMPLETED,
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amounts.total' },
        orders: { $sum: 1 },
        // Gateway takings specifically — a completed cash order is also "paid",
        // so filtering on status alone would report cash as online revenue.
        online: {
          $sum: {
            $cond: [{ $eq: ['$payment.method', PAYMENT_METHOD.ONLINE] }, '$amounts.total', 0],
          },
        },
        onlineCount: {
          $sum: { $cond: [{ $eq: ['$payment.method', PAYMENT_METHOD.ONLINE] }, 1, 0] },
        },
        cash: {
          $sum: {
            $cond: [{ $eq: ['$payment.method', PAYMENT_METHOD.COD] }, '$amounts.total', 0],
          },
        },
      },
    },
  ]);

  const [todaysOrders, liveOrders] = await Promise.all([
    Order.countDocuments({ createdAt: { $gte: from, $lt: to } }),
    Order.countDocuments({ status: { $in: KITCHEN_STATUSES } }),
  ]);

  /**
   * Separate ESTIMATE for seated guests who never placed an order through the
   * app (walk-in food ordered verbally). Kept distinct from billed revenue above
   * so the two are never confused.
   */
  const [revenueAgg] = await Reservation.aggregate([
    {
      $match: {
        status: RESERVATION_STATUS.COMPLETED,
        slotStart: { $gte: monthStart },
      },
    },
    { $group: { _id: null, guests: { $sum: '$guests' }, bookings: { $sum: 1 } } },
  ]);

  res.json({
    success: true,
    data: {
      date,
      totals: {
        reservations: totalReservations,
        todaysBookings,
        availableTables,
        totalTables,
        customers: totalCustomers,
        menuItems,
      },
      reservationsByStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
      orders: {
        today: todaysOrders,
        live: liveOrders,
      },
      /** Real money, from completed orders this month. Stored and summed in paise. */
      billedRevenue: {
        amountPaise: billedAgg?.total || 0,
        onlinePaidPaise: billedAgg?.online || 0,
        cashCollectedPaise: billedAgg?.cash || 0,
        currency: restaurant.currency,
        completedOrders: billedAgg?.orders || 0,
        onlinePaidOrders: billedAgg?.onlineCount || 0,
        isEstimate: false,
      },
      estimatedRevenue: {
        amount: (revenueAgg?.guests || 0) * restaurant.avgSpendPerGuest,
        currency: restaurant.currency,
        basis: `${revenueAgg?.guests || 0} seated guests this month × ${restaurant.currency} ${restaurant.avgSpendPerGuest} average spend — excludes food ordered through the app, which is counted in billed revenue`,
        isEstimate: true,
        completedBookings: revenueAgg?.bookings || 0,
      },
    },
  });
});

/** GET /api/stats/reports?days=30 — trends for the reports screen. */
export const getReports = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [dailyTrend, slotRows, topRated, mostReviewed, guestSizes] = await Promise.all([
    Reservation.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$slotStart',
              timezone: offsetString(env.utcOffsetMinutes),
            },
          },
          bookings: { $sum: 1 },
          guests: { $sum: '$guests' },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    Reservation.find({ slotStart: { $gte: since } }).select('slotStart').lean(),

    MenuItem.find({ 'rating.count': { $gt: 0 } })
      .sort({ 'rating.average': -1, 'rating.count': -1 })
      .limit(10)
      .select('name price rating image foodType')
      .lean(),

    Review.aggregate([
      { $match: { menuItem: { $ne: null } } },
      { $group: { _id: '$menuItem', reviews: { $sum: 1 }, avg: { $avg: '$rating' } } },
      { $sort: { reviews: -1 } },
      { $limit: 10 },
      {
        $lookup: { from: 'menuitems', localField: '_id', foreignField: '_id', as: 'item' },
      },
      { $unwind: '$item' },
      {
        $project: {
          name: '$item.name',
          image: '$item.image',
          reviews: 1,
          avg: { $round: ['$avg', 1] },
        },
      },
    ]),

    Reservation.aggregate([
      { $match: { slotStart: { $gte: since } } },
      { $group: { _id: '$guests', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  /**
   * Real best-sellers, by units actually ordered. This replaces the rating-based
   * proxy the dashboard used before ordering existed.
   */
  const topSelling = await Order.aggregate([
    { $match: { createdAt: { $gte: since }, status: { $ne: ORDER_STATUS.CANCELLED } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.menuItem',
        name: { $first: '$items.name' },
        unitsSold: { $sum: '$items.quantity' },
        revenuePaise: { $sum: '$items.lineTotal' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { unitsSold: -1 } },
    { $limit: 10 },
  ]);

  const ordersByType = await Order.aggregate([
    { $match: { createdAt: { $gte: since }, status: { $ne: ORDER_STATUS.CANCELLED } } },
    {
      $group: {
        _id: '$orderType',
        orders: { $sum: 1 },
        revenuePaise: { $sum: '$amounts.total' },
      },
    },
  ]);

  // Peak hours are computed in restaurant-local time so they mean something to staff.
  const peakMap = new Map();
  for (const row of slotRows) {
    const minutes = localMinutes(row.slotStart);
    peakMap.set(minutes, (peakMap.get(minutes) || 0) + 1);
  }
  const peakHours = [...peakMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([minutes, bookings]) => ({ time: formatTimeLabel(minutes), bookings }));

  res.json({
    success: true,
    data: {
      rangeDays: days,
      dailyTrend: dailyTrend.map((d) => ({ date: d._id, bookings: d.bookings, guests: d.guests })),
      peakHours,
      topRatedDishes: topRated,
      mostReviewedDishes: mostReviewed,
      topSellingDishes: topSelling,
      ordersByType: ordersByType.map((o) => ({
        orderType: o._id,
        orders: o.orders,
        revenuePaise: o.revenuePaise,
      })),
      partySizes: guestSizes.map((g) => ({ guests: g._id, bookings: g.count })),
    },
  });
});

/** Converts +330 minutes into the "+05:30" form MongoDB's $dateToString expects. */
function offsetString(minutes) {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** GET /api/stats/occupancy?date= — table utilisation per slot for one day. */
export const getOccupancy = asyncHandler(async (req, res) => {
  const date = req.query.date || todayLocal();
  const { from, to } = dayBounds(date);

  const [tables, reservations] = await Promise.all([
    Table.countDocuments({ status: { $ne: TABLE_STATUS.MAINTENANCE } }),
    Reservation.find({
      slotStart: { $gte: from, $lt: to },
      status: { $in: HOLDING_STATUSES },
    })
      .select('slotStart guests')
      .lean(),
  ]);

  const bySlot = new Map();
  for (const r of reservations) {
    const key = localMinutes(r.slotStart);
    const entry = bySlot.get(key) || { booked: 0, guests: 0 };
    entry.booked += 1;
    entry.guests += r.guests;
    bySlot.set(key, entry);
  }

  res.json({
    success: true,
    data: {
      date,
      totalTables: tables,
      slots: [...bySlot.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([minutes, v]) => ({
          time: formatTimeLabel(minutes),
          booked: v.booked,
          guests: v.guests,
          occupancyPercent: tables ? Math.round((v.booked / tables) * 100) : 0,
        })),
    },
  });
});
