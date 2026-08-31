import { Router } from 'express';
import { body, param } from 'express-validator';
import * as address from '../controllers/addressController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const idRule = param('id').isMongoId().withMessage('Invalid address id');

const writeRules = [
  body('line1').trim().notEmpty().withMessage('House / flat and street is required').isLength({ max: 160 }),
  body('city').trim().notEmpty().withMessage('City is required').isLength({ max: 80 }),
  body('pincode')
    .trim()
    .matches(/^[1-9][0-9]{5}$/)
    .withMessage('Enter a valid 6-digit PIN code'),
  body('label').optional().trim().isLength({ max: 24 }),
  body('line2').optional().trim().isLength({ max: 160 }),
  body('landmark').optional().trim().isLength({ max: 120 }),
  body('directions').optional().trim().isLength({ max: 300 }),
  body('lat').optional({ values: 'null' }).isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
  body('lng').optional({ values: 'null' }).isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
];

router.use(protect);

router.get('/', address.listAddresses);
router.post('/', validate(writeRules), address.addAddress);
router.put('/:id', validate([idRule, ...writeRules]), address.updateAddress);
router.patch('/:id/default', validate([idRule]), address.setDefaultAddress);
router.delete('/:id', validate([idRule]), address.deleteAddress);

export default router;
