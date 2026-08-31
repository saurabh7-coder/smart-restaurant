import { User } from '../models/User.js';
import { Reservation } from '../models/Reservation.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HOLDING_STATUSES, ROLES, ROLE_VALUES } from '../constants.js';

export const listUsers = asyncHandler(async (req, res) => {
  const { role, q, page = 1, limit = 25 } = req.query;
  const filter = {};

  if (role) filter.role = role;
  if (q && String(q).trim()) {
    const safe = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }

  const perPage = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const currentPage = Math.max(Number(page) || 1, 1);

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * perPage)
      .limit(perPage)
      .lean(),
    User.countDocuments(filter),
  ]);

  // Reservation counts make the customer list actually useful to the restaurant.
  const counts = await Reservation.aggregate([
    { $match: { user: { $in: users.map((u) => u._id) } } },
    { $group: { _id: '$user', total: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.total]));

  res.json({
    success: true,
    data: users.map(({ password, ...u }) => ({
      ...u,
      reservationCount: countMap.get(String(u._id)) || 0,
    })),
    meta: { total, page: currentPage, limit: perPage, pages: Math.max(Math.ceil(total / perPage), 1) },
  });
});

export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found.');

  const reservations = await Reservation.find({ user: user._id })
    .populate('table', 'tableNumber')
    .sort({ slotStart: -1 })
    .limit(50)
    .lean();

  res.json({ success: true, data: { user: user.toSafeJSON(), reservations } });
});

/** Admin creates staff/admin accounts — self-registration can only make customers. */
export const createStaffUser = asyncHandler(async (req, res) => {
  const { name, email, phone, password, role } = req.body;

  if (!ROLE_VALUES.includes(role)) throw ApiError.badRequest('Invalid role.');

  const existing = await User.findOne({ email: String(email).toLowerCase() });
  if (existing) throw ApiError.conflict('An account with that email already exists.');

  const user = await User.create({ name, email, phone, password, role });
  res.status(201).json({ success: true, message: `${role} account created.`, data: user.toSafeJSON() });
});

export const updateUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!ROLE_VALUES.includes(role)) throw ApiError.badRequest('Invalid role.');

  if (String(req.params.id) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot change your own role.');
  }

  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
  if (!user) throw ApiError.notFound('User not found.');

  res.json({ success: true, message: `Role updated to ${role}.`, data: user.toSafeJSON() });
});

export const setUserBlocked = asyncHandler(async (req, res) => {
  const isBlocked = Boolean(req.body.isBlocked);

  if (String(req.params.id) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot suspend your own account.');
  }

  const user = await User.findByIdAndUpdate(req.params.id, { isBlocked }, { new: true });
  if (!user) throw ApiError.notFound('User not found.');

  res.json({
    success: true,
    message: isBlocked ? 'Account suspended.' : 'Account reinstated.',
    data: user.toSafeJSON(),
  });
});

export const deleteUser = asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot delete your own account.');
  }

  const upcoming = await Reservation.countDocuments({
    user: req.params.id,
    status: { $in: HOLDING_STATUSES },
    slotStart: { $gte: new Date() },
  });
  if (upcoming > 0) {
    throw ApiError.conflict(
      `This customer has ${upcoming} upcoming reservation(s). Cancel them before deleting the account.`,
    );
  }

  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found.');
  if (user.role === ROLES.ADMIN) {
    throw ApiError.forbidden('Demote this admin to a customer before deleting the account.');
  }

  await user.deleteOne();
  res.json({ success: true, message: 'Account deleted.' });
});
