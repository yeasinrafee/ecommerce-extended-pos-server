import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { brandController } from './brand.controller.js';
import { createUploadMiddleware } from '../../common/utils/file-upload.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { Role } from '@prisma/client';


const router = Router();

const upload = createUploadMiddleware({ maxFileSizeInMB: 5, maxFileCount: 1 });

router.get('/get-all-paginated', asyncHandler(brandController.getBrands));
router.get('/get-all', asyncHandler(brandController.getAllBrands));
router.get('/get/:id', asyncHandler(brandController.getBrand));
router.post(
	'/create',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	upload.fields([{ name: 'image', maxCount: 1 }]),
	asyncHandler(brandController.createBrand),
);
router.patch(
	'/update/:id',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	upload.fields([{ name: 'image', maxCount: 1 }]),
	asyncHandler(brandController.updateBrand),
);
router.delete(
	'/delete/:id',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(brandController.deleteBrand),
);

export const brandRoutes = router;

