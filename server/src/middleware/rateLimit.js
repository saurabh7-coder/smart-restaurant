import rateLimit from 'express-rate-limit';
import { isProd } from '../config/env.js';

const common = {
  standardHeaders: true,
  legacyHeaders: false,
  // Rate limits get in the way while developing; they matter in production.
  skip: () => !isProd,
};

/** Blunt brute-force guard on login/register. */
export const authLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { success: false, message: 'Too many attempts. Please try again in 15 minutes.' },
});

/** Stops a single client from spraying the booking endpoint. */
export const reservationLimiter = rateLimit({
  ...common,
  windowMs: 10 * 60 * 1000,
  limit: 15,
  message: { success: false, message: 'Too many booking attempts. Please slow down.' },
});

export const apiLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 200,
  message: { success: false, message: 'Too many requests. Please slow down.' },
});
