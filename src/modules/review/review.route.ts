import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { reviewController } from './review.controller.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';

const router = Router();

router.post(
	'/blog/comment',
	authenticate,
	authorizeRoles(Role.CUSTOMER),
	asyncHandler(reviewController.createComment)
);

router.patch(
	'/blog/comment/:commentId',
	authenticate,
	authorizeRoles(Role.CUSTOMER),
	asyncHandler(reviewController.updateComment)
);

router.delete(
	'/blog/comment/:commentId',
	authenticate,
	authorizeRoles(Role.CUSTOMER),
	asyncHandler(reviewController.deleteComment)
);

router.get(
	'/blog/:blogId/comments',
	asyncHandler(reviewController.getBlogComments)
);

router.post(
	'/product/review',
	authenticate,
	authorizeRoles(Role.CUSTOMER),
	asyncHandler(reviewController.createProductReview)
);

router.patch(
	'/product/review/:reviewId',
	authenticate,
	authorizeRoles(Role.CUSTOMER),
	asyncHandler(reviewController.updateProductReview)
);

router.delete(
	'/product/review/:reviewId',
	authenticate,
	authorizeRoles(Role.CUSTOMER),
	asyncHandler(reviewController.deleteProductReview)
);

router.get(
	'/product/:productId/reviews',
	asyncHandler(reviewController.getProductReviews)
);

export const reviewRoutes = router;
