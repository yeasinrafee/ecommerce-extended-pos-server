import { Request, Response } from 'express';
import { sendResponse } from '../../common/utils/send-response.js';
import { reviewService } from './review.service.js';
import { 
	validateCreateCommentPayload,
	validateUpdateCommentPayload,
	validateCreateProductReviewPayload,
	validateUpdateProductReviewPayload
} from './review.types.js';

const createComment = async (req: Request, res: Response) => {
	const userId = req.user!.id;
	const payload = validateCreateCommentPayload(req.body);
	const comment = await reviewService.createComment(userId, payload);

	sendResponse({
		res,
		statusCode: 201,
		success: true,
		message: 'Comment added successfully',
		data: comment,
		errors: [],
		meta: { timestamp: new Date().toISOString() }
	});
};

const updateComment = async (req: Request, res: Response) => {
	const userId = req.user!.id;
	const commentId = String(req.params.commentId);
	const payload = validateUpdateCommentPayload(req.body);
	const comment = await reviewService.updateComment(userId, commentId, payload);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Comment updated successfully',
		data: comment,
		errors: [],
		meta: { timestamp: new Date().toISOString() }
	});
};

const deleteComment = async (req: Request, res: Response) => {
	const userId = req.user!.id;
	const commentId = String(req.params.commentId);
	await reviewService.deleteComment(userId, commentId);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Comment deleted successfully',
		data: null,
		errors: [],
		meta: { timestamp: new Date().toISOString() }
	});
};

const getBlogComments = async (req: Request, res: Response) => {
	const blogId = String(req.params.blogId);
	const comments = await reviewService.getBlogComments(blogId);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Comments fetched successfully',
		data: comments,
		errors: [],
		meta: { timestamp: new Date().toISOString() }
	});
};

const createProductReview = async (req: Request, res: Response) => {
	const userId = req.user!.id;
	const payload = validateCreateProductReviewPayload(req.body);
	const review = await reviewService.createProductReview(userId, payload);

	sendResponse({
		res,
		statusCode: 201,
		success: true,
		message: 'Review added successfully',
		data: review,
		errors: [],
		meta: { timestamp: new Date().toISOString() }
	});
};

const updateProductReview = async (req: Request, res: Response) => {
	const userId = req.user!.id;
	const reviewId = String(req.params.reviewId);
	const payload = validateUpdateProductReviewPayload(req.body);
	const review = await reviewService.updateProductReview(userId, reviewId, payload);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Review updated successfully',
		data: review,
		errors: [],
		meta: { timestamp: new Date().toISOString() }
	});
};

const deleteProductReview = async (req: Request, res: Response) => {
	const userId = req.user!.id;
	const reviewId = String(req.params.reviewId);
	await reviewService.deleteProductReview(userId, reviewId);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Review deleted successfully',
		data: null,
		errors: [],
		meta: { timestamp: new Date().toISOString() }
	});
};

const getProductReviews = async (req: Request, res: Response) => {
	const productId = String(req.params.productId);
	const reviews = await reviewService.getProductReviews(productId);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Reviews fetched successfully',
		data: reviews,
		errors: [],
		meta: { timestamp: new Date().toISOString() }
	});
};

export const reviewController = {
	createComment,
	updateComment,
	deleteComment,
	getBlogComments,
	createProductReview,
	updateProductReview,
	deleteProductReview,
	getProductReviews
};
