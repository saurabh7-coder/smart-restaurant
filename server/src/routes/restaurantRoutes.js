import { Router } from 'express';
import { body } from 'express-validator';
import * as restaurant from '../controllers/restaurantController.js';
import { adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get('/', restaurant.getRestaurant);

router.put(
  '/',
  adminOnly,
  validate([
    body('name').optional().trim().notEmpty().withMessage('Restaurant name cannot be empty'),
    body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('Enter a valid email'),
    body('avgSpendPerGuest').optional().isFloat({ min: 0 }).withMessage('Must be 0 or more'),
    body('taxPercent').optional().isFloat({ min: 0, max: 100 }).withMessage('Tax must be 0-100%'),
    body('minOrderValue').optional().isFloat({ min: 0 }).withMessage('Must be 0 or more'),
    body('takeawayLeadMinutes').optional().isInt({ min: 0, max: 480 }).withMessage('Must be 0-480 minutes'),
    body('lat').optional({ values: 'null' }).isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
    body('lng').optional({ values: 'null' }).isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
    body('delivery.fee').optional().isFloat({ min: 0 }).withMessage('Delivery fee must be 0 or more'),
    body('delivery.freeAbove').optional().isFloat({ min: 0 }).withMessage('Must be 0 or more'),
    body('delivery.minOrderValue').optional().isFloat({ min: 0 }).withMessage('Must be 0 or more'),
    body('delivery.radiusKm').optional().isFloat({ min: 0, max: 100 }).withMessage('Radius must be 0-100 km'),
    body('delivery.etaMinutes').optional().isInt({ min: 0, max: 240 }).withMessage('ETA must be 0-240 minutes'),
    body('delivery.codEnabled').optional().isBoolean().withMessage('Must be true or false'),
    body('loyalty.enabled').optional().isBoolean().withMessage('Must be true or false'),
    body('loyalty.rupeesPerPoint').optional().isFloat({ min: 1 }).withMessage('Must be at least 1'),
    body('loyalty.pointValue').optional().isFloat({ min: 0 }).withMessage('Must be 0 or more'),
    body('loyalty.minRedeemPoints').optional().isInt({ min: 0 }).withMessage('Must be 0 or more'),
    body('loyalty.maxRedeemPercent').optional().isFloat({ min: 0, max: 100 }).withMessage('0-100%'),
    body('loyalty.signupBonus').optional().isInt({ min: 0 }).withMessage('Must be 0 or more'),
    body('delivery.codMaxOrderValue').optional().isFloat({ min: 0 }).withMessage('Must be 0 or more'),
    body('openTime').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Use HH:MM'),
    body('closeTime').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Use HH:MM'),
  ]),
  restaurant.updateRestaurant,
);

export default router;
