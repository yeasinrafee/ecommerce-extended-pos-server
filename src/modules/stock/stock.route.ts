import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { stockController } from './stock.controller.js';

const router = Router();

router.get('/get-all-paginated', asyncHandler(stockController.getStocks));
router.get('/get/:id', asyncHandler(stockController.getStock));
router.get('/generate-invoice-number', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(stockController.generateInvoiceNumber));
router.post('/create', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(stockController.createStock));
router.patch('/bulk/fields', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(stockController.bulkPatchStocks));
router.patch('/update/:id', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(stockController.updateStock));
router.delete('/delete/:id', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(stockController.deleteStock));

export const stockRoutes = router;
