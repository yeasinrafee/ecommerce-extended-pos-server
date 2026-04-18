import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { zonePolicyController } from './zone-policy.controller.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { Role } from '@prisma/client';

const router = Router();

router.get('/get-all-paginated', asyncHandler(zonePolicyController.getZonePolicies));
router.get('/get-all', asyncHandler(zonePolicyController.getAllZonePolicies));
router.get('/get/:id', asyncHandler(zonePolicyController.getZonePolicyById));
router.post(
	'/create',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(zonePolicyController.createZonePolicy),
);
router.patch(
	'/bulk-update-status',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(zonePolicyController.bulkUpdateStatus),
);
router.patch(
	'/update/:id',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(zonePolicyController.updateZonePolicy),
);
router.delete(
	'/delete/:id',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(zonePolicyController.deleteZonePolicy),
);

export const zonePolicyRoutes = router;
