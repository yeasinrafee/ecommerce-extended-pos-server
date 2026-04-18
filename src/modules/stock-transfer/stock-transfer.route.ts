import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { stockTransferController } from './stock-transfer.controller.js';

const router = Router();

router.get('/get-all-paginated', asyncHandler(stockTransferController.getTransfers));
router.get('/get/:id', asyncHandler(stockTransferController.getTransfer));
router.get('/search-products', asyncHandler(stockTransferController.searchProducts));
router.get('/generate-invoice-number', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(stockTransferController.generateInvoiceNumber));
router.post('/create', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(stockTransferController.createTransfer));
router.patch('/bulk/fields', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(stockTransferController.bulkPatchTransfers));
router.patch('/:id/fields', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(stockTransferController.patchTransfer));
router.delete('/delete/:id', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(stockTransferController.deleteTransfer));

export const stockTransferRoutes = router;