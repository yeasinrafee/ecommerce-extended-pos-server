import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { posController } from './pos.controller.js';

const router = Router();

router.get('/get-products', asyncHandler(posController.getProducts));
router.post('/bill/create', authenticate, asyncHandler(posController.createBill));
router.patch('/bill/:orderId/update', authenticate, asyncHandler(posController.updateBill));
router.delete('/bill/:orderId/delete', authenticate, asyncHandler(posController.deleteBill));

export const posRoutes = router;