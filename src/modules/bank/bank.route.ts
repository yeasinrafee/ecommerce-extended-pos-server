import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { bankController } from './bank.controller.js';

const router = Router();

router.get('/get-all', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(bankController.getAllBanks));
router.post('/create', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(bankController.createBank));
router.patch('/update/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(bankController.updateBank));
router.delete('/delete/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(bankController.deleteBank));

export const bankRoutes = router;