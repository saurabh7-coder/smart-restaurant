import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signToken } from '../middleware/auth.js';
import { ALLERGENS, ROLES } from '../constants.js';

export const register = asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw ApiError.conflict('An account with that email already exists.', {
      email: 'Already registered',
    });
  }

  // Role is never taken from the request body — self-registration is always a
  // customer. Staff and admin accounts are created by an admin or the seeder.
  const user = await User.create({
    name,
    email,
    phone,
    password,
    role: ROLES.CUSTOMER,
  });

  res.status(201).json({
    success: true,
    message: 'Account created successfully.',
    data: { token: signToken(user), user: user.toSafeJSON() },
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  // Same message for "no such user" and "wrong password" so the endpoint cannot
  // be used to discover which email addresses are registered.
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Incorrect email or password.');
  }
  if (user.isBlocked) throw ApiError.forbidden('This account has been suspended.');

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  res.json({
    success: true,
    message: 'Logged in successfully.',
    data: { token: signToken(user), user: user.toSafeJSON() },
  });
});

export const logout = asyncHandler(async (_req, res) => {
  // JWTs are stateless: the client discards the token. The endpoint exists so the
  // frontend has a single place to call, and so it can be extended with a
  // server-side denylist later without changing the client.
  res.json({ success: true, message: 'Logged out.' });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.user.toSafeJSON() });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone, allergies } = req.body;
  if (name !== undefined) req.user.name = name;
  if (phone !== undefined) req.user.phone = phone;
  if (Array.isArray(allergies)) {
    // Unknown values are dropped rather than rejected: the enum is the real
    // guard, and an older client sending a retired label should not block a
    // profile save it otherwise got right.
    req.user.allergies = [...new Set(allergies.filter((a) => ALLERGENS.includes(a)))];
  }
  await req.user.save();
  res.json({ success: true, message: 'Profile updated.', data: req.user.toSafeJSON() });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.badRequest('Your current password is incorrect.', {
      currentPassword: 'Incorrect password',
    });
  }

  user.password = newPassword;
  await user.save();
  res.json({ success: true, message: 'Password changed successfully.' });
});
