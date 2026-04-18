import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { productTagController } from './product-tag.controller.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { Role } from '@prisma/client';

const router = Router();

router.get('/get-all-paginated', asyncHandler(productTagController.getTags));
router.get('/get-all', asyncHandler(productTagController.getAllTags));
router.get('/get/:id', asyncHandler(productTagController.getTag));
router.post(
	'/create',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(productTagController.createTag),
);
router.patch(
	'/update/:id',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(productTagController.updateTag),
);
router.delete(
	'/delete/:id',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(productTagController.deleteTag),
);

export const productTagRoutes = router;
