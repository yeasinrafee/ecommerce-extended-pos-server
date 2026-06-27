import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { stockAdjustmentController } from './stock-adjustment.controller.js';

const router = Router();

router.get('/get-all-paginated', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(stockAdjustmentController.getAdjustments));
router.get('/get/:id',           authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(stockAdjustmentController.getAdjustment));

router.post('/create',           authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(stockAdjustmentController.createStockAdjustment));
router.patch('/update/:id',      authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(stockAdjustmentController.updateStockAdjustment));
router.patch('/complete/:id',    authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(stockAdjustmentController.completeStockAdjustment));
router.patch('/cancel/:id',      authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(stockAdjustmentController.cancelStockAdjustment));

export const stockAdjustmentRoutes = router;
