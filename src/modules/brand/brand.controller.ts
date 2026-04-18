import crypto from 'node:crypto';
import { Request, Response } from 'express';
import { sendResponse } from '../../common/utils/send-response.js';
import { brandService } from './brand.service.js';
import { normalizeUploadedFiles, uploadMultipleFilesToCloudinary, deleteCloudinaryAsset } from '../../common/utils/file-upload.js';

const createBrand = async (req: Request, res: Response) => {
	const { name } = req.body;

	let newlyUploadedPublicId: string | null = null;
	let imageUrl: string | null | undefined = undefined;

	try {
		const files = normalizeUploadedFiles(req.files);
		if (files.length > 0) {
			const generatedId = crypto.randomUUID();
			const uploadedFiles = await uploadMultipleFilesToCloudinary(files, {
				projectFolder: 'brands',
				entityId: generatedId,
				fileNamePrefix: 'brand'
			});

			const uploaded = uploadedFiles[0];
			imageUrl = uploaded?.secureUrl ?? null;
			newlyUploadedPublicId = uploaded?.publicId ?? null;
		}

		const created = await brandService.createBrand({ name, image: imageUrl ?? null });

		sendResponse({
			res,
			statusCode: 201,
			success: true,
			message: 'Brand created',
			data: created
		});
		return;
	} catch (err) {
		if (newlyUploadedPublicId) {
			try {
				await deleteCloudinaryAsset(newlyUploadedPublicId);
			} catch (cleanupErr) {
				console.warn('Failed to cleanup uploaded brand image after create failure', {
					newlyUploadedPublicId,
					err: (cleanupErr as Error).message
				});
			}
		}

		throw err;
	}
};

const updateBrand = async (req: Request, res: Response) => {
	const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	const payload = req.body || {};
	let newlyUploadedPublicId: string | null = null;

	try {
		const files = normalizeUploadedFiles(req.files);

		if (files.length > 0) {
			const uploadedFiles = await uploadMultipleFilesToCloudinary(files, {
				projectFolder: 'brands',
				entityId: id,
				fileNamePrefix: 'brand'
			});

			const uploaded = uploadedFiles[0];
			payload.image = uploaded?.secureUrl ?? null;
			newlyUploadedPublicId = uploaded?.publicId ?? null;
		}

		const updated = await brandService.updateBrand(id, payload, newlyUploadedPublicId);

		sendResponse({
			res,
			statusCode: 200,
			success: true,
			message: 'Brand updated',
			data: updated
		});
		return;
	} catch (err) {
		if (newlyUploadedPublicId) {
			try {
				await deleteCloudinaryAsset(newlyUploadedPublicId);
			} catch (deleteErr) {
				console.warn('Failed to cleanup newly uploaded brand asset after update failure', { newlyUploadedPublicId, err: (deleteErr as Error).message });
			}
		}

		throw err;
	}
};

const getBrands = async (req: Request, res: Response) => {
	const page = Number(req.query.page ?? 1);
	const limit = Number(req.query.limit ?? 10);
	const searchTerm = typeof req.query.searchTerm === 'string' ? req.query.searchTerm : undefined;

	const result = await brandService.getBrands({ page, limit, searchTerm });

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Brands fetched',
		data: result.data,
		meta: {
			...result.meta,
			timestamp: new Date().toISOString()
		}
	});
};

const getBrand = async (req: Request, res: Response) => {
	const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	const b = await brandService.getBrandById(id);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Brand fetched',
		data: b
	});
};

const getAllBrands = async (req: Request, res: Response) => {
	const bs = await brandService.getAllBrands();

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'All brands fetched',
		data: bs
	});
};

const deleteBrand = async (req: Request, res: Response) => {
	const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	await brandService.deleteBrand(id);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Brand deleted',
		data: null
	});
};

export const brandController = {
	createBrand,
	updateBrand,
	getBrands,
	getBrand,
	getAllBrands,
	deleteBrand
};

