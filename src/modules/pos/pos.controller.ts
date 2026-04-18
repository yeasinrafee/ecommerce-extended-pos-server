import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { sendResponse } from '../../common/utils/send-response.js';
import { posService } from './pos.service.js';
import type { CreatePosBillInput } from './pos.types.js';

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

export const posController = {
	getProducts,
	createBill
};