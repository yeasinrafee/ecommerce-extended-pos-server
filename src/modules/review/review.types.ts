import { z } from 'zod';
import { AppError } from '../../common/errors/app-error.js';

const parsePayload = <Schema extends z.ZodTypeAny>(schema: Schema, payload: unknown): z.infer<Schema> => {
	const parsed = schema.safeParse(payload);

	if (!parsed.success) {
		throw new AppError(
			400,
			'Validation failed',
			parsed.error.issues.map((issue) => ({
				field: issue.path.join('.') || undefined,
				message: issue.message,
				code: 'VALIDATION_ERROR'
			}))
		);
	}

	return parsed.data;
};

export const createCommentSchema = z.object({
	blogId: z.string().uuid('Invalid blog id'),
	parentId: z.string().uuid('Invalid parent id').optional().nullable(),
	content: z.string().min(1, 'Content is required').max(1000, 'Comment too long')
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const validateCreateCommentPayload = (payload: unknown): CreateCommentInput =>
	parsePayload(createCommentSchema, payload);

export const updateCommentSchema = z.object({
	content: z.string().min(1, 'Content is required').max(1000, 'Comment too long')
});

export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;

export const validateUpdateCommentPayload = (payload: unknown): UpdateCommentInput =>
	parsePayload(updateCommentSchema, payload);

export const createProductReviewSchema = z.object({
	productId: z.string().min(1, 'Product id is required'),
	parentId: z.string().uuid('Invalid parent id').optional().nullable(),
	content: z.string().min(1, 'Content is required').max(1000, 'Review too long'),
	rating: z.number().int().min(1, 'Min rating 1').max(5, 'Max rating 5').optional().nullable()
});

export type CreateProductReviewInput = z.infer<typeof createProductReviewSchema>;

export const validateCreateProductReviewPayload = (payload: unknown): CreateProductReviewInput =>
	parsePayload(createProductReviewSchema, payload);

export const updateProductReviewSchema = z.object({
	content: z.string().min(1, 'Content is required').max(1000, 'Review too long'),
	rating: z.number().int().min(1, 'Min rating 1').max(5, 'Max rating 5').optional().nullable()
});

export type UpdateProductReviewInput = z.infer<typeof updateProductReviewSchema>;

export const validateUpdateProductReviewPayload = (payload: unknown): UpdateProductReviewInput =>
	parsePayload(updateProductReviewSchema, payload);
