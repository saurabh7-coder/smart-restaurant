import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * The signed-in customer's address book.
 *
 * Addresses are a subdocument array on the user rather than their own
 * collection: they are only ever read in the context of one customer, they are
 * few, and keeping them together means one round trip to render checkout.
 */

const MAX_ADDRESSES = 10;

/** Only these fields may be written; anything else in the body is ignored. */
function sanitize(body) {
  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  const lat = num(body.lat);
  const lng = num(body.lng);
  const hasPin = Number.isFinite(lat) && Number.isFinite(lng);

  return {
    label: String(body.label || 'Home').trim().slice(0, 24) || 'Home',
    line1: String(body.line1 || '').trim(),
    line2: String(body.line2 || '').trim(),
    landmark: String(body.landmark || '').trim(),
    city: String(body.city || '').trim(),
    pincode: String(body.pincode || '').trim(),
    lat: hasPin ? lat : null,
    lng: hasPin ? lng : null,
    accuracy: hasPin ? num(body.accuracy) : null,
    locationSource: hasPin ? (body.locationSource === 'gps' ? 'gps' : 'manual') : null,
    directions: String(body.directions || '').trim(),
    isDefault: Boolean(body.isDefault),
  };
}

export const listAddresses = asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.user.addresses });
});

export const addAddress = asyncHandler(async (req, res) => {
  if (req.user.addresses.length >= MAX_ADDRESSES) {
    throw ApiError.badRequest(
      `You can save up to ${MAX_ADDRESSES} addresses. Delete one before adding another.`,
    );
  }

  const address = sanitize(req.body);
  // The first address saved becomes the default; see the User pre-save hook.
  if (req.user.addresses.length === 0) address.isDefault = true;
  if (address.isDefault) req.user.addresses.forEach((a) => { a.isDefault = false; });

  req.user.addresses.push(address);
  await req.user.save();

  res.status(201).json({
    success: true,
    message: 'Address saved.',
    data: req.user.addresses[req.user.addresses.length - 1],
  });
});

export const updateAddress = asyncHandler(async (req, res) => {
  const address = req.user.addresses.id(req.params.id);
  if (!address) throw ApiError.notFound('Address not found.');

  const next = sanitize(req.body);
  if (next.isDefault) req.user.addresses.forEach((a) => { a.isDefault = false; });
  address.set(next);

  await req.user.save();
  res.json({ success: true, message: 'Address updated.', data: address });
});

export const deleteAddress = asyncHandler(async (req, res) => {
  const address = req.user.addresses.id(req.params.id);
  if (!address) throw ApiError.notFound('Address not found.');

  const wasDefault = address.isDefault;
  address.deleteOne();

  // Never leave the book without a default, or checkout has nothing to preselect.
  if (wasDefault && req.user.addresses.length > 0) req.user.addresses[0].isDefault = true;

  await req.user.save();
  res.json({ success: true, message: 'Address removed.', data: req.user.addresses });
});

export const setDefaultAddress = asyncHandler(async (req, res) => {
  const address = req.user.addresses.id(req.params.id);
  if (!address) throw ApiError.notFound('Address not found.');

  req.user.addresses.forEach((a) => { a.isDefault = false; });
  address.isDefault = true;

  await req.user.save();
  res.json({ success: true, message: `${address.label} is now your default.`, data: req.user.addresses });
});
