import crypto from 'node:crypto';
import { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { sendResponse } from '../../common/utils/send-response.js';
import { supplierService } from './supplier.service.js';
import type { Status } from '@prisma/client';
import { normalizeUploadedFiles, uploadMultipleFilesToCloudinary, deleteCloudinaryAsset } from '../../common/utils/file-upload.js';

const parseSupplierId = (value: string | string[] | undefined) => {
	const raw = Array.isArray(value) ? value[0] : value;
	const parsed = Number(raw);

	if (!Number.isInteger(parsed)) {
		throw new AppError(400, 'Invalid supplier id', [
			{ message: 'Supplier id must be a valid number', code: 'INVALID_ID' }
		]);
	}

	return parsed;
};

const createSupplier = async (req: Request, res: Response) => {
	const payload = req.body || {};
	let newlyUploadedPublicId: string | null = null;

	try {
		const files = normalizeUploadedFiles(req.files);
		if (files.length > 0) {
			const uploadedFiles = await uploadMultipleFilesToCloudinary(files, {
				projectFolder: 'suppliers',
				entityId: crypto.randomUUID(),
				fileNamePrefix: 'supplier'
			});

			const uploaded = uploadedFiles[0];
			payload.image = uploaded?.secureUrl ?? null;
			newlyUploadedPublicId = uploaded?.publicId ?? null;
		}

		const created = await supplierService.createSupplier(payload);

		sendResponse({
			res,
			statusCode: 201,
			success: true,
			message: 'Supplier created',
			data: created
		});
	} catch (err) {
		if (newlyUploadedPublicId) {
			try {
				await deleteCloudinaryAsset(newlyUploadedPublicId);
			} catch (_deleteErr) {
			}
		}

		throw err;
 	}
};

const updateSupplier = async (req: Request, res: Response) => {
	const id = parseSupplierId(req.params.id);
	const payload = req.body || {};
	let newlyUploadedPublicId: string | null = null;

	try {
		const files = normalizeUploadedFiles(req.files);
		if (files.length > 0) {
			const uploadedFiles = await uploadMultipleFilesToCloudinary(files, {
				projectFolder: 'suppliers',
				entityId: String(id),
				fileNamePrefix: 'supplier'
			});

			const uploaded = uploadedFiles[0];
			payload.image = uploaded?.secureUrl ?? null;
			newlyUploadedPublicId = uploaded?.publicId ?? null;
		}

		const updated = await supplierService.updateSupplier(id, payload, newlyUploadedPublicId);

		sendResponse({
			res,
			statusCode: 200,
			success: true,
			message: 'Supplier updated',
			data: updated
		});
	} catch (err) {
		if (newlyUploadedPublicId) {
			try {
				await deleteCloudinaryAsset(newlyUploadedPublicId);
			} catch (_deleteErr) {
			}
		}

		throw err;
	}
};

const getSuppliers = async (req: Request, res: Response) => {
	const page = Number(req.query.page ?? 1);
	const limit = Number(req.query.limit ?? 10);
	const searchTerm = typeof req.query.searchTerm === 'string' ? req.query.searchTerm : undefined;
	const status = req.query.status as Status | undefined;

	const result = await supplierService.getSuppliers({ page, limit, searchTerm, status });

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Suppliers fetched',
		data: result.data,
		meta: result.meta
	});
};

const getAllSuppliers = async (_req: Request, res: Response) => {
	const suppliers = await supplierService.getAllSuppliers();

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'All suppliers fetched',
		data: suppliers
	});
};

const getSupplier = async (req: Request, res: Response) => {
	const id = parseSupplierId(req.params.id);
	const supplier = await supplierService.getSupplierById(id);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Supplier fetched',
		data: supplier
	});
};

const deleteSupplier = async (req: Request, res: Response) => {
	const id = parseSupplierId(req.params.id);
	await supplierService.deleteSupplier(id);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Supplier deleted',
		data: null
	});
};

const bulkUpdateStatus = async (req: Request, res: Response) => {
	const ids = Array.isArray(req.body?.ids)
		? req.body.ids.map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value))
		: [];
	const status = typeof req.body?.status === 'string' ? (req.body.status as Status) : undefined;

	const count = await supplierService.bulkUpdateStatus(ids, status);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Statuses updated',
		data: { updated: count }
	});
};

export const supplierController = {
	createSupplier,
	updateSupplier,
	getSuppliers,
	getAllSuppliers,
	getSupplier,
	deleteSupplier,
	bulkUpdateStatus
};