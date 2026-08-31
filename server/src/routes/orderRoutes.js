import { Router } from 'express';
import { body, param } from 'express-validator';
import * as order from '../controllers/orderController.js';
import { protect, staffOrAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { reservationLimiter } from '../middleware/rateLimit.js';
import { ORDER_STATUS_VALUES, ORDER_TYPE_VALUES, PAYMENT_METHOD_VALUES } from '../constants.js';

const router = Router();

const idRule = param('id').isMongoId().withMessage('Invalid order id');

/**
 * Cart lines carry ids and quantities only. Prices are deliberately NOT accepted
 * from the client — see utils/pricing.js.
 */
const cartRules = [
  body('items').isArray({ min: 1 }).withMessage('Your cart is empty'),
  body('items.*.menuItem').isMongoId().withMessage('Invalid dish in cart'),
  body('items.*.quantity').isInt({ min: 1, max: 50 }).withMessage('Quantity must be 1-50'),
  body('items.*.note').optional().trim().isLength({ max: 200 }),
  body('offerCode').optional({ values: 'falsy' }).trim().isLength({ max: 24 }),
  body('redeemPoints').optional({ values: 'falsy' }).isInt({ min: 0 }).withMessage('Points must be a whole number'),
];

// Static paths before "/:id".
router.post(
  '/quote',
  protect,
  validate([
    ...cartRules,
    body('orderType').optional().isIn(ORDER_TYPE_VALUES).withMessage('Invalid order type'),
  ]),
  order.quoteOrder,
);
router.get('/kitchen', staffOrAdmin, order.getKitchenBoard);
router.get('/mine', protect, order.getMyOrders);

router.get('/', staffOrAdmin, order.listOrders);

router.post(
  '/',
  protect,
  reservationLimiter,
  validate([
    ...cartRules,
    body('orderType').isIn(ORDER_TYPE_VALUES).withMessage('Choose how you want to order'),
    body('paymentMethod').optional().isIn(PAYMENT_METHOD_VALUES).withMessage('Invalid payment method'),
    body('reservation').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid booking'),
    body('table').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid table'),
    body('pickupAt').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid collection time'),
    body('savedAddressId').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid saved address'),
    body('deliveryAddress').optional().isObject().withMessage('Invalid delivery address'),
    body('deliveryAddress.line1').optional().trim().isLength({ max: 160 }),
    body('deliveryAddress.city').optional().trim().isLength({ max: 80 }),
    body('deliveryAddress.pincode')
      .optional()
      .trim()
      .matches(/^[1-9][0-9]{5}$/)
      .withMessage('Enter a valid 6-digit PIN code'),
    body('deliveryAddress.lat').optional({ values: 'null' }).isFloat({ min: -90, max: 90 }),
    body('deliveryAddress.lng').optional({ values: 'null' }).isFloat({ min: -180, max: 180 }),
    body('name').optional().trim().isLength({ min: 1, max: 80 }),
    body('phone')
      .optional()
      .trim()
      .matches(/^[+\d][\d\s-]{6,19}$/)
      .withMessage('Enter a valid phone number'),
    body('email').optional().trim().isEmail().withMessage('Enter a valid email'),
    body('note').optional().trim().isLength({ max: 500 }),
  ]),
  order.createOrder,
);

router.get('/:id', protect, validate([idRule]), order.getOrder);

router.patch(
  '/:id/status',
  staffOrAdmin,
  validate([
    idRule,
    body('status').isIn(ORDER_STATUS_VALUES).withMessage('Invalid status'),
    body('note').optional().trim().isLength({ max: 200 }),
  ]),
  order.updateOrderStatus,
);

router.delete('/:id', protect, validate([idRule]), order.cancelOrder);

export default router;
