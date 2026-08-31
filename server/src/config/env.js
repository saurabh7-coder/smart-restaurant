import dotenv from 'dotenv';

dotenv.config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) throw new Error(`Environment variable ${name} must be an integer`);
  return parsed;
}

export const env = {
  port: int('PORT', 5050),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  mongoUri: required('MONGO_URI', 'mongodb://127.0.0.1:27017/smart_restaurant'),

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  bcryptRounds: int('BCRYPT_ROUNDS', 10),

  slotMinutes: int('SLOT_MINUTES', 90),
  openTime: process.env.OPEN_TIME || '11:00',
  closeTime: process.env.CLOSE_TIME || '23:00',
  utcOffsetMinutes: int('RESTAURANT_UTC_OFFSET_MINUTES', 330),
  maxBookingDaysAhead: int('MAX_BOOKING_DAYS_AHEAD', 60),

  /**
   * Optional. When set, the language features (dish descriptions, review
   * analysis, the food chatbot) are answered by Claude; when absent they fall
   * back to the built-in engine rather than failing.
   */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',

  payment: {
    provider: (process.env.PAYMENT_PROVIDER || 'none').toLowerCase(),
    razorpay: {
      keyId: process.env.RAZORPAY_KEY_ID || '',
      keySecret: process.env.RAZORPAY_KEY_SECRET || '',
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    },
  },

  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@restaurant.test',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@12345',
    staffEmail: process.env.SEED_STAFF_EMAIL || 'staff@restaurant.test',
    staffPassword: process.env.SEED_STAFF_PASSWORD || 'Staff@12345',
  },
};

export const isProd = env.nodeEnv === 'production';

/**
 * Online payment is only considered configured when the provider is switched on
 * AND both keys are present. Anything less falls back to pay-at-restaurant, so a
 * half-filled .env can never leave a customer stuck at a broken checkout.
 */
export const isOnlinePaymentEnabled =
  env.payment.provider === 'razorpay' &&
  Boolean(env.payment.razorpay.keyId) &&
  Boolean(env.payment.razorpay.keySecret);

if (isProd && env.payment.provider === 'razorpay' && !isOnlinePaymentEnabled) {
  console.warn(
    '⚠ PAYMENT_PROVIDER=razorpay but RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are missing.\n' +
      '  Online payment is DISABLED; all orders will be pay-at-restaurant.',
  );
}
