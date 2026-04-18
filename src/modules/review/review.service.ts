import { prisma } from '../../config/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import {
	CreateCommentInput,
	UpdateCommentInput,
	CreateProductReviewInput,
	UpdateProductReviewInput
} from './review.types.js';

const recalculateProductRatings = async (productId: string, tx: any) => {
	const reviews = await tx.productReview.findMany({
		where: {
			productId,
			parentId: null
		},
		select: {
			rating: true
		}
	});

	const ratingsWithValues = reviews.filter((r: { rating: number | null }) => r.rating !== null && r.rating !== undefined);
	const totalRatingsCount = ratingsWithValues.length;
	const totalReviewsCount = reviews.length;
	
	let avgRating = 0;
	if (totalRatingsCount > 0) {
		const sum = ratingsWithValues.reduce((acc: number, curr: { rating: number }) => acc + curr.rating, 0);
		avgRating = Number((sum / totalRatingsCount).toFixed(2));
	}

	await tx.product.update({
		where: { id: productId },
		data: {
			avgRating,
			totalRatings: totalRatingsCount,
			totalReviews: totalReviewsCount
		}
	});
};

const createComment = async (userId: string, payload: CreateCommentInput) => {
	const blog = await prisma.blog.findUnique({
		where: { id: payload.blogId }
	});

	if (!blog) {
		throw new AppError(404, 'Blog not found', [{ code: 'BLOG_NOT_FOUND', message: 'The blog does not exist' }]);
	}

	if (payload.parentId) {
		const parent = await prisma.comment.findUnique({
			where: { id: payload.parentId }
		});
		if (!parent) {
			throw new AppError(404, 'Parent comment not found', [{ code: 'PARENT_NOT_FOUND', message: 'The comment you are replying to does not exist' }]);
		}
	}

	return prisma.comment.create({
		data: {
			...payload,
			userId
		},
		include: {
			user: {
				select: {
					id: true,
					email: true
				}
			}
		}
	});
};

const updateComment = async (userId: string, commentId: string, payload: UpdateCommentInput) => {
	const comment = await prisma.comment.findUnique({
		where: { id: commentId }
	});

	if (!comment) {
		throw new AppError(404, 'Comment not found', [{ code: 'COMMENT_NOT_FOUND', message: 'Comment does not exist' }]);
	}

	if (comment.userId !== userId) {
		throw new AppError(403, 'Unauthorized', [{ code: 'UNAUTHORIZED', message: 'You can only update your own comments' }]);
	}

	return prisma.comment.update({
		where: { id: commentId },
		data: payload
	});
};

const deleteComment = async (userId: string, commentId: string) => {
	const comment = await prisma.comment.findUnique({
		where: { id: commentId }
	});

	if (!comment) {
		throw new AppError(404, 'Comment not found', [{ code: 'COMMENT_NOT_FOUND', message: 'Comment does not exist' }]);
	}

	if (comment.userId !== userId) {
		throw new AppError(403, 'Unauthorized', [{ code: 'UNAUTHORIZED', message: 'You can only delete your own comments' }]);
	}

	return prisma.comment.delete({
		where: { id: commentId }
	});
};

const getBlogComments = async (blogId: string) => {
	return prisma.comment.findMany({
		where: { blogId, parentId: null },
		include: {
			user: {
				select: {
					id: true,
					email: true
				}
			},
			replies: {
				include: {
					user: {
						select: {
							id: true,
							email: true
						}
					}
				}
			}
		},
		orderBy: { createdAt: 'desc' }
	});
};

const createProductReview = async (userId: string, payload: CreateProductReviewInput) => {
	const product = await prisma.product.findUnique({
		where: { id: payload.productId }
	});

	if (!product) {
		throw new AppError(404, 'Product not found', [{ code: 'PRODUCT_NOT_FOUND', message: 'The product does not exist' }]);
	}

	if (payload.parentId) {
		const parent = await prisma.productReview.findUnique({
			where: { id: payload.parentId }
		});
		if (!parent) {
			throw new AppError(404, 'Parent review not found', [{ code: 'PARENT_NOT_FOUND', message: 'The review you are replying to does not exist' }]);
		}
	}

	return prisma.$transaction(async (tx) => {
		const review = await tx.productReview.create({
			data: {
				...payload,
				userId
			},
			include: {
				user: {
					select: {
						id: true,
						email: true
					}
				}
			}
		});

		await recalculateProductRatings(payload.productId, tx);

		return review;
	});
};

const updateProductReview = async (userId: string, reviewId: string, payload: UpdateProductReviewInput) => {
	const review = await prisma.productReview.findUnique({
		where: { id: reviewId }
	});

	if (!review) {
		throw new AppError(404, 'Review not found', [{ code: 'REVIEW_NOT_FOUND', message: 'Review does not exist' }]);
	}

	if (review.userId !== userId) {
		throw new AppError(403, 'Unauthorized', [{ code: 'UNAUTHORIZED', message: 'You can only update your own reviews' }]);
	}

	return prisma.$transaction(async (tx) => {
		const updatedReview = await tx.productReview.update({
			where: { id: reviewId },
			data: payload
		});

		await recalculateProductRatings(review.productId, tx);

		return updatedReview;
	});
};

const deleteProductReview = async (userId: string, reviewId: string) => {
	const review = await prisma.productReview.findUnique({
		where: { id: reviewId }
	});

	if (!review) {
		throw new AppError(404, 'Review not found', [{ code: 'REVIEW_NOT_FOUND', message: 'Review does not exist' }]);
	}

	if (review.userId !== userId) {
		throw new AppError(403, 'Unauthorized', [{ code: 'UNAUTHORIZED', message: 'You can only delete your own reviews' }]);
	}

	const productId = review.productId;

	return prisma.$transaction(async (tx) => {
		await tx.productReview.delete({
			where: { id: reviewId }
		});

		await recalculateProductRatings(productId, tx);
	});
};

const getProductReviews = async (productId: string) => {
	return prisma.productReview.findMany({
		where: { productId, parentId: null },
		include: {
			user: {
				select: {
					id: true,
					email: true
				}
			},
			replies: {
				include: {
					user: {
						select: {
							id: true,
							email: true
						}
					}
				}
			}
		},
		orderBy: { createdAt: 'desc' }
	});
};

export const reviewService = {
	createComment,
	updateComment,
	deleteComment,
	getBlogComments,
	createProductReview,
	updateProductReview,
	deleteProductReview,
	getProductReviews
};
