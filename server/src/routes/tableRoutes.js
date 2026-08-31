import { Router } from 'express';
import { body, param } from 'express-validator';
import * as table from '../controllers/tableController.js';
import { adminOnly, staffOrAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { TABLE_LOCATIONS, TABLE_STATUS_VALUES } from '../constants.js';

const router = Router();

const idRule = param('id').isMongoId().withMessage('Invalid id');

// Public: the reservation page shows the floor plan before login.
router.get('/', table.listTables);

router.post(
  '/',
  adminOnly,
  validate([
    body('tableNumber').trim().notEmpty().withMessage('Table number is required').isLength({ max: 10 }),
    body('capacity').isInt({ min: 1, max: 30 }).withMessage('Capacity must be between 1 and 30'),
    body('location').optional().isIn(TABLE_LOCATIONS).withMessage('Invalid location'),
    body('status').optional().isIn(TABLE_STATUS_VALUES).withMessage('Invalid status'),
  ]),
  table.createTable,
);

router.put(
  '/:id',
  adminOnly,
  validate([
    idRule,
    body('capacity').optional().isInt({ min: 1, max: 30 }).withMessage('Capacity must be between 1 and 30'),
    body('location').optional().isIn(TABLE_LOCATIONS).withMessage('Invalid location'),
    body('status').optional().isIn(TABLE_STATUS_VALUES).withMessage('Invalid status'),
  ]),
  table.updateTable,
);

// Staff need to flip floor status during service without full admin rights.
router.patch(
  '/:id/status',
  staffOrAdmin,
  validate([idRule, body('status').isIn(TABLE_STATUS_VALUES).withMessage('Invalid status')]),
  table.updateTableStatus,
);

router.delete('/:id', adminOnly, validate([idRule]), table.deleteTable);

export default router;
