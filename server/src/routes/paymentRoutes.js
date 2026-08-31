import { Router } from 'express';
import { body } from 'express-validator';
import * as payment from '../controllers/paymentController.js';
import { adminOnly, protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.get('/config', payment.getPaymentConfig);

router.post(
  '/session',
  protect,
  authLimiter,
  validate([body('order').isMongoId().withMessage('Invalid order')]),
  payment.createPaymentSession,
);

router.post(
  '/verify',
  protect,
  validate([
    body('order').isMongoId().withMessage('Invalid order'),
    body('razorpay_order_id').trim().notEmpty().withMessage('Missing gateway order id'),
    body('razorpay_payment_id').trim().notEmpty().withMessage('Missing payment id'),
    body('razorpay_signature').trim().notEmpty().withMessage('Missing signature'),
  ]),
  payment.verifyPayment,
);

/**
 * Unauthenticated by design — the caller is Razorpay's server, not a logged-in
 * user. Its authenticity is proven by the HMAC signature over the raw body,
 * which is why app.js mounts express.raw() on this exact path.
 */
router.post('/webhook', payment.handleWebhook);

router.post(
  '/refund',
  adminOnly,
  validate([
    body('order').isMongoId().withMessage('Invalid order'),
    body('reason').optional().trim().isLength({ max: 300 }),
  ]),
  payment.refundOrder,
);

export default router;
