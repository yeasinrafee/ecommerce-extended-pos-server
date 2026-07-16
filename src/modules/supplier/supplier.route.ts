import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { supplierController } from './supplier.controller.js';
import { createUploadMiddleware } from '../../common/utils/file-upload.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { Role } from '@prisma/client';

const router = Router();
const upload = createUploadMiddleware({ maxFileSizeInMB: 5, maxFileCount: 1 });

router.get('/dues', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(supplierController.getDueSuppliers));
router.get('/get-all-paginated', asyncHandler(supplierController.getSuppliers));
router.get('/get-all', asyncHandler(supplierController.getAllSuppliers));
router.get('/get/:id', asyncHandler(supplierController.getSupplier));
router.get('/:id/purchases', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(supplierController.getSupplierPurchases));
router.get('/:id/payments', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(supplierController.getSupplierPayments));
router.post('/:id/pay', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(supplierController.createSupplierPayment));

router.post('/create', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), upload.fields([{ name: 'image', maxCount: 1 }]), asyncHandler(supplierController.createSupplier));
router.patch('/update/:id', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), upload.fields([{ name: 'image', maxCount: 1 }]), asyncHandler(supplierController.updateSupplier));
router.patch('/update-status', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(supplierController.bulkUpdateStatus));
router.delete('/delete/:id', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(supplierController.deleteSupplier));

export const supplierRoutes = router;