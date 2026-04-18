import crypto from 'node:crypto';
import type { Request } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { env } from '../../config/env.js';
import { AppError } from '../errors/app-error.js';

cloudinary.config({
	cloud_name: env.cloudinaryCloudName,
	api_key: env.cloudinaryApiKey,
	api_secret: env.cloudinaryApiSecret
});

type MulterOptions = {
	maxFileSizeInMB?: number; 
	maxFileCount?: number;
	allowedMimeTypes?: string[];
};

export type UploadContext = {
	projectFolder: string;
	entityId: string;
	subFolder?: string;
	fileNamePrefix?: string;
};

export type UploadedAsset = {
	publicId: string;
	secureUrl: string;
	bytes: number;
	format: string;
	resourceType: string;
};

const defaultAllowedMimeTypes = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/avif'
];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; 


const generatePublicId = (prefix: string, entityId: string) => {
	const randomPart = crypto.randomUUID().split('-')[0];
	return `${prefix}_${entityId}_${Date.now()}_${randomPart}`;
};

const createFolderPath = ({ projectFolder, subFolder }: UploadContext) => {
	const parent = env.uploadsParentFolder;
	return [parent, projectFolder, subFolder]
		.filter((part): part is string => Boolean(part && part.trim().length > 0))
		.join('/');
};

const ensureFolderExists = async (folderPath: string) => {
	if (!folderPath) return;

	try {
		await new Promise((resolve, reject) => {
			
			cloudinary.api.create_folder(folderPath, (err: unknown, res: unknown) => {
				if (err) return reject(err);
				resolve(res);
			});
		});
	} catch (err: any) {
		const msg = err?.message ?? String(err);
	
		if (msg && /already exists/i.test(msg)) {
			return;
		}

		throw new AppError(500, 'Failed to ensure upload folder exists', [
			{ message: msg, code: 'FOLDER_CREATE_FAILED' }
		]);
	}
};

const uploadBuffer = async (
	file: Express.Multer.File,
	context: UploadContext,
	index = 0
): Promise<UploadApiResponse> => {
	let buffer = file.buffer;
	let uploadOptions: Record<string, unknown> = {};

	if (!['image/webp', 'image/avif'].includes(file.mimetype)) {
		try {
			buffer = await sharp(buffer).rotate().webp({ quality: 90 }).toBuffer();
			uploadOptions.format = 'webp';
		} catch (err) {
			throw new AppError(500, 'Image conversion failed', [
				{ message: (err as Error).message, code: 'CONVERSION_ERROR' }
			]);
		}

		if (buffer.length > MAX_IMAGE_BYTES) {
			throw new AppError(400, 'File too large after conversion', [
				{
					message: `Converted image exceeds ${MAX_IMAGE_BYTES} bytes`,
					code: 'FILE_TOO_LARGE'
				}
			]);
		}
	}

	const fileNamePrefix = context.fileNamePrefix ?? 'asset';
	const publicId = generatePublicId(`${fileNamePrefix}_${index + 1}`, context.entityId);

	return new Promise((resolve, reject) => {
		const upload = cloudinary.uploader.upload_stream(
			{
				folder: createFolderPath(context),
				public_id: publicId,
				overwrite: false,
				invalidate: true,
				resource_type: 'auto',
				...uploadOptions
			},
			(error, result) => {
				if (error || !result) {
					reject(
						new AppError(500, 'File upload failed', [
							{
								message: error?.message ?? 'Cloudinary did not return an upload result',
								code: 'UPLOAD_FAILED'
							}
						])
					);
					return;
				}
				resolve(result);
			}
		);

		upload.end(buffer);
	});
};

export const uploadSingleFileToCloudinary = async (
	file: Express.Multer.File,
	context: UploadContext
): Promise<UploadedAsset> => {
	const uploaded = await uploadBuffer(file, context);
	return {
		publicId: uploaded.public_id,
		secureUrl: uploaded.secure_url,
		bytes: uploaded.bytes,
		format: uploaded.format,
		resourceType: uploaded.resource_type
	};
};

export const uploadMultipleFilesToCloudinary = async (
	files: Express.Multer.File[],
	context: UploadContext
): Promise<UploadedAsset[]> => {
	if (files.length === 0) {
		return [];
	}

 await ensureFolderExists(createFolderPath(context));

 const uploads = files.map((file, index) => uploadBuffer(file, context, index));
 const results = await Promise.all(uploads);

	return results.map((uploaded) => ({
		publicId: uploaded.public_id,
		secureUrl: uploaded.secure_url,
		bytes: uploaded.bytes,
		format: uploaded.format,
		resourceType: uploaded.resource_type
	}));
};

export const deleteCloudinaryAsset = async (publicId: string) => {
	if (!publicId) return null;

	try {
		const result = await new Promise((resolve, reject) => {
			cloudinary.uploader.destroy(publicId, { resource_type: 'image' }, (err, res) => {
				if (err) return reject(err);
				resolve(res);
			});
		});

		return result;
	} catch (err) {
		throw new AppError(500, 'Failed to delete asset from cloud', [
			{ message: (err as Error).message, code: 'CLOUD_DELETE_FAILED' }
		]);
	}
};

export const getPublicIdFromUrl = (url?: string | null): string | null => {
	if (!url) return null;

	try {
		
		const withoutQuery = url.split('?')[0];
		const marker = '/upload/';
		const idx = withoutQuery.indexOf(marker);
		if (idx === -1) return null;

		let rest = withoutQuery.substring(idx + marker.length);

		
		const vMatch = rest.match(/v\d+\//);
		if (vMatch && vMatch.index !== undefined) {
			rest = rest.substring(vMatch.index + vMatch[0].length);
		}

		
		const lastDot = rest.lastIndexOf('.');
		if (lastDot !== -1) {
			rest = rest.substring(0, lastDot);
		}

		return rest || null;
	} catch (err) {
		return null;
	}
};

export const createUploadMiddleware = (options: MulterOptions = {}) => {
	const {
		maxFileSizeInMB = 5,
		maxFileCount = 11,
		allowedMimeTypes = defaultAllowedMimeTypes
	} = options;

	return multer({
		storage: multer.memoryStorage(),
		limits: {
			fileSize: maxFileSizeInMB * 1024 * 1024,
			files: maxFileCount
		},
		fileFilter: (_req, file, cb) => {
			if (!allowedMimeTypes.includes(file.mimetype)) {
				cb(
					new AppError(400, 'Unsupported file type', [
						{
							field: file.fieldname,
							message: `Allowed file types are: ${allowedMimeTypes.join(', ')}`,
							code: 'INVALID_FILE_TYPE'
						}
					])
				);
				return;
			}

			cb(null, true);
		}
	});
};

export const normalizeUploadedFiles = (files: Request['files']): Express.Multer.File[] => {
	if (!files) {
		return [];
	}

	if (Array.isArray(files)) {
		return files;
	}

	return Object.values(files).flat();
};

