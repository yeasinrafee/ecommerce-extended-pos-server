import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { blogController } from './blog.controller.js';
import { createUploadMiddleware } from '../../common/utils/file-upload.js';
import { Role } from '@prisma/client';
import {
	authenticate,
	authorizeRoles,
} from '../../common/middlewares/auth.middleware.js';

const router = Router();

const upload = createUploadMiddleware({ maxFileSizeInMB: 5, maxFileCount: 1 });

router.get('/get-all-paginated', asyncHandler(blogController.getBlogs));
router.get('/get-all', asyncHandler(blogController.getAllBlogs));
router.get('/recent', asyncHandler(blogController.getRecentBlogs));
router.get('/get/:slug', asyncHandler(blogController.getBlogBySlug));
router.get('/get-by-id/:id', asyncHandler(blogController.getBlog));
router.post(
	'/create',
	authenticate,
	authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN),
	upload.fields([{ name: 'image', maxCount: 1 }]),
	asyncHandler(blogController.createBlog),
);
router.patch(
	'/update/:id',
	authenticate,
	authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN),
	upload.fields([{ name: 'image', maxCount: 1 }]),
	asyncHandler(blogController.updateBlog),
);
router.delete(
	'/delete/:id',
	authenticate,
	authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN),
	asyncHandler(blogController.deleteBlog),
);

export const blogRoutes = router;
