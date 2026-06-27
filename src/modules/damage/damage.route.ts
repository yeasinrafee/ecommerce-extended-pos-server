import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { damageController } from './damage.controller.js';

const router = Router();

router.get('/get-all-paginated', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(damageController.getDamages));
router.get('/get/:id',           authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(damageController.getDamage));

router.post('/create',           authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(damageController.createDamage));
router.patch('/update/:id',      authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(damageController.updateDamage));
router.patch('/complete/:id',    authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(damageController.completeDamage));
router.patch('/cancel/:id',      authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(damageController.cancelDamage));

export const damageRoutes = router;
