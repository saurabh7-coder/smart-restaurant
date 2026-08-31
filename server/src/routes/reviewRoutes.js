import { Router } from 'express';
import { body, param } from 'express-validator';
import * as review from '../controllers/reviewController.js';
import { optionalAuth, protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const idRule = param('id').isMongoId().withMessage('Invalid id');

router.get('/', optionalAuth, review.listReviews);
router.get('/mine', protect, review.getMyReviews);
router.get('/pending', protect, review.getPendingReviews);

router.post(
  '/',
  protect,
  validate([
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('menuItem').optional({ values: 'null' }).isMongoId().withMessage('Invalid dish'),
    body('comment').optional().trim().isLength({ max: 800 }),
  ]),
  review.createReview,
);

router.put(
  '/:id',
  protect,
  validate([
    idRule,
    body('rating').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('comment').optional().trim().isLength({ max: 800 }),
  ]),
  review.updateReview,
);

router.delete('/:id', protect, validate([idRule]), review.deleteReview);

export default router;
