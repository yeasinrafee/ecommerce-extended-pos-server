import type { Request, Response } from 'express';
import { sendResponse } from '../../common/utils/send-response.js';
import { posService } from './pos.service.js';

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

export const posController = {
	getProducts
};