import type { Request, Response } from 'express';
import { z } from 'zod';
import type { DiscountType, Status } from '@prisma/client';
import { sendResponse } from '../../common/utils/send-response.js';
import { AppError } from '../../common/errors/app-error.js';
import { offerService } from './offer.service.js';

const discountTypeSchema = z.preprocess((value) => {
	if (value === '' || value === null || value === undefined) {
		return null;
	}

	return value as DiscountType;
}, z.enum(['PERCENTAGE_DISCOUNT', 'FLAT_DISCOUNT', 'NONE']).nullable());

const optionalDiscountTypeSchema = z.preprocess((value) => {
	if (value === '' || value === undefined) {
		return undefined;
	}

	return value as DiscountType | null;
}, z.enum(['PERCENTAGE_DISCOUNT', 'FLAT_DISCOUNT', 'NONE']).nullable().optional());

const nullableNumberSchema = z.preprocess((value) => {
	if (value === '' || value === null || value === undefined) {
		return null;
	}

	return Number(value);
}, z.number().nullable());

const optionalNullableNumberSchema = z.preprocess((value) => {
	if (value === '' || value === undefined) {
		return undefined;
	}

	if (value === null) {
		return null;
	}

	return Number(value);
}, z.number().nullable().optional());

const nullableDateSchema = z.preprocess((value) => {
	if (value === '' || value === null || value === undefined) {
		return null;
	}

	return new Date(String(value));
}, z.date().nullable());

const optionalNullableDateSchema = z.preprocess((value) => {
	if (value === '' || value === undefined) {
		return undefined;
	}

	if (value === null) {
		return null;
	}

	return new Date(String(value));
}, z.date().nullable().optional());

const statusSchema = z.preprocess((value) => {
	if (value === '' || value === undefined) {
		return undefined;
	}

	return value as Status;
}, z.enum(['ACTIVE', 'INACTIVE']).optional());

const bulkStatusUpdateSchema = z.object({
	ids: z.array(z.string().trim().min(1)).min(1, 'Please select at least one offer.'),
	status: z.enum(['ACTIVE', 'INACTIVE'])
});

const productIdsSchema = z.preprocess((value) => {
	if (value === '' || value === null || value === undefined) {
		return [];
	}

	if (Array.isArray(value)) {
		return value.map((item) => String(item).trim()).filter(Boolean);
	}

	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) {
			return [];
		}

		try {
			const parsed = JSON.parse(trimmed);
			if (Array.isArray(parsed)) {
				return parsed.map((item) => String(item).trim()).filter(Boolean);
			}
		} catch {
			return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
		}

		return [trimmed];
	}

	return [String(value).trim()].filter(Boolean);
}, z.array(z.string().trim().min(1)));

const createOfferBodySchema = z.object({
	discountType: discountTypeSchema,
	discountValue: nullableNumberSchema,
	discountStartDate: nullableDateSchema,
	discountEndDate: nullableDateSchema,
	status: statusSchema,
	productIds: productIdsSchema
}).superRefine((data, ctx) => {
	if (data.productIds.length === 0) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['productIds'],
			message: 'Please choose at least one product.'
		});
	}

	if (data.discountType !== null && data.discountType !== 'NONE' && data.discountValue == null) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['discountValue'],
			message: 'Please enter a discount value for the selected discount type.'
		});
	}

	if (data.discountStartDate && data.discountEndDate && data.discountEndDate < data.discountStartDate) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['discountEndDate'],
			message: 'Please make sure the end date is the same as or later than the start date.'
		});
	}
});

const updateOfferBodySchema = z.object({
	discountType: optionalDiscountTypeSchema,
	discountValue: optionalNullableNumberSchema,
	discountStartDate: optionalNullableDateSchema,
	discountEndDate: optionalNullableDateSchema,
	status: statusSchema,
	productIds: productIdsSchema.optional()
}).superRefine((data, ctx) => {
	if (data.productIds && data.productIds.length === 0) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['productIds'],
			message: 'Please choose at least one product.'
		});
	}

	if (data.discountType !== undefined && data.discountType !== null && data.discountType !== 'NONE' && data.discountValue == null) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['discountValue'],
			message: 'Please enter a discount value for the selected discount type.'
		});
	}

	if (data.discountStartDate && data.discountEndDate && data.discountEndDate < data.discountStartDate) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['discountEndDate'],
			message: 'Please make sure the end date is the same as or later than the start date.'
		});
	}
});

const getIdParam = (value: string | string[] | undefined) => String(Array.isArray(value) ? value[0] : value);

const getOffers = async (req: Request, res: Response) => {
	const page = Math.max(1, Number(req.query.page ?? 1));
	const limit = Math.max(1, Number(req.query.limit ?? 10));

	const result = await offerService.getOffers({ page, limit });

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Offers fetched',
		data: result.data,
		meta: result.meta
	});
};

const getAllOffers = async (req: Request, res: Response) => {
	const data = await offerService.getAllOffers();
	sendResponse({ res, statusCode: 200, success: true, message: 'All offers fetched', data });
};

const getOffer = async (req: Request, res: Response) => {
	const id = getIdParam(req.params.id);
	const offer = await offerService.getOfferById(id);

	if (!offer) {
		throw new AppError(404, 'Offer not found', [
			{ message: 'We could not find an active offer with that id. Please refresh and try again.', code: 'OFFER_NOT_FOUND' }
		]);
	}

	sendResponse({ res, statusCode: 200, success: true, message: 'Offer fetched', data: offer });
};

const createOffer = async (req: Request, res: Response) => {
	const parsed = createOfferBodySchema.parse({
		discountType: req.body.discountType,
		discountValue: req.body.discountValue,
		discountStartDate: req.body.discountStartDate,
		discountEndDate: req.body.discountEndDate,
		status: req.body.status,
		productIds: req.body.productIds
	});

	const data = await offerService.createOffer(parsed);
	sendResponse({ res, statusCode: 201, success: true, message: 'Offer created', data });
};

const updateOffer = async (req: Request, res: Response) => {
	const id = getIdParam(req.params.id);
	const parsed = updateOfferBodySchema.parse({
		discountType: req.body.discountType,
		discountValue: req.body.discountValue,
		discountStartDate: req.body.discountStartDate,
		discountEndDate: req.body.discountEndDate,
		status: req.body.status,
		productIds: req.body.productIds
	});

	const data = await offerService.updateOffer(id, parsed);
	sendResponse({ res, statusCode: 200, success: true, message: 'Offer updated', data });
};

const deleteOffer = async (req: Request, res: Response) => {
	const id = getIdParam(req.params.id);
	await offerService.deleteOffer(id);
	sendResponse({ res, statusCode: 200, success: true, message: 'Offer deleted', data: null });
};

const bulkUpdateStatus = async (req: Request, res: Response) => {
	const parsed = bulkStatusUpdateSchema.parse(req.body);
	const updated = await offerService.bulkUpdateStatus(parsed);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Offer statuses updated',
		data: { updated }
	});
};

export const offerController = {
	getOffers,
	getAllOffers,
	getOffer,
	createOffer,
	updateOffer,
	deleteOffer,
	bulkUpdateStatus
};
