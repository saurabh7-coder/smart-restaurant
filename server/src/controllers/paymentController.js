import { Order } from '../models/Order.js';
import { Offer } from '../models/Offer.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { isOnlinePaymentEnabled } from '../config/env.js';
import { isOwner } from '../utils/ownership.js';
import { ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, ROLES } from '../constants.js';
import {
  createGatewayOrder,
  fetchPayment,
  publicPaymentConfig,
  refundPayment,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from '../services/razorpay.js';

/** GET /api/payments/config — what the browser needs to open checkout. */
export const getPaymentConfig = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: publicPaymentConfig() });
});

/**
 * POST /api/payments/session
 * Creates the gateway order for one of OUR orders and returns the handle the
 * browser checkout needs. The amount comes from the stored order, never from
 * the request, so the customer cannot choose what to pay.
 */
export const createPaymentSession = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.body.order);
  if (!order) throw ApiError.notFound('Order not found.');

  if (!isOwner(order, req.user)) {
    throw ApiError.forbidden('This order belongs to another customer.');
  }
  if (order.payment.method !== PAYMENT_METHOD.ONLINE) {
    throw ApiError.badRequest('This order is set to be paid at the restaurant.');
  }
  if (order.payment.status === PAYMENT_STATUS.PAID) {
    throw ApiError.conflict('This order has already been paid.');
  }
  if (order.status === ORDER_STATUS.CANCELLED) {
    throw ApiError.badRequest('This order was cancelled and can no longer be paid.');
  }

  // Reuse an existing gateway order rather than creating a second one for the
  // same bill — otherwise a customer who reloads checkout leaves orphaned
  // gateway orders behind, and the unique index would reject the duplicate.
  if (order.payment.providerOrderId) {
    return res.json({
      success: true,
      data: {
        ...publicPaymentConfig(),
        gatewayOrderId: order.payment.providerOrderId,
        amount: order.amounts.total,
        currency: order.currency,
        orderNumber: order.orderNumber,
        prefill: {
          name: order.contact.name,
          email: order.contact.email,
          contact: order.contact.phone,
        },
      },
    });
  }

  const gateway = await createGatewayOrder({
    amountPaise: order.amounts.total,
    currency: order.currency,
    receipt: order.orderNumber,
    notes: { orderNumber: order.orderNumber, orderId: String(order._id) },
  });

  order.payment.providerOrderId = gateway.id;
  order.payment.provider = 'razorpay';
  order.payment.status = PAYMENT_STATUS.PENDING;
  await order.save();

  return res.json({
    success: true,
    data: {
      ...publicPaymentConfig(),
      gatewayOrderId: gateway.id,
      amount: order.amounts.total,
      currency: order.currency,
      orderNumber: order.orderNumber,
      prefill: {
        name: order.contact.name,
        email: order.contact.email,
        contact: order.contact.phone,
      },
    },
  });
});

/**
 * Marks an order paid exactly once.
 *
 * The conditional filter (`payment.status` not already paid) makes this
 * idempotent and race-safe: the browser callback and the webhook routinely
 * arrive for the same payment, sometimes simultaneously. Whichever lands first
 * wins; the other is a no-op instead of double-counting a promo use.
 *
 * @returns the updated order, or null if it was already paid.
 */
async function markPaid(order, { paymentId, via, method }) {
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, 'payment.status': { $ne: PAYMENT_STATUS.PAID } },
    {
      $set: {
        status: ORDER_STATUS.PLACED,
        'payment.status': PAYMENT_STATUS.PAID,
        'payment.providerPaymentId': paymentId,
        'payment.signatureVerified': true,
        'payment.verifiedVia': via,
        'payment.paidAt': new Date(),
        'payment.failureReason': null,
        ...(method ? { 'payment.gatewayMethod': method } : {}),
      },
      $push: {
        statusHistory: {
          status: ORDER_STATUS.PLACED,
          at: new Date(),
          note: `Payment verified via ${via}`,
        },
      },
    },
    { new: true },
  );

  if (updated && updated.offerCode) {
    await Offer.updateOne({ code: updated.offerCode }, { $inc: { usedCount: 1 } });
  }

  return updated;
}

/**
 * POST /api/payments/verify
 * Called by the browser after Razorpay Checkout reports success.
 *
 * The browser's word counts for nothing here. Only the HMAC signature — which
 * could only have been produced with the key secret held on this server —
 * promotes the order to `placed` and makes it visible to the kitchen.
 */
