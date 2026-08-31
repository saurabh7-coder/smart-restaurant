import crypto from 'node:crypto';
import { env, isOnlinePaymentEnabled } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const API_BASE = 'https://api.razorpay.com/v1';

/**
 * Razorpay client built on plain fetch rather than the official SDK.
 *
 * Two reasons: it keeps the dependency surface small, and — more importantly —
 * every security-relevant step (what we send, how we verify signatures) stays
 * visible in this file instead of behind a library, which matters when the whole
 * point of the integration is that the server never trusts the browser.
 *
 * Amounts are integer paise throughout, matching how orders are stored.
 */

function authHeader() {
  const { keyId, keySecret } = env.payment.razorpay;
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

export function assertConfigured() {
  if (!isOnlinePaymentEnabled) {
    throw ApiError.badRequest(
      'Online payment is not configured on this server. Please choose "pay at the restaurant".',
    );
  }
}

async function call(path, { method = 'GET', body } = {}) {
  assertConfigured();

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    // A gateway timeout must not read as "payment failed" — the customer may
    // have been charged. Surface it as an upstream problem.
    throw new ApiError(502, `Could not reach the payment gateway (${err.name}). Please try again.`);
  }

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const description = payload?.error?.description || `Gateway returned ${res.status}`;
    console.error('[razorpay]', res.status, JSON.stringify(payload?.error || {}));
    throw new ApiError(res.status === 400 ? 400 : 502, `Payment gateway: ${description}`);
  }

  return payload;
}

/** Creates the gateway-side order the browser checkout will reference. */
export function createGatewayOrder({ amountPaise, currency, receipt, notes }) {
  return call('/orders', {
    method: 'POST',
    body: {
      amount: amountPaise,
      currency: currency || 'INR',
      receipt: String(receipt).slice(0, 40),
      // payment_capture:1 captures automatically on authorisation, so an
      // authorised-but-uncaptured payment can never be left in limbo.
      payment_capture: 1,
      notes: notes || {},
    },
  });
}

export function fetchPayment(paymentId) {
  return call(`/payments/${encodeURIComponent(paymentId)}`);
}

export function refundPayment(paymentId, amountPaise) {
  return call(`/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: 'POST',
    body: amountPaise ? { amount: amountPaise } : {},
  });
}

/** Constant-time compare so signature checks leak no timing information. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies the signature Razorpay Checkout hands back to the browser.
 *
 * This is THE control that makes online payment trustworthy: the browser tells
 * us "payment succeeded", and a malicious client could say that too. Only the
 * HMAC — computed with the key secret that never leaves this server — proves the
 * gateway actually authorised it. An order is never marked paid without it.
 *
 * signature = HMAC_SHA256(`${razorpay_order_id}|${razorpay_payment_id}`, key_secret)
 */
export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) return false;

  const expected = crypto
    .createHmac('sha256', env.payment.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  return safeEqual(expected, signature);
}

/**
 * Verifies a server-to-server webhook.
 *
 * The HMAC is computed over the EXACT raw request body — re-serialising parsed
 * JSON would reorder keys or change spacing and the signature would never match.
 * That is why the webhook route is mounted with express.raw().
 */
export function verifyWebhookSignature(rawBody, signature) {
  const secret = env.payment.razorpay.webhookSecret;
  if (!secret || !signature || !rawBody) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}

/** Public config the browser needs — key id only, never the secret. */
export function publicPaymentConfig() {
  return {
    enabled: isOnlinePaymentEnabled,
    provider: isOnlinePaymentEnabled ? 'razorpay' : null,
    keyId: isOnlinePaymentEnabled ? env.payment.razorpay.keyId : null,
    checkoutScript: 'https://checkout.razorpay.com/v1/checkout.js',
  };
}
