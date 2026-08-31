import { Router } from 'express';
import { body, param } from 'express-validator';
import * as menu from '../controllers/menuController.js';
import { adminOnly, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { handleImageUpload } from '../middleware/upload.js';
import { FOOD_TYPES } from '../constants.js';

const router = Router();

const idRule = () => param('id').isMongoId().withMessage('Invalid id');

/**
 * Built as a factory, not a shared array: express-validator chains are mutable
 * objects, so reusing one array and calling `.optional()` on it for PUT would
 * also make the POST rules optional.
 */
function writeRules({ optional }) {
  const maybe = (chain) => (optional ? chain.optional() : chain);
  return [
    maybe(body('name').trim().notEmpty().withMessage('Dish name is required').isLength({ max: 120 })),
    maybe(body('category').isMongoId().withMessage('Choose a category')),
    maybe(body('price').isFloat({ min: 0 }).withMessage('Price must be 0 or more')),
    maybe(
      body('foodType')
        .isIn(FOOD_TYPES)
        .withMessage(`Food type must be one of: ${FOOD_TYPES.join(', ')}`),
    ),
    body('description').optional().trim().isLength({ max: 1000 }),
    body('spiceLevel')
      .optional({ values: 'falsy' })
      .isInt({ min: 0, max: 5 })
      .withMessage('Spice level is 0 to 5'),
    body('calories')
      .optional({ values: 'falsy' })
      .isInt({ min: 0 })
      .withMessage('Calories must be a positive number'),
  ];
}

// Public reads. optionalAuth lets staff see unavailable items through the same route.
router.get('/', optionalAuth, menu.listMenuItems);
// Before "/:id", or Express would treat "recommendations" as a dish id.
router.get('/recommendations', optionalAuth, menu.getRecommendations);
router.get('/:id', validate([idRule()]), menu.getMenuItem);

// Admin writes. handleImageUpload runs first so multipart fields reach the validators.
router.post(
  '/',
  adminOnly,
  handleImageUpload,
  validate(writeRules({ optional: false })),
  menu.createMenuItem,
);

router.put(
  '/:id',
  adminOnly,
  handleImageUpload,
  validate([idRule(), ...writeRules({ optional: true })]),
  menu.updateMenuItem,
);

router.delete('/:id', adminOnly, validate([idRule()]), menu.deleteMenuItem);

export default router;
