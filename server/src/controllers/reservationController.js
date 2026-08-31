import { Reservation, isSlotTakenError } from '../models/Reservation.js';
import { Table } from '../models/Table.js';
import { rankTables } from '../utils/tableAllocation.js';
import { Offer } from '../models/Offer.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';
import {
  HOLDING_STATUSES,
  RESERVATION_STATUS,
  STATUS_TRANSITIONS,
  TABLE_STATUS,
} from '../constants.js';
import { assertOwnerOrStaff as assertOwnership, isStaff } from '../utils/ownership.js';
import { assertOfferAvailableTo } from '../utils/offerUsage.js';
import {
  dayBounds,
  localDateString,
  localMinutes,
  minutesToTime,
  resolveSlot,
  slotsForDate,
  todayLocal,
} from '../utils/slots.js';

/* ────────────────────────────── helpers ────────────────────────────── */

const assertOwnerOrStaff = (reservation, user) =>
  assertOwnership(reservation, user, 'reservation');

/** Tables that can physically seat this party, smallest suitable table first. */
function bookableTables(guests) {
  const filter = { status: { $ne: TABLE_STATUS.MAINTENANCE } };
  if (guests) filter.capacity = { $gte: guests };
  return Table.find(filter).sort({ capacity: 1, tableNumber: 1 }).lean();
}

/** IDs of tables already held for an exact slot start. */
async function heldTableIds(slotStart) {
  const rows = await Reservation.find({ slotStart, isActive: true }).select('table').lean();
  return new Set(rows.map((r) => String(r.table)));
}

async function loadOffer(code, guests, user) {
  if (!code) return null;
  const offer = await Offer.findOne({ code: String(code).toUpperCase().trim() });
  if (!offer) throw ApiError.badRequest('That promo code is not valid.', { offerCode: 'Unknown code' });

  const problem = offer.validityError(guests);
  if (problem) throw ApiError.badRequest(problem, { offerCode: problem });

  await assertOfferAvailableTo(offer, user);
  return offer;
}

function assertTransitionAllowed(from, to) {
  const allowed = STATUS_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw ApiError.badRequest(
      `A "${from}" reservation cannot become "${to}".` +
        (allowed.length ? ` Allowed next: ${allowed.join(', ')}.` : ' It is already final.'),
    );
  }
}

/* ────────────────────────────── availability ────────────────────────────── */

/**
 * GET /api/reservations/availability?date=&guests=&time=
 * Public. Returns every seating slot for the day with a free-table count, and —
 * when `time` is supplied — the per-table breakdown for that slot.
 */
export const getAvailability = asyncHandler(async (req, res) => {
  const date = req.query.date || todayLocal();
  const guests = req.query.guests ? Number(req.query.guests) : undefined;

  if (guests !== undefined && (!Number.isInteger(guests) || guests < 1 || guests > 30)) {
    throw ApiError.badRequest('Number of guests must be a whole number between 1 and 30.');
  }

  const slots = slotsForDate(date);
  const tables = await bookableTables(guests);

  if (tables.length === 0) {
    return res.json({
      success: true,
      data: {
        date,
        guests: guests ?? null,
        slotMinutes: env.slotMinutes,
        slots: slots.map((s) => ({ ...s, totalTables: 0, availableTables: 0 })),
        tables: [],
        message: guests
          ? `No table in the restaurant seats ${guests} guests. Please call us to arrange a larger party.`
          : 'No tables are configured yet.',
      },
    });
  }

  const { from, to } = dayBounds(date);
  const held = await Reservation.find({
    slotStart: { $gte: from, $lt: to },
    isActive: true,
  })
    .select('table slotStart')
    .lean();

  const heldBySlot = new Map();
  for (const row of held) {
    const key = row.slotStart.toISOString();
    if (!heldBySlot.has(key)) heldBySlot.set(key, new Set());
    heldBySlot.get(key).add(String(row.table));
  }

  const slotSummary = slots.map((slot) => {
    const taken = heldBySlot.get(slot.start.toISOString()) || new Set();
    const available = tables.filter((t) => !taken.has(String(t._id))).length;
    return {
      time: slot.time,
      label: slot.label,
      endTime: slot.endTime,
      start: slot.start,
      end: slot.end,
      isPast: slot.isPast,
      totalTables: tables.length,
      availableTables: slot.isPast ? 0 : available,
      isBookable: !slot.isPast && available > 0,
    };
  });

  let tableBreakdown = [];
  if (req.query.time) {
    const selected = slots.find((s) => s.time === req.query.time);
    if (!selected) {
      throw ApiError.badRequest(
        `${req.query.time} is not a seating slot. Options: ${slots.map((s) => s.time).join(', ')}.`,
      );
    }
    const taken = heldBySlot.get(selected.start.toISOString()) || new Set();
    tableBreakdown = tables.map((t) => ({
      id: t._id,
      tableNumber: t.tableNumber,
      capacity: t.capacity,
      location: t.location,
      isAvailable: !selected.isPast && !taken.has(String(t._id)),
    }));
  }

  return res.json({
    success: true,
    data: {
      date,
      guests: guests ?? null,
      slotMinutes: env.slotMinutes,
      slots: slotSummary,
      tables: tableBreakdown,
    },
  });
});

