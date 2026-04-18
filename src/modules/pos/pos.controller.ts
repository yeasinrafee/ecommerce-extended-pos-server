import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { sendResponse } from '../../common/utils/send-response.js';
import { posService } from './pos.service.js';
import type { CreatePosBillInput, UpdatePosBillInput } from './pos.types.js';

const getBills = async (req: Request, res: Response) => {
	const page = Math.max(1, Number(req.query.page ?? 1));
	const limit = Math.max(1, Number(req.query.limit ?? 10));

	const result = await posService.getBills({ page, limit });

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'POS bills fetched',
		data: result.data,
		meta: result.meta
	});
};

const getBill = async (req: Request, res: Response) => {
	const userId = req.user?.id;
	if (!userId) {
		throw new AppError(401, 'Unauthorized', [
			{ message: 'Authentication required', code: 'UNAUTHORIZED' }
		]);
	}

	const orderId = typeof req.params.orderId === 'string' ? req.params.orderId.trim() : '';
	if (!orderId) {
		throw new AppError(400, 'Invalid order id', [
			{ field: 'orderId', message: 'orderId path param is required', code: 'INVALID_ORDER_ID' }
		]);
	}

	const data = await posService.getBill(orderId, userId);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'POS bill fetched',
		data
	});
};

const getProducts = async (req: Request, res: Response) => {
	const storeId = req.query.storeId ? String(req.query.storeId).trim() : undefined;
	const searchTerm = req.query.searchTerm ? String(req.query.searchTerm).trim() : undefined;
	const data = await posService.getProducts({
		storeId: storeId || undefined,
		searchTerm: searchTerm || undefined
	});

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Products retrieved',
		data
	});
};

const createBill = async (req: Request, res: Response) => {
	const userId = req.user?.id;
	if (!userId) {
		throw new AppError(401, 'Unauthorized', [
			{ message: 'Authentication required', code: 'UNAUTHORIZED' }
		]);
	}

	const data = await posService.createBill(userId, req.body as CreatePosBillInput);

	sendResponse({
		res,
		statusCode: 201,
		success: true,
		message: 'POS bill created',
		data
	});
};

const updateBill = async (req: Request, res: Response) => {
	const userId = req.user?.id;
	if (!userId) {
		throw new AppError(401, 'Unauthorized', [
			{ message: 'Authentication required', code: 'UNAUTHORIZED' }
		]);
	}

	const orderId = typeof req.params.orderId === 'string' ? req.params.orderId.trim() : '';
	if (!orderId) {
		throw new AppError(400, 'Invalid order id', [
			{ field: 'orderId', message: 'orderId path param is required', code: 'INVALID_ORDER_ID' }
		]);
	}

	const data = await posService.updateBill(orderId, userId, req.body as UpdatePosBillInput);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'POS bill updated',
		data
	});
};

const deleteBill = async (req: Request, res: Response) => {
	const userId = req.user?.id;
	if (!userId) {
		throw new AppError(401, 'Unauthorized', [
			{ message: 'Authentication required', code: 'UNAUTHORIZED' }
		]);
	}

	const orderId = typeof req.params.orderId === 'string' ? req.params.orderId.trim() : '';
	if (!orderId) {
		throw new AppError(400, 'Invalid order id', [
			{ field: 'orderId', message: 'orderId path param is required', code: 'INVALID_ORDER_ID' }
		]);
	}

	const data = await posService.deleteBill(orderId, userId);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'POS bill deleted',
		data
	});
};

export const posController = {
	getBills,
	getBill,
	getProducts,
	createBill,
	updateBill,
	deleteBill
};