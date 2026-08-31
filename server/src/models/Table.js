import mongoose from 'mongoose';
import { TABLE_LOCATIONS, TABLE_STATUS, TABLE_STATUS_VALUES } from '../constants.js';

const tableSchema = new mongoose.Schema(
  {
    tableNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 10,
    },
    capacity: { type: Number, required: true, min: 1, max: 30 },
    location: { type: String, enum: TABLE_LOCATIONS, default: 'indoor', index: true },
    /**
     * Live floor state, maintained by staff. This is NOT the source of truth for
     * whether a slot can be booked — that comes from the Reservation collection.
     * Only `maintenance` removes a table from the bookable pool.
     */
    status: { type: String, enum: TABLE_STATUS_VALUES, default: TABLE_STATUS.AVAILABLE },
    notes: { type: String, trim: true, maxlength: 200, default: '' },
  },
  { timestamps: true },
);

tableSchema.index({ capacity: 1 });

export const Table = mongoose.model('Table', tableSchema);
