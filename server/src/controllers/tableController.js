import { Table } from '../models/Table.js';
import { Reservation } from '../models/Reservation.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HOLDING_STATUSES } from '../constants.js';

export const listTables = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.location) filter.location = req.query.location;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.minCapacity) filter.capacity = { $gte: Number(req.query.minCapacity) };

  const tables = await Table.find(filter).sort({ tableNumber: 1 }).lean();
  res.json({ success: true, data: tables });
});

export const createTable = asyncHandler(async (req, res) => {
  const table = await Table.create(req.body);
  res.status(201).json({ success: true, message: 'Table created.', data: table });
});

export const updateTable = asyncHandler(async (req, res) => {
  const table = await Table.findById(req.params.id);
  if (!table) throw ApiError.notFound('Table not found.');

  const nextCapacity = req.body.capacity !== undefined ? Number(req.body.capacity) : table.capacity;

  // Shrinking a table below a booked party size would silently break those
  // bookings, so refuse and let the admin move the guests first.
  if (nextCapacity < table.capacity) {
    const tooBig = await Reservation.findOne({
      table: table._id,
      isActive: true,
      slotStart: { $gte: new Date() },
      guests: { $gt: nextCapacity },
    }).lean();

    if (tooBig) {
      throw ApiError.conflict(
        `Cannot reduce capacity to ${nextCapacity}: booking ${tooBig.reservationId} seats ${tooBig.guests} guests at this table.`,
      );
    }
  }

  Object.assign(table, req.body);
  await table.save();
  res.json({ success: true, message: 'Table updated.', data: table });
});

export const deleteTable = asyncHandler(async (req, res) => {
  const upcoming = await Reservation.countDocuments({
    table: req.params.id,
    status: { $in: HOLDING_STATUSES },
    slotStart: { $gte: new Date() },
  });

  if (upcoming > 0) {
    throw ApiError.conflict(
      `Cannot delete this table — it has ${upcoming} upcoming reservation(s). Cancel or move them first.`,
    );
  }

  const table = await Table.findByIdAndDelete(req.params.id);
  if (!table) throw ApiError.notFound('Table not found.');
  res.json({ success: true, message: 'Table deleted.' });
});

/** Staff floor action: mark a table available / occupied / reserved / maintenance. */
export const updateTableStatus = asyncHandler(async (req, res) => {
  const table = await Table.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status },
    { new: true, runValidators: true },
  );
  if (!table) throw ApiError.notFound('Table not found.');
  res.json({ success: true, message: `Table ${table.tableNumber} marked ${table.status}.`, data: table });
});
