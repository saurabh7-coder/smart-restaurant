import { ROLES } from '../constants.js';
import { ApiError } from './ApiError.js';

export const isStaff = (user) => Boolean(user) && [ROLES.ADMIN, ROLES.STAFF].includes(user.role);

/**
 * The id of whoever owns a document, whether or not `user` has been populated.
 *
 * This exists because of a real bug: comparing `String(doc.user)` works fine
 * against a raw ObjectId, but a `.populate('user')` call replaces that field
 * with a full Mongoose document, and `String(document)` renders the whole object
 * (`{ _id: ..., name: ... }`). The comparison then fails for EVERY owner, so
 * customers were locked out of their own orders and bookings while staff — who
 * short-circuit before the check — saw nothing wrong.
 *
 * Reading `_id` when it is present makes the check independent of whether the
 * caller happened to populate the field.
 */
export function ownerIdOf(doc) {
  const owner = doc?.user;
  if (!owner) return null;
  return String(owner._id ?? owner);
}

export function isOwner(doc, user) {
  const owner = ownerIdOf(doc);
  return Boolean(owner) && Boolean(user) && owner === String(user._id);
}

/** Allows the owning customer, or any staff/admin. Throws 403 otherwise. */
export function assertOwnerOrStaff(doc, user, subject = 'record') {
  if (isStaff(user)) return;
  if (!isOwner(doc, user)) {
    throw ApiError.forbidden(`This ${subject} belongs to another customer.`);
  }
}
