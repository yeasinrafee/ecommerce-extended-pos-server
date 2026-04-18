import { Request, Response } from 'express';
import { OrderStatus } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error.js';
import { sendResponse } from '../../common/utils/send-response.js';
import { stockService } from './stock.service.js';

const parseStockId = (value: string | string[] | undefined) => {
	const raw = Array.isArray(value) ? value[0] : value;
	if (!raw || !raw.trim()) {
		throw new AppError(400, 'Invalid stock id', [
			{ field: 'id', message: 'Stock id is required', code: 'INVALID_STOCK_ID' }
		]);
	}
	return raw;
};

const parseOrderStatus = (value: unknown): OrderStatus | undefined => {
	if (typeof value !== 'string' || !value.trim()) {
		return undefined;
	}

	const status = value.trim().toUpperCase();
	if (!(status in OrderStatus)) {
		throw new AppError(400, 'Invalid order status', [
			{ field: 'orderStatus', message: 'Invalid order status value', code: 'INVALID_ORDER_STATUS' }
		]);
	}

	return status as OrderStatus;
};

const createStock = async (req: Request, res: Response) => {
	const userId = req.user?.id;
	if (!userId) {
		throw new AppError(401, 'Unauthorized', [
			{ message: 'Authentication required', code: 'UNAUTHORIZED' }
		]);
	}

	const created = await stockService.createStock(userId, req.body || {});

	sendResponse({
		res,
		statusCode: 201,
		success: true,
		message: 'Stock created',
		data: created
	});
};

const updateStock = async (req: Request, res: Response) => {
	const id = parseStockId(req.params.id);
	const updated = await stockService.updateStock(id, req.body || {});

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Stock updated',
		data: updated
	});
};

const bulkPatchStocksBodySchema = z.object({
	ids: z.array(z.string().trim().min(1)).min(1, 'At least one stock id is required'),
	orderStatus: z.enum(['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'])
});

const bulkPatchStocks = async (req: Request, res: Response) => {
	const parsed = bulkPatchStocksBodySchema.parse(req.body);
	const result = await stockService.bulkPatchStocks(parsed);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: `${result.count} stock(s) updated`,
		data: result
	});
};

const getStocks = async (req: Request, res: Response) => {
	const page = Number(req.query.page ?? 1);
	const limit = Number(req.query.limit ?? 10);
	const searchTerm = typeof req.query.searchTerm === 'string' ? req.query.searchTerm : undefined;
	const orderStatus = parseOrderStatus(req.query.orderStatus);

	const result = await stockService.getStocks({ page, limit, searchTerm, orderStatus });

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Stocks fetched',
		data: result.data,
		meta: result.meta
	});
};

const getStock = async (req: Request, res: Response) => {
	const id = parseStockId(req.params.id);
	const stock = await stockService.getStockById(id);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Stock fetched',
		data: stock
	});
};

const generateInvoiceNumber = async (_req: Request, res: Response) => {
	const invoiceNumber = await stockService.generateInvoiceNumber();

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Invoice number generated',
		data: { invoiceNumber }
	});
};

const deleteStock = async (req: Request, res: Response) => {
	const id = parseStockId(req.params.id);
	await stockService.deleteStock(id);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Stock deleted',
		data: null
	});
};

export const stockController = {
	createStock,
	updateStock,
	bulkPatchStocks,
	getStocks,
	getStock,
	generateInvoiceNumber,
	deleteStock
};
