import { Router } from 'express';
import * as loyalty from '../controllers/loyaltyController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.get('/config', loyalty.getLoyaltyConfig);
router.get('/me', protect, loyalty.getMyLoyalty);

export default router;