/* ────────────────────────────── create ────────────────────────────── */

/**
 * POST /api/reservations
 *
 * Concurrency contract: the availability read below is only an optimisation for
 * choosing which table to try. Correctness comes from the unique index on
 * (table, slotStart) where isActive — the insert itself is the check. When two
 * customers race for the last table, one insert wins and the other raises
 * E11000, which we either retry against another free table or report as 409.
 */
export const createReservation = asyncHandler(async (req, res) => {
  const { date, time, guests, table: requestedTableId, specialRequest, offerCode } = req.body;
  const guestCount = Number(guests);
  const slot = resolveSlot(date, time);

  const contact = {
    name: (req.body.name || req.user.name).trim(),
    phone: (req.body.phone || req.user.phone).trim(),
    email: (req.body.email || req.user.email).trim().toLowerCase(),
  };

  // One party, one table, per slot — stops a single account hoarding the floor.
  const existing = await Reservation.findOne({
    user: req.user._id,
    slotStart: slot.start,
    isActive: true,
  }).lean();
  if (existing) {
    throw ApiError.conflict(
      `You already hold booking ${existing.reservationId} for that slot. Modify it instead of booking twice.`,
    );
  }

  let candidates;
  let allocationReasons = [];
  if (requestedTableId) {
    const table = await Table.findById(requestedTableId).lean();
    if (!table) throw ApiError.notFound('That table does not exist.');
    if (table.status === TABLE_STATUS.MAINTENANCE) {
      throw ApiError.conflict('That table is temporarily out of service.');
    }
    if (table.capacity < guestCount) {
      throw ApiError.badRequest(
        `Table ${table.tableNumber} seats ${table.capacity}, but you have ${guestCount} guests.`,
      );
    }
    candidates = [table];
  } else {
    const all = await bookableTables(guestCount);
    if (all.length === 0) {
      throw ApiError.badRequest(
        `No table seats ${guestCount} guests. Please contact the restaurant to arrange a larger party.`,
      );
    }
    const held = await heldTableIds(slot.start);
    const free = all.filter((t) => !held.has(String(t._id)));
    if (free.length === 0) {
      throw ApiError.conflict(`All tables are booked at ${slot.label}. Please choose another slot.`);
    }

    /*
     * Smart allocation: rank rather than take the first that fits, so a couple
     * is not seated at a table for eight while a party of eight is turned away
     * later in the evening. See utils/tableAllocation.js for the weighting.
     */
    const everyFreeTable = await Table.find({
      status: { $ne: TABLE_STATUS.MAINTENANCE },
      _id: { $nin: [...held].map((id) => id) },
    })
      .select('capacity location')
      .lean();

    const locationLoad = new Map();
    for (const t of all) {
      if (held.has(String(t._id))) {
        locationLoad.set(t.location, (locationLoad.get(t.location) || 0) + 1);
      }
    }

    const ranked = rankTables(free, guestCount, {
      preferredLocation: req.body.preferredLocation,
      locationLoad,
      freeCapacities: everyFreeTable.map((t) => t.capacity),
    });

    candidates = ranked.map((r) => r.table);
    allocationReasons = ranked[0]?.reasons || [];
  }

  const offer = await loadOffer(offerCode, guestCount, req.user);
  const reservationId = await Reservation.nextReservationId(slot.start);

  let reservation = null;
  for (const table of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      reservation = await Reservation.create({
        reservationId,
        user: req.user._id,
        table: table._id,
        slotStart: slot.start,
        slotEnd: slot.end,
        guests: guestCount,
        contact,
        specialRequest: specialRequest || '',
        offerCode: offer ? offer.code : null,
        status: RESERVATION_STATUS.PENDING,
        isActive: true,
        statusHistory: [{ status: RESERVATION_STATUS.PENDING, by: req.user._id, at: new Date() }],
      });
      break;
    } catch (err) {
      // Lost the race for this table — fall through to the next candidate.
      if (isSlotTakenError(err)) continue;
      throw err;
    }
  }

  if (!reservation) {
    throw ApiError.conflict(
      requestedTableId
        ? 'That table was just booked by someone else. Please pick another table or slot.'
        : `All tables were taken at ${slot.label} while you were booking. Please choose another slot.`,
    );
  }

  if (offer) {
    await Offer.updateOne({ _id: offer._id }, { $inc: { usedCount: 1 } });
  }

  await reservation.populate('table', 'tableNumber capacity location');

  res.status(201).json({
    success: true,
    message: 'Reservation created.',
    data: reservation,
    meta: requestedTableId
      ? { allocation: 'you chose this table' }
      : { allocation: allocationReasons.join(', ') || 'best available fit' },
  });
});

