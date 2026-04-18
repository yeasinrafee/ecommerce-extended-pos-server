import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { cartController } from './cart.controller.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { Role } from '@prisma/client';

const router = Router();

router.use(authenticate, authorizeRoles(Role.CUSTOMER));

router.get('/get-all', asyncHandler(cartController.getCartItems));
router.post('/add', asyncHandler(cartController.addToCart));
router.patch('/update-batch', asyncHandler(cartController.updateCartItems));
router.delete('/remove-batch', asyncHandler(cartController.removeItemsFromCart));

export const cartRoutes = router;
