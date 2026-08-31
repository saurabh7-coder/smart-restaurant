import { Router } from 'express';
import { body, param } from 'express-validator';
import * as category from '../controllers/categoryController.js';
import { adminOnly, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get('/', optionalAuth, category.listCategories);

router.post(
  '/',
  adminOnly,
  validate([
    body('name').trim().notEmpty().withMessage('Category name is required').isLength({ max: 60 }),
    body('description').optional().trim().isLength({ max: 300 }),
    body('displayOrder').optional().isInt().withMessage('Display order must be a number'),
  ]),
  category.createCategory,
);

router.put(
  '/:id',
  adminOnly,
  validate([
    param('id').isMongoId().withMessage('Invalid id'),
    body('name').optional().trim().notEmpty().isLength({ max: 60 }),
  ]),
  category.updateCategory,
);

router.delete(
  '/:id',
  adminOnly,
  validate([param('id').isMongoId().withMessage('Invalid id')]),
  category.deleteCategory,
);

export default router;
