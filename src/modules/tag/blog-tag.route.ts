import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { blogTagController } from './blog-tag.controller.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { Role } from '@prisma/client';

const router = Router();

router.get('/get-all-paginated', asyncHandler(blogTagController.getTags));
router.get('/get-all', asyncHandler(blogTagController.getAllTags));
router.get('/get/:id', asyncHandler(blogTagController.getTag));
router.post(
	'/create',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(blogTagController.createTag),
);
router.patch(
	'/update/:id',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(blogTagController.updateTag),
);
router.delete(
	'/delete/:id',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(blogTagController.deleteTag),
);

export const blogTagRoutes = router;