/* ────────────────────────────── read ────────────────────────────── */

export const getMyReservations = asyncHandler(async (req, res) => {
  const { scope = 'all' } = req.query;
  const filter = { user: req.user._id };
  const now = new Date();

  if (scope === 'upcoming') {
    filter.slotStart = { $gte: now };
    filter.status = { $in: [RESERVATION_STATUS.PENDING, RESERVATION_STATUS.CONFIRMED] };
  } else if (scope === 'past') {
    filter.$or = [
      { slotStart: { $lt: now } },
      {
        status: {
          $in: [
            RESERVATION_STATUS.CANCELLED,
            RESERVATION_STATUS.COMPLETED,
            RESERVATION_STATUS.NO_SHOW,
          ],
        },
      },
    ];
  }

  const reservations = await Reservation.find(filter)
    .populate('table', 'tableNumber capacity location')
    .sort({ slotStart: -1 })
    .lean();

  res.json({ success: true, data: reservations });
});

export const getReservation = asyncHandler(async (req, res) => {
  const reservation = await Reservation.findById(req.params.id)
    .populate('table', 'tableNumber capacity location')
    .populate('user', 'name email phone');
  if (!reservation) throw ApiError.notFound('Reservation not found.');

  assertOwnerOrStaff(reservation, req.user);
  res.json({ success: true, data: reservation });
});

/** GET /api/reservations — staff/admin listing with filters. */
export const listReservations = asyncHandler(async (req, res) => {
  const { date, status, q, page = 1, limit = 25 } = req.query;
  const filter = {};

  if (date) {
    const { from, to } = dayBounds(date);
    filter.slotStart = { $gte: from, $lt: to };
  }
  if (status) filter.status = { $in: String(status).split(',') };

  if (q && String(q).trim()) {
    const safe = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    filter.$or = [{ reservationId: rx }, { 'contact.name': rx }, { 'contact.phone': rx }];
  }

  const perPage = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const currentPage = Math.max(Number(page) || 1, 1);

  const [reservations, total] = await Promise.all([
    Reservation.find(filter)
      .populate('table', 'tableNumber capacity location')
      .populate('user', 'name email phone')
      .sort({ slotStart: 1, createdAt: 1 })
      .skip((currentPage - 1) * perPage)
      .limit(perPage)
      .lean(),
    Reservation.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: reservations,
    meta: { total, page: currentPage, limit: perPage, pages: Math.max(Math.ceil(total / perPage), 1) },
  });
});

/* ────────────────────────────── modify ────────────────────────────── */

/**
 * PUT /api/reservations/:id
 * Customers may move their own upcoming booking; staff and admins may move any.
 * Rescheduling goes through the same unique index, so moving into a taken slot
 * fails atomically exactly like a fresh booking would.
 */
