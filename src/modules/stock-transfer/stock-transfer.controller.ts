import { Request, Response } from 'express';
import { OrderStatus } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error.js';
import { sendResponse } from '../../common/utils/send-response.js';
import { stockTransferService } from './stock-transfer.service.js';

const parseTransferId = (value: string | string[] | undefined) => {
	const raw = Array.isArray(value) ? value[0] : value;
	if (!raw || !raw.trim()) {
		throw new AppError(400, 'Invalid stock transfer id', [
			{ field: 'id', message: 'Stock transfer id is required', code: 'INVALID_TRANSFER_ID' }
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
		throw new AppError(400, 'Invalid transfer status', [
			{ field: 'orderStatus', message: 'Invalid transfer status value', code: 'INVALID_TRANSFER_STATUS' }
		]);
	}

	return status as OrderStatus;
};

const createTransferBodySchema = z.object({
	fromStoreId: z.string().trim().min(1, 'Source store is required'),
	toStoreId: z.string().trim().min(1, 'Destination store is required'),
	invoiceNumber: z.string().regex(/^\d{12}$/, 'Invoice number must be 12 digits').optional(),
	createdAt: z.string().optional(),
	products: z.array(
		z.object({
			productId: z.string().trim().min(1, 'Product is required'),
			quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1')
		})
	).min(1, 'At least one product is required')
});

const patchTransferBodySchema = z.object({
	orderStatus: z.nativeEnum(OrderStatus)
});

const bulkPatchTransfersBodySchema = z.object({
	ids: z.array(z.string().trim().min(1)).min(1, 'At least one transfer id is required'),
	orderStatus: z.nativeEnum(OrderStatus)
});

const searchProductsQuerySchema = z.object({
	fromStoreId: z.string().trim().min(1, 'Source store is required'),
	searchTerm: z.string().trim().min(1, 'Search term is required')
});

const getTransfers = async (req: Request, res: Response) => {
	const page = Number(req.query.page ?? 1);
	const limit = Number(req.query.limit ?? 10);
	const searchTerm = typeof req.query.searchTerm === 'string' ? req.query.searchTerm : undefined;
	const orderStatus = parseOrderStatus(req.query.orderStatus);

	const result = await stockTransferService.getTransfers({ page, limit, searchTerm, orderStatus });

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Stock transfers fetched',
		data: result.data,
		meta: result.meta
	});
};

const getTransfer = async (req: Request, res: Response) => {
	const id = parseTransferId(req.params.id);
	const transfer = await stockTransferService.getTransferById(id);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Stock transfer fetched',
		data: transfer
	});
};

const searchProducts = async (req: Request, res: Response) => {
	const parsed = searchProductsQuerySchema.parse(req.query);
	const products = await stockTransferService.searchTransferProducts(parsed.fromStoreId, parsed.searchTerm);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Stock transfer products fetched',
		data: products
	});
};

const generateInvoiceNumber = async (_req: Request, res: Response) => {
	const invoiceNumber = await stockTransferService.generateInvoiceNumber();

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Invoice number generated',
		data: { invoiceNumber }
	});
};

const createTransfer = async (req: Request, res: Response) => {
	const parsed = createTransferBodySchema.parse(req.body);
	const transfer = await stockTransferService.createTransfer(parsed);

	sendResponse({
		res,
		statusCode: 201,
		success: true,
		message: 'Stock transfer created',
		data: transfer
	});
};

const patchTransfer = async (req: Request, res: Response) => {
	const id = parseTransferId(req.params.id);
	const parsed = patchTransferBodySchema.parse(req.body);
	const transfer = await stockTransferService.patchTransfer(id, parsed);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Stock transfer updated',
		data: transfer
	});
};

const bulkPatchTransfers = async (req: Request, res: Response) => {
	const parsed = bulkPatchTransfersBodySchema.parse(req.body);
	const result = await stockTransferService.bulkPatchTransfers(parsed);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: `${result.count} transfer(s) updated`,
		data: result
	});
};

const deleteTransfer = async (req: Request, res: Response) => {
	const id = parseTransferId(req.params.id);
	await stockTransferService.deleteTransfer(id);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Stock transfer deleted',
		data: null
	});
};

export const stockTransferController = {
	getTransfers,
	getTransfer,
	searchProducts,
	generateInvoiceNumber,
	createTransfer,
	patchTransfer,
	bulkPatchTransfers,
	deleteTransfer
};