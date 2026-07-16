import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { stockTransferController } from './stock-transfer.controller.js';

const router = Router();

router.get('/get-all-paginated', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(stockTransferController.getTransfers));
router.get('/get/:id', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(stockTransferController.getTransfer));

router.post('/create', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(stockTransferController.createTransfer));
router.patch('/update/:id', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(stockTransferController.updateTransfer));
router.patch('/ship/:id', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(stockTransferController.shipTransfer));
router.patch('/receive/:id', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(stockTransferController.receiveTransfer));
router.patch('/cancel/:id', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(stockTransferController.cancelTransfer));

export const stockTransferRoutes = router;
