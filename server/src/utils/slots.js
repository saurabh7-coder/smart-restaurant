import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The reservation engine uses FIXED, NON-OVERLAPPING seating slots.
 *
 * Why: if any two bookings can partially overlap, "is this table free?" becomes a
 * range-intersection query, which cannot be expressed as a database uniqueness
 * constraint — leaving a check-then-write race that two concurrent requests can
 * both pass. With a fixed grid, a booking is identified by (table, slotStart),
 * and a single unique index makes double-booking physically impossible.
 *
 * Slot length and opening hours are configurable via SLOT_MINUTES / OPEN_TIME /
 * CLOSE_TIME.
 */

export function parseTimeToMinutes(time) {
  const match = TIME_RE.exec(String(time).trim());
  if (!match) throw ApiError.badRequest(`Invalid time "${time}". Expected 24-hour HH:MM.`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTimeLabel(minutes) {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function assertValidDate(date) {
  if (!DATE_RE.test(String(date).trim())) {
    throw ApiError.badRequest(`Invalid date "${date}". Expected YYYY-MM-DD.`);
  }
  const [y, m, d] = String(date).split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    throw ApiError.badRequest(`Invalid calendar date "${date}".`);
  }
  return date;
}

/**
 * Converts a restaurant-local date + minute offset into an absolute UTC Date.
 * All slot times are stored in UTC; RESTAURANT_UTC_OFFSET_MINUTES defines the
 * restaurant's wall clock so the server's own timezone never affects results.
 */
export function toUtcDate(date, minutesFromMidnight) {
  assertValidDate(date);
  const [y, m, d] = date.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  return new Date(base + (minutesFromMidnight - env.utcOffsetMinutes) * 60_000);
}

/** Restaurant-local minutes-from-midnight for an absolute Date. */
export function localMinutes(dateObj) {
  const shifted = new Date(dateObj.getTime() + env.utcOffsetMinutes * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** Restaurant-local YYYY-MM-DD for an absolute Date. */
export function localDateString(dateObj) {
  const shifted = new Date(dateObj.getTime() + env.utcOffsetMinutes * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** The restaurant-local "today" as YYYY-MM-DD. */
export function todayLocal() {
  return localDateString(new Date());
}

/** Every seating slot the restaurant offers on a given day. */
export function slotGrid() {
  const open = parseTimeToMinutes(env.openTime);
  const close = parseTimeToMinutes(env.closeTime);
  const length = env.slotMinutes;

  if (length <= 0) throw new Error('SLOT_MINUTES must be greater than 0');
  if (close <= open) throw new Error('CLOSE_TIME must be later than OPEN_TIME');

  const slots = [];
  for (let start = open; start + length <= close; start += length) {
    slots.push({
      time: minutesToTime(start),
      label: formatTimeLabel(start),
      endTime: minutesToTime(start + length),
      startMinutes: start,
    });
  }
  return slots;
}

/** Slots for a specific date, with absolute start/end and a bookable flag. */
export function slotsForDate(date) {
  assertValidDate(date);
  const now = Date.now();
  return slotGrid().map((slot) => {
    const start = toUtcDate(date, slot.startMinutes);
    const end = new Date(start.getTime() + env.slotMinutes * 60_000);
    return {
      ...slot,
      start,
      end,
      isPast: start.getTime() <= now,
    };
  });
}

/**
 * Resolves a (date, time) pair to a canonical slot. Rejects anything that is not
 * exactly on the grid, in the past, or too far ahead.
 */
export function resolveSlot(date, time) {
  assertValidDate(date);
  const minutes = parseTimeToMinutes(time);
  const slot = slotGrid().find((s) => s.startMinutes === minutes);

  if (!slot) {
    const options = slotGrid().map((s) => s.time).join(', ');
    throw ApiError.badRequest(
      `${time} is not a seating slot. Available slot times: ${options}.`,
    );
  }

  const start = toUtcDate(date, slot.startMinutes);
  const end = new Date(start.getTime() + env.slotMinutes * 60_000);
  const now = Date.now();

  if (start.getTime() <= now) {
    throw ApiError.badRequest('That seating slot has already started. Please pick a later slot.');
  }

  const horizon = now + env.maxBookingDaysAhead * 24 * 60 * 60_000;
  if (start.getTime() > horizon) {
    throw ApiError.badRequest(
      `Reservations open only ${env.maxBookingDaysAhead} days in advance.`,
    );
  }

  return { start, end, time: slot.time, label: slot.label, endTime: slot.endTime };
}

/** Absolute UTC bounds covering one restaurant-local calendar day. */
export function dayBounds(date) {
  assertValidDate(date);
  return {
    from: toUtcDate(date, 0),
    to: toUtcDate(date, 24 * 60),
  };
}
