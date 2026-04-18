import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { createUploadMiddleware } from '../../common/utils/file-upload.js';
import { productController } from './product.controller.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { Role } from '@prisma/client';

const router = Router();

const upload = createUploadMiddleware({ maxFileSizeInMB: 5, maxFileCount: 11 });

router.post(
	'/create',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	upload.fields([
		{ name: 'mainImage', maxCount: 1 },
		{ name: 'galleryImages', maxCount: 10 }
	]),
	asyncHandler(productController.createProduct)
);

router.patch(
	'/:id',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	upload.fields([
		{ name: 'mainImage', maxCount: 1 },
		{ name: 'galleryImages', maxCount: 10 }
	]),
	asyncHandler(productController.updateProduct)
);

router.patch(
	'/bulk/fields',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(productController.bulkPatchProducts),
);
router.patch(
	'/:id/fields',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(productController.patchProduct),
);

router.get('/get-all', asyncHandler(productController.getProducts));
router.get('/all', asyncHandler(productController.getAllProducts));
router.get('/hot-deals', asyncHandler(productController.getHotDeals));
router.get('/new-arrivals', asyncHandler(productController.getNewArrivals));
router.get('/offer-products', asyncHandler(productController.getOfferProducts));
router.get('/get-limited', asyncHandler(productController.getProductsLimited));
router.get('/get/:slug', asyncHandler(productController.getProductBySlug));
router.get('/:id', asyncHandler(productController.getProductById));
router.delete(
	'/:id',
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(productController.deleteProduct),
);

export const productRoutes = router;
