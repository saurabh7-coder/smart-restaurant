import { Router } from 'express';
import * as stats from '../controllers/statsController.js';
import { adminOnly, staffOrAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/dashboard', staffOrAdmin, stats.getDashboard);
router.get('/occupancy', staffOrAdmin, stats.getOccupancy);
router.get('/reports', adminOnly, stats.getReports);

export default router;
