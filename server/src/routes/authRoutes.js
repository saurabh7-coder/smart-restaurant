import { Router } from 'express';
import { body } from 'express-validator';
import * as auth from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = Router();

const passwordRule = body('password')
  .isLength({ min: 8 })
  .withMessage('Password must be at least 8 characters')
  .matches(/[A-Za-z]/)
  .withMessage('Password must contain a letter')
  .matches(/\d/)
  .withMessage('Password must contain a number');

router.post(
  '/register',
  authLimiter,
  validate([
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 80 }),
    body('email').trim().isEmail().withMessage('Enter a valid email').normalizeEmail(),
    body('allergies').optional().isArray().withMessage('Allergies must be a list'),
    body('phone')
      .trim()
      .matches(/^[+\d][\d\s-]{6,19}$/)
      .withMessage('Enter a valid phone number'),
    passwordRule,
  ]),
  auth.register,
);

router.post(
  '/login',
  authLimiter,
  validate([
    body('email').trim().isEmail().withMessage('Enter a valid email').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ]),
  auth.login,
);

router.post('/logout', auth.logout);
router.get('/me', protect, auth.me);

router.put(
  '/profile',
  protect,
  validate([
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty').isLength({ max: 80 }),
    body('phone')
      .optional()
      .trim()
      .matches(/^[+\d][\d\s-]{6,19}$/)
      .withMessage('Enter a valid phone number'),
    body('allergies').optional().isArray().withMessage('Allergies must be a list'),
  ]),
  auth.updateProfile,
);

router.put(
  '/password',
  protect,
  authLimiter,
  validate([
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters')
      .matches(/[A-Za-z]/)
      .withMessage('New password must contain a letter')
      .matches(/\d/)
      .withMessage('New password must contain a number'),
  ]),
  auth.changePassword,
);

export default router;
