import { Router } from 'express';
import { body, param } from 'express-validator';
import * as offer from '../controllers/offerController.js';
import { adminOnly, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const idRule = param('id').isMongoId().withMessage('Invalid id');

router.get('/', optionalAuth, offer.listOffers);

// optionalAuth so a signed-in customer also gets the per-customer check here,
// rather than being told "applied" and refused later at checkout.
router.post(
  '/validate',
  optionalAuth,
  validate([
    body('code').trim().notEmpty().withMessage('Enter a promo code'),
    body('guests').optional().isInt({ min: 1, max: 30 }),
  ]),
  offer.validateOffer,
);

router.post(
  '/',
  adminOnly,
  validate([
    body('code').trim().notEmpty().withMessage('Code is required').isLength({ max: 24 }),
    body('discountValue').isFloat({ min: 0 }).withMessage('Discount must be 0 or more'),
    body('discountType').optional().isIn(['percent', 'flat']).withMessage('Invalid discount type'),
    body('startDate').isISO8601().withMessage('Start date is required'),
    body('endDate').isISO8601().withMessage('End date is required'),
    body('minGuests').optional().isInt({ min: 1 }),
    body('usageLimit').optional({ values: 'null' }).isInt({ min: 1 }),
    body('perCustomerLimit').optional({ values: 'null' }).isInt({ min: 1 }),
  ]),
  offer.createOffer,
);

router.put('/:id', adminOnly, validate([idRule]), offer.updateOffer);
router.delete('/:id', adminOnly, validate([idRule]), offer.deleteOffer);

export default router;
