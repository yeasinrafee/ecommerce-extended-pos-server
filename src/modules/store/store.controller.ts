import { Request, Response } from 'express';
import { sendResponse } from '../../common/utils/send-response.js';
import { storeService } from './store.service.js';
import type { Status } from '@prisma/client';

const createStore = async (req: Request, res: Response) => {
	const created = await storeService.createStore(req.body || {});

	sendResponse({
		res,
		statusCode: 201,
		success: true,
		message: 'Store created',
		data: created
	});
};

const updateStore = async (req: Request, res: Response) => {
	const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	const updated = await storeService.updateStore(id, req.body || {});

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Store updated',
		data: updated
	});
};

const getStores = async (req: Request, res: Response) => {
	const page = Number(req.query.page ?? 1);
	const limit = Number(req.query.limit ?? 10);
	const searchTerm = typeof req.query.searchTerm === 'string' ? req.query.searchTerm : undefined;
	const status = req.query.status as Status | undefined;

	const result = await storeService.getStores({ page, limit, searchTerm, status });

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Stores fetched',
		data: result.data,
		meta: result.meta
	});
};

const getAllStores = async (_req: Request, res: Response) => {
	const stores = await storeService.getAllStores();

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'All stores fetched',
		data: stores
	});
};

const getStore = async (req: Request, res: Response) => {
	const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	const store = await storeService.getStoreById(id);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Store fetched',
		data: store
	});
};

const deleteStore = async (req: Request, res: Response) => {
	const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	await storeService.deleteStore(id);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Store deleted',
		data: null
	});
};

const bulkUpdateStatus = async (req: Request, res: Response) => {
	const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((value: unknown) => String(value)).filter(Boolean) : [];
	const status = typeof req.body?.status === 'string' ? (req.body.status as Status) : undefined;

	const count = await storeService.bulkUpdateStatus(ids, status);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Statuses updated',
		data: { updated: count }
	});
};

export const storeController = {
	createStore,
	updateStore,
	getStores,
	getAllStores,
	getStore,
	deleteStore,
	bulkUpdateStatus
};