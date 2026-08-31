import { Router } from 'express';
import { body, param, query } from 'express-validator';
import * as reservation from '../controllers/reservationController.js';
import { protect, staffOrAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { reservationLimiter } from '../middleware/rateLimit.js';
import { RESERVATION_STATUS_VALUES, TABLE_LOCATIONS } from '../constants.js';

const router = Router();

const idRule = param('id').isMongoId().withMessage('Invalid reservation id');

/* Static paths must be declared before "/:id" or Express would treat
   "availability" and "today" as reservation ids. */

router.get(
  '/availability',
  validate([
    query('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date must be YYYY-MM-DD'),
    query('guests').optional().isInt({ min: 1, max: 30 }).withMessage('Guests must be 1-30'),
    query('time').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Time must be HH:MM'),
  ]),
  reservation.getAvailability,
);

router.get('/today', staffOrAdmin, reservation.getTodayBoard);
router.get('/mine', protect, reservation.getMyReservations);

router.get('/', staffOrAdmin, reservation.listReservations);

router.post(
  '/',
  protect,
  reservationLimiter,
  validate([
    body('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Choose a date (YYYY-MM-DD)'),
    body('time').matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Choose a seating time'),
    body('guests').isInt({ min: 1, max: 30 }).withMessage('Guests must be between 1 and 30'),
    body('table').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid table'),
    body('name').optional().trim().isLength({ min: 1, max: 80 }).withMessage('Name is required'),
    body('phone')
      .optional()
      .trim()
      .matches(/^[+\d][\d\s-]{6,19}$/)
      .withMessage('Enter a valid phone number'),
    body('email').optional().trim().isEmail().withMessage('Enter a valid email'),
    body('specialRequest').optional().trim().isLength({ max: 500 }),
    body('preferredLocation')
      .optional({ values: 'falsy' })
      .isIn(TABLE_LOCATIONS)
      .withMessage('Invalid seating preference'),
    body('offerCode').optional({ values: 'falsy' }).trim().isLength({ max: 24 }),
  ]),
  reservation.createReservation,
);

router.get('/:id', protect, validate([idRule]), reservation.getReservation);

router.put(
  '/:id',
  protect,
  validate([
    idRule,
    body('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date must be YYYY-MM-DD'),
    body('time').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Time must be HH:MM'),
    body('guests').optional().isInt({ min: 1, max: 30 }).withMessage('Guests must be between 1 and 30'),
    body('table').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid table'),
  ]),
  reservation.updateReservation,
);

router.patch(
  '/:id/status',
  staffOrAdmin,
  validate([
    idRule,
    body('status').isIn(RESERVATION_STATUS_VALUES).withMessage('Invalid status'),
    body('note').optional().trim().isLength({ max: 200 }),
  ]),
  reservation.updateReservationStatus,
);

router.delete('/:id', protect, validate([idRule]), reservation.cancelReservation);

export default router;
