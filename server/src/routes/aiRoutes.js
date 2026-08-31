import { Router } from 'express';
import { body, param, query } from 'express-validator';
import * as ai from '../controllers/aiController.js';
import { adminOnly, optionalAuth, protect, staffOrAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ALLERGENS } from '../constants.js';

const router = Router();

router.get('/status', ai.getStatus);

/* ---- guest-facing; optionalAuth so a signed-in guest's allergies apply ---- */

router.post(
  '/meal-plan',
  optionalAuth,
  validate([
    body('budget').isFloat({ min: 1 }).withMessage('Enter a budget'),
    body('calories').optional({ values: 'falsy' }).isInt({ min: 0, max: 20000 }),
    body('people').optional({ values: 'falsy' }).isInt({ min: 1, max: 20 }),
    body('diet').optional({ values: 'falsy' }).isIn(['any', 'veg', 'vegan', 'non_veg']),
  ]),
  ai.postMealPlan,
);

router.post(
  '/parse-order',
  optionalAuth,
  validate([body('transcript').trim().isLength({ min: 1, max: 500 })]),
  ai.postParseOrder,
);

router.post(
  '/ask',
  optionalAuth,
  validate([body('question').trim().isLength({ min: 1, max: 500 }).withMessage('Ask a question')]),
  ai.postAsk,
);

router.get(
  '/alternatives/:id',
  optionalAuth,
  validate([param('id').isMongoId().withMessage('Invalid dish')]),
  ai.getAlternatives,
);

router.post('/review-cart', optionalAuth, ai.postReviewCart);
router.post(
  '/screen',
  optionalAuth,
  validate([body('allergies').optional().isArray()]),
  ai.postScreen,
);
router.get('/safe-menu', optionalAuth, ai.getSafeMenu);

/* ---- staff ---- */

router.get(
  '/sentiment',
  staffOrAdmin,
  validate([query('limit').optional().isInt({ min: 1, max: 200 })]),
  ai.getSentiment,
);

router.post(
  '/describe',
  adminOnly,
  validate([body('name').trim().isLength({ min: 1, max: 120 })]),
  ai.postDescribe,
);

export default router;
