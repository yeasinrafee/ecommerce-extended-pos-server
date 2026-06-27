import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { Role } from '@prisma/client';
import { goodsReceiveController } from './goods-receive.controller.js';

const router = Router();

router.get('/get-all-paginated', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(goodsReceiveController.getGoodsReceives));
router.get('/get/:id', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(goodsReceiveController.getGoodsReceive));

router.post('/create', authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(goodsReceiveController.createGoodsReceive));

export const goodsReceiveRoutes = router;
