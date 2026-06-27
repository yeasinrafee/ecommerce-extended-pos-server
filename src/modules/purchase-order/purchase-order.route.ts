import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { Role } from '@prisma/client';
import { purchaseOrderController } from './purchase-order.controller.js';

const router = Router();

router.get('/get-all-paginated', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(purchaseOrderController.getPurchaseOrders));
router.get('/get/:id', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(purchaseOrderController.getPurchaseOrder));

router.post('/create', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(purchaseOrderController.createPurchaseOrder));
router.patch('/update/:id', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(purchaseOrderController.updatePurchaseOrder));
router.patch('/approve/:id', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(purchaseOrderController.approvePurchaseOrder));
router.patch('/cancel/:id', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(purchaseOrderController.cancelPurchaseOrder));

export const purchaseOrderRoutes = router;
