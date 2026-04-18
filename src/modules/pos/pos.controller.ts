import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { sendResponse } from '../../common/utils/send-response.js';
import { posService } from './pos.service.js';
import type { CreatePosBillInput, UpdatePosBillInput } from './pos.types.js';

const getProducts = async (req: Request, res: Response) => {
	const searchTerm = req.query.searchTerm ? String(req.query.searchTerm).trim() : undefined;
	const data = await posService.getProducts(searchTerm || undefined);

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
	getProducts,
	createBill,
	updateBill,
	deleteBill
};