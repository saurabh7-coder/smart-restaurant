import { Router } from 'express';
import { body, param } from 'express-validator';
import * as user from '../controllers/userController.js';
import { adminOnly, staffOrAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ROLE_VALUES } from '../constants.js';

const router = Router();

const idRule = param('id').isMongoId().withMessage('Invalid id');

// Staff need the customer list to look up a booking by name or phone.
router.get('/', staffOrAdmin, user.listUsers);
router.get('/:id', staffOrAdmin, validate([idRule]), user.getUser);

router.post(
  '/',
  adminOnly,
  validate([
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').trim().isEmail().withMessage('Enter a valid email').normalizeEmail(),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('role').isIn(ROLE_VALUES).withMessage('Invalid role'),
  ]),
  user.createStaffUser,
);

router.patch(
  '/:id/role',
  adminOnly,
  validate([idRule, body('role').isIn(ROLE_VALUES).withMessage('Invalid role')]),
  user.updateUserRole,
);

router.patch(
  '/:id/blocked',
  adminOnly,
  validate([idRule, body('isBlocked').isBoolean().withMessage('isBlocked must be true or false')]),
  user.setUserBlocked,
);

router.delete('/:id', adminOnly, validate([idRule]), user.deleteUser);

export default router;
