import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { shippingController } from './shipping.controller.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { Role } from '@prisma/client';

const router = Router();

router.post(
	'/create',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(shippingController.createShipping),
);
router.patch(
	'/update/:id',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(shippingController.updateShipping),
);
router.delete(
	'/reset',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(shippingController.resetShipping),
);
router.get('/get', asyncHandler(shippingController.getShipping));
router.get('/get/:id', asyncHandler(shippingController.getShippingById));
router.delete(
	'/delete/:id',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(shippingController.deleteShipping),
);

export const shippingRoutes = router;
