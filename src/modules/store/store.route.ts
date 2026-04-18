import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { storeController } from './store.controller.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { Role } from '@prisma/client';

const router = Router();

router.get('/get-all-paginated', asyncHandler(storeController.getStores));
router.get('/get-all', asyncHandler(storeController.getAllStores));
router.get('/get/:id', asyncHandler(storeController.getStore));
router.post('/create', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(storeController.createStore));
router.patch('/update/:id', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(storeController.updateStore));
router.patch('/update-status', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(storeController.bulkUpdateStatus));
router.delete('/delete/:id', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(storeController.deleteStore));

export const storeRoutes = router;