export const verifyPayment = asyncHandler(async (req, res) => {
  const { order: orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found.');
  if (!isOwner(order, req.user)) {
    throw ApiError.forbidden('This order belongs to another customer.');
  }

  if (order.payment.status === PAYMENT_STATUS.PAID) {
    return res.json({ success: true, message: 'This order is already paid.', data: order });
  }

  // The signed order id must be the one we created for THIS order, so a valid
  // signature from a different (perhaps much cheaper) order cannot be replayed.
  if (order.payment.providerOrderId !== razorpay_order_id) {
    throw ApiError.badRequest('That payment does not belong to this order.');
  }

  const ok = verifyCheckoutSignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });

  if (!ok) {
    order.payment.failureReason = 'Signature verification failed';
    order.payment.status = PAYMENT_STATUS.FAILED;
    await order.save();
    throw ApiError.badRequest(
      'We could not verify that payment. If money left your account, contact the restaurant with your order number — nothing has been charged to this order.',
    );
  }

  // Cross-check the amount actually captured. The gateway order was created
  // server-side with the correct amount, but verifying closes the loop.
  let gatewayMethod = null;
  try {
    const payment = await fetchPayment(razorpay_payment_id);
    gatewayMethod = payment?.method || null;

    if (Number(payment?.amount) !== Number(order.amounts.total)) {
      throw ApiError.badRequest(
        `Paid amount does not match the order total. Please contact the restaurant with order ${order.orderNumber}.`,
      );
    }
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 400) throw err;
    // Gateway unreachable for the cross-check: the signature is still
    // cryptographic proof, and the webhook will reconcile. Do not block the guest.
    console.warn('[payments] amount cross-check skipped:', err.message);
  }

  const updated = await markPaid(order, {
    paymentId: razorpay_payment_id,
    via: 'checkout',
    method: gatewayMethod,
  });

  return res.json({
    success: true,
    message: 'Payment received — your order is with the kitchen.',
    data: updated || (await Order.findById(order._id)),
  });
});

/**
 * POST /api/payments/webhook
 * Server-to-server notification from Razorpay. Mounted with express.raw() so the
 * signature can be checked against the exact bytes that were signed.
 *
 * This is the safety net: if the customer closes the tab before the browser
 * callback fires, the webhook still moves the order to the kitchen.
 */
export const handleWebhook = asyncHandler(async (req, res) => {
  const signature = req.get('x-razorpay-signature');
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body || ''));

  if (!verifyWebhookSignature(raw, signature)) {
    // 400, not 401 — Razorpay retries on 5xx, and a bad signature will never
    // become good on retry.
    console.warn('[payments] rejected webhook with an invalid signature');
    return res.status(400).json({ success: false, message: 'Invalid signature.' });
  }

  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).json({ success: false, message: 'Malformed payload.' });
  }

  const entity = event?.payload?.payment?.entity;
  const gatewayOrderId = entity?.order_id;

  if (!gatewayOrderId) {
    // Nothing to reconcile, but acknowledge so Razorpay stops retrying.
    return res.json({ success: true, message: 'Ignored.' });
  }

  const order = await Order.findOne({ 'payment.providerOrderId': gatewayOrderId });
  if (!order) {
    console.warn('[payments] webhook for unknown gateway order', gatewayOrderId);
    return res.json({ success: true, message: 'Unknown order; acknowledged.' });
  }

  if (event.event === 'payment.captured' || event.event === 'order.paid') {
    await markPaid(order, { paymentId: entity.id, via: 'webhook', method: entity.method });
  } else if (event.event === 'payment.failed') {
    await Order.updateOne(
      { _id: order._id, 'payment.status': { $ne: PAYMENT_STATUS.PAID } },
      {
        $set: {
          'payment.status': PAYMENT_STATUS.FAILED,
          'payment.failureReason': entity?.error_description || 'Payment failed at the gateway',
        },
      },
    );
  }

  return res.json({ success: true });
});

/**
 * POST /api/payments/refund — admin only.
 * Refunds a paid order and cancels it in one step, so money and order state can
 * never drift apart.
 */
export const refundOrder = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.ADMIN) throw ApiError.forbidden('Only an admin can issue refunds.');

  const order = await Order.findById(req.body.order);
  if (!order) throw ApiError.notFound('Order not found.');

  if (order.payment.status !== PAYMENT_STATUS.PAID) {
    throw ApiError.badRequest('Only a paid order can be refunded.');
  }

  /*
   * The nature of the payment is checked BEFORE whether a gateway is
   * configured. Cash never went through a gateway, so it can never be refunded
   * through one — that is true whether or not keys are present, and testing the
   * configuration first would answer a cash refund with the irrelevant
   * "online payment is not configured".
   */
  if (order.payment.method !== PAYMENT_METHOD.ONLINE || !order.payment.providerPaymentId) {
    throw ApiError.badRequest(
      'This order was paid in cash, so it cannot be refunded through the payment gateway. Refund the customer directly and cancel the order.',
    );
  }

  if (!isOnlinePaymentEnabled) throw ApiError.badRequest('Online payment is not configured.');

  const refund = await refundPayment(order.payment.providerPaymentId, order.amounts.total);

  order.payment.status = PAYMENT_STATUS.REFUNDED;
  order.payment.refundId = refund.id;
  order.payment.refundedAt = new Date();
  order.recordStatus(ORDER_STATUS.CANCELLED, req.user._id, req.body.reason || 'Refunded');
  order.cancelReason = req.body.reason || 'Refunded by the restaurant';
  await order.save();

  if (order.offerCode) {
    await Offer.updateOne(
      { code: order.offerCode, usedCount: { $gt: 0 } },
      { $inc: { usedCount: -1 } },
    );
  }

  res.json({
    success: true,
    message: `Refunded ${order.orderNumber}. The order has been cancelled.`,
    data: order,
  });
});
