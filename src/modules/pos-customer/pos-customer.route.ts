import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  authenticate,
  authorizeRoles,
} from '../../common/middlewares/auth.middleware.js';
import { posCustomerController } from './pos-customer.controller.js';

const router = Router();

// Get all pos customers (paginated)
router.get(
  '/',
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(posCustomerController.getCustomers),
);

// Get single pos customer by id
router.get(
  '/:id',
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(posCustomerController.getCustomer),
);

// Get orders for a specific pos customer
router.get(
  '/:id/orders',
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(posCustomerController.getCustomerOrders),
);

// Create a new pos customer
router.post(
  '/',
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(posCustomerController.createCustomer),
);

// Update a pos customer (name only)
router.patch(
  '/:id',
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(posCustomerController.updateCustomer),
);

// Delete a pos customer (soft delete)
router.delete(
  '/:id',
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(posCustomerController.deleteCustomer),
);

export const posCustomerRoutes = router;