export const updateReservation = asyncHandler(async (req, res) => {
  const reservation = await Reservation.findById(req.params.id);
  if (!reservation) throw ApiError.notFound('Reservation not found.');
  assertOwnerOrStaff(reservation, req.user);

  const editable = [RESERVATION_STATUS.PENDING, RESERVATION_STATUS.CONFIRMED];
  if (!editable.includes(reservation.status)) {
    throw ApiError.badRequest(`A "${reservation.status}" reservation can no longer be changed.`);
  }
  if (!isStaff(req.user) && reservation.slotStart <= new Date()) {
    throw ApiError.badRequest('This reservation has already started and can no longer be changed.');
  }

  const { date, time, guests, table: newTableId, specialRequest } = req.body;
  const guestCount = guests !== undefined ? Number(guests) : reservation.guests;

  if (date || time) {
    // Fall back to the booking's existing restaurant-local date/time, so changing
    // only the date keeps the time (and vice versa).
    const currentDate = localDateString(reservation.slotStart);
    const currentTime = minutesToTime(localMinutes(reservation.slotStart));
    const slot = resolveSlot(date || currentDate, time || currentTime);
    reservation.slotStart = slot.start;
    reservation.slotEnd = slot.end;
  }

  const targetTableId = newTableId || reservation.table;
  const table = await Table.findById(targetTableId).lean();
  if (!table) throw ApiError.notFound('That table does not exist.');
  if (table.capacity < guestCount) {
    throw ApiError.badRequest(
      `Table ${table.tableNumber} seats ${table.capacity}, but you have ${guestCount} guests.`,
    );
  }
  if (table.status === TABLE_STATUS.MAINTENANCE && String(table._id) !== String(reservation.table)) {
    throw ApiError.conflict('That table is temporarily out of service.');
  }

  reservation.table = table._id;
  reservation.guests = guestCount;
  if (specialRequest !== undefined) reservation.specialRequest = specialRequest;
  if (req.body.name) reservation.contact.name = req.body.name.trim();
  if (req.body.phone) reservation.contact.phone = req.body.phone.trim();
  if (req.body.email) reservation.contact.email = req.body.email.trim().toLowerCase();

  try {
    await reservation.save();
  } catch (err) {
    if (isSlotTakenError(err)) {
      throw ApiError.conflict(
        'That table is already booked for the selected slot. Please choose a different table or time.',
      );
    }
    throw err;
  }

  await reservation.populate('table', 'tableNumber capacity location');
  res.json({ success: true, message: 'Reservation updated.', data: reservation });
});

/** PATCH /api/reservations/:id/status — staff/admin workflow actions. */
export const updateReservationStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;

  const reservation = await Reservation.findById(req.params.id);
  if (!reservation) throw ApiError.notFound('Reservation not found.');

  assertTransitionAllowed(reservation.status, status);
  reservation.recordStatus(status, req.user._id, note);

  try {
    await reservation.save();
  } catch (err) {
    if (isSlotTakenError(err)) {
      throw ApiError.conflict('That table is already held for this slot by another booking.');
    }
    throw err;
  }

  if (status === RESERVATION_STATUS.CANCELLED && reservation.offerCode) {
    await Offer.updateOne(
      { code: reservation.offerCode, usedCount: { $gt: 0 } },
      { $inc: { usedCount: -1 } },
    );
  }

  await reservation.populate('table', 'tableNumber capacity location');
  res.json({ success: true, message: `Reservation marked ${status}.`, data: reservation });
});

/** DELETE /api/reservations/:id — cancel (never a hard delete; history is kept). */
export const cancelReservation = asyncHandler(async (req, res) => {
  const reservation = await Reservation.findById(req.params.id);
  if (!reservation) throw ApiError.notFound('Reservation not found.');
  assertOwnerOrStaff(reservation, req.user);

  assertTransitionAllowed(reservation.status, RESERVATION_STATUS.CANCELLED);

  reservation.recordStatus(RESERVATION_STATUS.CANCELLED, req.user._id, req.body?.reason);
  await reservation.save();

  if (reservation.offerCode) {
    await Offer.updateOne(
      { code: reservation.offerCode, usedCount: { $gt: 0 } },
      { $inc: { usedCount: -1 } },
    );
  }

  res.json({
    success: true,
    message: `Reservation ${reservation.reservationId} cancelled. The table is now free again.`,
    data: reservation,
  });
});

/** GET /api/reservations/today — staff floor view. */
export const getTodayBoard = asyncHandler(async (req, res) => {
  const date = req.query.date || todayLocal();
  const { from, to } = dayBounds(date);

  const reservations = await Reservation.find({
    slotStart: { $gte: from, $lt: to },
    status: { $in: HOLDING_STATUSES },
  })
    .populate('table', 'tableNumber capacity location status')
    .sort({ slotStart: 1 })
    .lean();

  res.json({ success: true, data: { date, reservations } });
});
