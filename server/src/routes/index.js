import { Router } from 'express';
import authRoutes from './authRoutes.js';
import menuRoutes from './menuRoutes.js';
import categoryRoutes from './categoryRoutes.js';
import tableRoutes from './tableRoutes.js';
import reservationRoutes from './reservationRoutes.js';
import reviewRoutes from './reviewRoutes.js';
import offerRoutes from './offerRoutes.js';
import restaurantRoutes from './restaurantRoutes.js';
import userRoutes from './userRoutes.js';
import statsRoutes from './statsRoutes.js';
import orderRoutes from './orderRoutes.js';
import paymentRoutes from './paymentRoutes.js';
import addressRoutes from './addressRoutes.js';
import loyaltyRoutes from './loyaltyRoutes.js';
import aiRoutes from './aiRoutes.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, status: 'ok', uptime: process.uptime() });
});

router.use('/auth', authRoutes);
router.use('/menu', menuRoutes);
router.use('/categories', categoryRoutes);
router.use('/tables', tableRoutes);
router.use('/reservations', reservationRoutes);
router.use('/reviews', reviewRoutes);
router.use('/offers', offerRoutes);
router.use('/restaurant', restaurantRoutes);
router.use('/users', userRoutes);
router.use('/stats', statsRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/addresses', addressRoutes);
router.use('/loyalty', loyaltyRoutes);
router.use('/ai', aiRoutes);

export default router;
