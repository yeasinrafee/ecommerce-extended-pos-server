import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { attributeController } from './attribute.controller.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { Role } from '@prisma/client';

const router = Router();

router.get('/get-all-paginated', asyncHandler(attributeController.getAttributes));
router.get('/get-all', asyncHandler(attributeController.getAllAttributes));
router.get('/get/:id', asyncHandler(attributeController.getAttribute));
router.post('/create', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(attributeController.createAttribute));
router.patch('/update/:id', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(attributeController.updateAttribute));
router.delete('/delete/:id', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(attributeController.deleteAttribute));

export const attributeRoutes = router;
