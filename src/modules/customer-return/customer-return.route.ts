import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { customerReturnController } from './customer-return.controller.js';

const router = Router();

router.get('/get-all-paginated', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(customerReturnController.getCustomerReturns));
router.get('/get/:id',           authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(customerReturnController.getCustomerReturn));

router.post('/create',           authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(customerReturnController.createCustomerReturn));
router.patch('/update/:id',      authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(customerReturnController.updateCustomerReturn));
router.patch('/refund/:id',      authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(customerReturnController.refundCustomerReturn));
router.patch('/cancel/:id',      authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(customerReturnController.cancelCustomerReturn));

export const customerReturnRoutes = router;
