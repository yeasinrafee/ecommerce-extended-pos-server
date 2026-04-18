import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { blogCategoryController } from './blog-category.controller.js';
import { createUploadMiddleware } from '../../common/utils/file-upload.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { Role } from '@prisma/client';

const router = Router();

const upload = createUploadMiddleware({ maxFileSizeInMB: 5, maxFileCount: 1 });

router.get('/get-all-paginated', asyncHandler(blogCategoryController.getCategories));
router.get('/get-all', asyncHandler(blogCategoryController.getAllCategories));
router.get('/get/:id', asyncHandler(blogCategoryController.getCategory));
router.post(
	'/create',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	upload.fields([{ name: 'image', maxCount: 1 }]),
	asyncHandler(blogCategoryController.createCategory),
);
router.patch(
	'/update/:id',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	upload.fields([{ name: 'image', maxCount: 1 }]),
	asyncHandler(blogCategoryController.updateCategory),
);
router.delete(
	'/delete/:id',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(blogCategoryController.deleteCategory),
);

export const blogCategoryRoutes = router;
