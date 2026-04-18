import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { posController } from './pos.controller.js';

const router = Router();

router.get('/get-products', asyncHandler(posController.getProducts));
router.post('/bill/create', authenticate, asyncHandler(posController.createBill));

export const posRoutes = router;