import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { productCategoryController } from './product-category.controller.js';
import { createUploadMiddleware } from '../../common/utils/file-upload.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { Role } from '@prisma/client';


const router = Router();

const upload = createUploadMiddleware({ maxFileSizeInMB: 5, maxFileCount: 1 });

router.get('/get-all-paginated', asyncHandler(productCategoryController.getCategories));
router.get('/get-parent-categories-paginated', asyncHandler(productCategoryController.getParentCategories));
router.get('/get-all', asyncHandler(productCategoryController.getAllCategories));
router.get('/get/:id', asyncHandler(productCategoryController.getCategory));
router.post(
	'/create',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	upload.fields([{ name: 'image', maxCount: 1 }]),
	asyncHandler(productCategoryController.createCategory),
);
router.patch(
	'/update/:id',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	upload.fields([{ name: 'image', maxCount: 1 }]),
	asyncHandler(productCategoryController.updateCategory),
);
router.delete(
	'/delete/:id',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(productCategoryController.deleteCategory),
);

export const productCategoryRoutes = router;
