import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { zoneController } from './zone.controller.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { Role } from '@prisma/client';

const router = Router();

router.get('/get-all-paginated', asyncHandler(zoneController.getZones));
router.get('/get-available', asyncHandler(zoneController.getAvailableZones));
router.get('/get-all', asyncHandler(zoneController.getAllZones));
router.get('/get/:id', asyncHandler(zoneController.getZone));
router.post(
	'/create',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(zoneController.createZone),
);
router.patch(
	'/update/:id',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(zoneController.updateZone),
);
router.delete(
	'/delete/:id',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(zoneController.deleteZone),
);

export const zoneRoutes = router;
