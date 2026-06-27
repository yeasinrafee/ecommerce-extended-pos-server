import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { supplierReturnController } from './supplier-return.controller.js';

const router = Router();

router.get('/get-all-paginated', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(supplierReturnController.getSupplierReturns));
router.get('/get/:id',           authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(supplierReturnController.getSupplierReturn));

router.post('/create',           authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(supplierReturnController.createSupplierReturn));
router.patch('/update/:id',      authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(supplierReturnController.updateSupplierReturn));
router.patch('/complete/:id',    authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(supplierReturnController.completeSupplierReturn));
router.patch('/cancel/:id',      authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(supplierReturnController.cancelSupplierReturn));

export const supplierReturnRoutes = router;
