import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { sendResponse } from '../../common/utils/send-response.js';
import { AppError } from '../../common/errors/app-error.js';
import { deleteCloudinaryAsset, uploadMultipleFilesToCloudinary, getPublicIdFromUrl } from '../../common/utils/file-upload.js';
import { productService } from './product.service.js';

const nullableNumberSchema = z.preprocess(
	(value) => {
		if (value === '' || value === null || value === undefined) {
			return null;
		}
		return Number(value);
	},
	z.number().nullable()
);

const nullablePositiveNumberSchema = z.preprocess(
	(value) => {
		if (value === '' || value === null || value === undefined) {
			return null;
		}
		return Number(value);
	},
	z.number().positive().nullable()
);

const nullableDateSchema = z.preprocess(
	(value) => {
		if (value === '' || value === null || value === undefined) {
			return null;
		}
		return new Date(String(value));
	},
	z.date().nullable()
);

const createProductBodySchema = z.object({
	name: z.string().trim().min(1, 'Product name is required'),
	shortDescription: z.preprocess((value) => {
		if (value === '' || value === null || value === undefined) {
			return null;
		}
		return String(value).trim();
	}, z.string().nullable()),
	description: z.string().trim().min(1, 'Description is required'),
	basePrice: z.coerce.number().nonnegative(),
	discountType: z.enum(['NONE', 'FLAT_DISCOUNT', 'PERCENTAGE_DISCOUNT']),
	discountValue: nullableNumberSchema,
	discountStartDate: nullableDateSchema,
	discountEndDate: nullableDateSchema,
	stock: z.coerce.number().int().nonnegative(),
	sku: z.preprocess((value) => {
		if (value === '' || value === null || value === undefined) {
			return null;
		}
		return String(value).trim();
	}, z.string().nullable()),
	weight: nullablePositiveNumberSchema,
	length: nullablePositiveNumberSchema,
	width: nullablePositiveNumberSchema,
	height: nullablePositiveNumberSchema,
	brandId: z.preprocess((value) => {
		if (value === '' || value === null || value === undefined) {
			return undefined;
		}
		return String(value).trim();
	}, z.string().min(1).optional()),
	status: z.enum(['ACTIVE', 'INACTIVE']),
	stockStatus: z.enum(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']),
	categories: z.array(z.string().trim().min(1)).min(1, 'At least one category is required'),
	tags: z.array(z.string().trim().min(1)).optional(),
	galleryImagesMeta: z.array(z.object({ id: z.string().trim().min(1), name: z.string().trim().min(1) })),
	attributes: z.array(
		z.object({
			name: z.string().trim().min(1),
			pairs: z.array(
				z.object({
					value: z.string().trim().min(1),
					price: nullableNumberSchema,
					imageId: z.string().trim().optional().nullable()
				})
			).min(1),
		})
	),
	additionalInfo: z.array(
		z.object({
			name: z.string().trim().min(1),
			value: z.string().trim().min(1)
		})
	),
	seo: z.object({
		metaTitle: z.preprocess((value) => {
			if (value === '' || value === null || value === undefined) {
				return '';
			}
			return String(value).trim();
		}, z.string()),
		metaDescription: z.preprocess((value) => {
			if (value === '' || value === null || value === undefined) {
				return '';
			}
			return String(value).trim();
		}, z.string()),
		seoKeywords: z.array(z.string().trim().min(1))
	}).nullable()
}).superRefine((data, ctx) => {
	const hasWeight = data.weight != null;
	const hasDimensions = data.length != null && data.width != null && data.height != null;

	if (!hasWeight && !hasDimensions) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['weight'],
			message: 'Provide weight or all three dimensions'
		});
	}

	if (data.discountType !== 'NONE' && data.discountValue == null) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['discountValue'],
			message: 'Discount value is required when a discount type is selected'
		});
	}

	if (data.discountStartDate && data.discountEndDate && data.discountEndDate < data.discountStartDate) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['discountEndDate'],
			message: 'Discount end date must be after the start date'
		});
	}

	const seoProvided = Boolean(data.seo && (data.seo.metaTitle || data.seo.metaDescription || data.seo.seoKeywords.length > 0));
	if (seoProvided && !data.seo?.metaTitle) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['seo', 'metaTitle'],
			message: 'SEO meta title is required when SEO data is provided'
		});
	}
});

const parseJsonField = <T,>(value: unknown, fallback: T): T => {
	if (value === undefined || value === null || value === '') {
		return fallback;
	}

	if (typeof value !== 'string') {
		return value as T;
	}

	try {
		return JSON.parse(value) as T;
	} catch {
		throw new AppError(400, 'Invalid payload', [
			{ message: 'One or more JSON fields could not be parsed', code: 'INVALID_JSON_PAYLOAD' }
		]);
	}
};

const createProduct = async (req: Request, res: Response) => {
	const files = req.files as Record<string, Express.Multer.File[]> | undefined;
	const mainImageFile = files?.mainImage?.[0] ?? null;
	const galleryFiles = files?.galleryImages ?? [];

	if (!mainImageFile) {
		throw new AppError(400, 'Main image is required', [
			{ message: 'Please upload a product image', code: 'MAIN_IMAGE_REQUIRED' }
		]);
	}

	const parsed = createProductBodySchema.parse({
		name: req.body.name,
		shortDescription: req.body.shortDescription,
		description: req.body.description,
		basePrice: req.body.basePrice,
		discountType: req.body.discountType,
		discountValue: req.body.discountValue,
		discountStartDate: req.body.discountStartDate,
		discountEndDate: req.body.discountEndDate,
		stock: req.body.stock,
		sku: req.body.sku,
		weight: req.body.weight,
		length: req.body.length,
		width: req.body.width,
		height: req.body.height,
		brandId: req.body.brandId,
		status: req.body.status,
		stockStatus: req.body.stockStatus,
		categories: parseJsonField(req.body.categories, [] as string[]),
		tags: parseJsonField(req.body.tags, [] as string[]),
		galleryImagesMeta: parseJsonField(req.body.galleryImagesMeta, [] as { id: string; name: string }[]),
		attributes: parseJsonField(req.body.attributes, [] as { name: string; pairs: { value: string; price?: number | null; imageId?: string | null }[] }[]),
		additionalInfo: parseJsonField(req.body.additionalInfo, [] as { name: string; value: string }[]),
		seo: parseJsonField(req.body.seo, null as { metaTitle: string; metaDescription: string; seoKeywords: string[] } | null)
	});

	if (galleryFiles.length !== parsed.galleryImagesMeta.length) {
		throw new AppError(400, 'Invalid gallery images', [
			{ message: 'Gallery image metadata does not match uploaded files', code: 'GALLERY_IMAGE_MISMATCH' }
		]);
	}

	const galleryIdSet = new Set(parsed.galleryImagesMeta.map((item) => item.id));
	const invalidAttributeImage = parsed.attributes.find((attribute) =>
		attribute.pairs.some((pair) => pair.imageId && !galleryIdSet.has(pair.imageId)),
	);
	if (invalidAttributeImage) {
		const invalidPair = invalidAttributeImage.pairs.find((pair) => pair.imageId && !galleryIdSet.has(pair.imageId));
		throw new AppError(400, 'Invalid attribute image selection', [
			{
				message: `Attribute ${invalidAttributeImage.name} value ${invalidPair?.value ?? ''} references a gallery image that was not uploaded`,
				code: 'ATTRIBUTE_IMAGE_NOT_FOUND'
			}
		]);
	}

	const uploadEntityId = crypto.randomUUID();
	const uploadedPublicIds: string[] = [];

	try {
		const [mainImageUpload] = await uploadMultipleFilesToCloudinary([mainImageFile], {
			projectFolder: 'products',
			entityId: uploadEntityId,
			subFolder: 'main',
			fileNamePrefix: 'product'
		});

		uploadedPublicIds.push(mainImageUpload.publicId);

		const galleryUploads = galleryFiles.length > 0
			? await uploadMultipleFilesToCloudinary(galleryFiles, {
					projectFolder: 'products',
					entityId: uploadEntityId,
					subFolder: 'gallery',
					fileNamePrefix: 'gallery'
				})
			: [];

		uploadedPublicIds.push(...galleryUploads.map((uploaded) => uploaded.publicId));

		const galleryUrlByClientId = new Map<string, string>();
		parsed.galleryImagesMeta.forEach((item, index) => {
			const uploaded = galleryUploads[index];
			if (uploaded) {
				galleryUrlByClientId.set(item.id, uploaded.secureUrl);
			}
		});

		const created = await productService.createProduct({
			name: parsed.name,
			shortDescription: parsed.shortDescription,
			description: parsed.description,
			basePrice: parsed.basePrice,
			discountType: parsed.discountType,
			discountValue: parsed.discountValue,
			discountStartDate: parsed.discountStartDate,
			discountEndDate: parsed.discountEndDate,
			stock: parsed.stock,
			sku: parsed.sku,
			weight: parsed.weight,
			length: parsed.length,
			width: parsed.width,
			height: parsed.height,
			brandId: parsed.brandId,
			image: mainImageUpload.secureUrl,
			galleryImages: galleryUploads.map((uploaded) => uploaded.secureUrl),
			status: parsed.status,
			stockStatus: parsed.stockStatus,
			categoryIds: parsed.categories,
			tagIds: parsed.tags,
			attributes: parsed.attributes.map((attribute) => ({
				name: attribute.name,
				pairs: attribute.pairs.map((pair) => ({
					value: pair.value,
					price: pair.price ?? null,
					galleryImage: pair.imageId ? galleryUrlByClientId.get(pair.imageId) ?? null : null
				})),
			})),
			additionalInformations: parsed.additionalInfo,
			seo: parsed.seo && (parsed.seo.metaTitle || parsed.seo.metaDescription || parsed.seo.seoKeywords.length > 0)
				? {
						title: parsed.seo.metaTitle,
						description: parsed.seo.metaDescription || null,
						keyword: parsed.seo.seoKeywords
					}
				: null
		});

		sendResponse({
			res,
			statusCode: 201,
			success: true,
			message: 'Product created',
			data: created
		});
	} catch (error) {
		await Promise.allSettled(uploadedPublicIds.map((publicId) => deleteCloudinaryAsset(publicId)));
		throw error;
	}
};

const getProducts = async (req: Request, res: Response) => {
	const page = Math.max(1, Number(req.query.page ?? 1));
	const limit = Math.max(1, Number(req.query.limit ?? 20));
	const searchTerm = req.query.searchTerm ? String(req.query.searchTerm) : undefined;
	const category = req.query.category ? (Array.isArray(req.query.category) ? req.query.category as string[] : String(req.query.category)) : undefined;
	const brand = req.query.brand ? (Array.isArray(req.query.brand) ? req.query.brand as string[] : String(req.query.brand)) : undefined;
	const minPrice = req.query.minPrice ? Number(req.query.minPrice) : undefined;
	const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined;

	const result = await productService.getProducts({
		page,
		limit,
		searchTerm,
		category,
		brand,
		minPrice,
		maxPrice
	});

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Products retrieved',
		data: result.data,
		meta: result.meta
	});
};

const getProductsLimited = async (req: Request, res: Response) => {
	const count = Math.max(1, Number(req.query.count ?? 10));
	const searchTerm = req.query.searchTerm ? String(req.query.searchTerm) : undefined;
	const category = req.query.category ? (Array.isArray(req.query.category) ? req.query.category as string[] : String(req.query.category)) : undefined;
	const brand = req.query.brand ? (Array.isArray(req.query.brand) ? req.query.brand as string[] : String(req.query.brand)) : undefined;
	const minPrice = req.query.minPrice ? Number(req.query.minPrice) : undefined;
	const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined;

	const data = await productService.getProductsLimited({
		count,
		searchTerm,
		category,
		brand,
		minPrice,
		maxPrice
	});

	sendResponse({ res, statusCode: 200, success: true, message: 'Products retrieved', data });
};

const getAllProducts = async (req: Request, res: Response) => {
	const data = await productService.getAllProducts();
	sendResponse({ res, statusCode: 200, success: true, message: 'All products retrieved', data });
};

const getProductById = async (req: Request, res: Response) => {
	const id = String(req.params.id);
	const product = await productService.getProductById(id);
if (!product) {
 		throw new AppError(404, 'Product not found', [{ message: 'No product found with the provided id', code: 'PRODUCT_NOT_FOUND' }]);
}

	sendResponse({ res, statusCode: 200, success: true, message: 'Product retrieved', data: product });
};

const getProductBySlug = async (req: Request, res: Response) => {
	const slug = String(req.params.slug);
	const product = await productService.getProductBySlug(slug);
	if (!product) {
		throw new AppError(404, 'Product not found', [{ message: 'No product found with the provided slug', code: 'PRODUCT_NOT_FOUND' }]);
	}

	sendResponse({ res, statusCode: 200, success: true, message: 'Product retrieved', data: product });
};

const getHotDeals = async (req: Request, res: Response) => {
	const count = req.query.count ? Number(req.query.count) : 10;
	const products = await productService.getHotDeals(count);
	sendResponse({ res, statusCode: 200, success: true, message: 'Hot deals retrieved', data: products });
};

const getNewArrivals = async (req: Request, res: Response) => {
	const count = req.query.count ? Number(req.query.count) : 10;
	const products = await productService.getNewArrivals(count);
	sendResponse({ res, statusCode: 200, success: true, message: 'New arrivals retrieved', data: products });
};

const getOfferProducts = async (req: Request, res: Response) => {
	const data = await productService.getOfferProducts();
	sendResponse({ res, statusCode: 200, success: true, message: 'Products retrieved', data });
};

const deleteProduct = async (req: Request, res: Response) => {
	const id = String(req.params.id);
	await productService.deleteProduct(id);
	sendResponse({ res, statusCode: 200, success: true, message: 'Product deleted', data: null });
};

// ─── Update ──────────────────────────────────────────────────────────────────

const updateProductBodySchema = z.object({
	name: z.string().trim().min(1, 'Product name is required'),
	shortDescription: z.preprocess((value) => {
		if (value === '' || value === null || value === undefined) return null;
		return String(value).trim();
	}, z.string().nullable()),
	description: z.string().trim().min(1, 'Description is required'),
	basePrice: z.coerce.number().nonnegative(),
	discountType: z.enum(['NONE', 'FLAT_DISCOUNT', 'PERCENTAGE_DISCOUNT']),
	discountValue: nullableNumberSchema,
	discountStartDate: nullableDateSchema,
	discountEndDate: nullableDateSchema,
	stock: z.coerce.number().int().nonnegative(),
	sku: z.preprocess((value) => {
		if (value === '' || value === null || value === undefined) return null;
		return String(value).trim();
	}, z.string().nullable()),
	weight: nullablePositiveNumberSchema,
	length: nullablePositiveNumberSchema,
	width: nullablePositiveNumberSchema,
	height: nullablePositiveNumberSchema,
	brandId: z.preprocess((value) => {
		if (value === '' || value === null || value === undefined) {
			return undefined;
		}
		return String(value).trim();
	}, z.string().min(1).optional()),
	status: z.enum(['ACTIVE', 'INACTIVE']),
	stockStatus: z.enum(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']),
	categories: z.array(z.string().trim().min(1)).min(1, 'At least one category is required'),
	tags: z.array(z.string().trim().min(1)).optional(),
	/** "true" = keep existing main image; "false" = a new file is being uploaded */
	keepMainImage: z.enum(['true', 'false']),
	/** Existing gallery URLs that should be RETAINED (subset of current product gallery) */
	existingGalleryUrls: z.array(z.string()).default([]),
	galleryImagesMeta: z.array(z.object({ id: z.string().trim().min(1), name: z.string().trim().min(1) })),
	attributes: z.array(
		z.object({
			name: z.string().trim().min(1),
			pairs: z.array(
				z.object({
					value: z.string().trim().min(1),
					price: nullableNumberSchema,
					/** References a newly-uploaded gallery file by its client-side id */
					imageId: z.string().trim().optional().nullable(),
					/** References an already-uploaded gallery URL that is being kept */
					existingImageUrl: z.string().optional().nullable()
				})
			).min(1)
		})
	),
	additionalInfo: z.array(z.object({ name: z.string().trim().min(1), value: z.string().trim().min(1) })),
	seo: z.object({
		metaTitle: z.preprocess((value) => {
			if (value === '' || value === null || value === undefined) return '';
			return String(value).trim();
		}, z.string()),
		metaDescription: z.preprocess((value) => {
			if (value === '' || value === null || value === undefined) return '';
			return String(value).trim();
		}, z.string()),
		seoKeywords: z.array(z.string().trim().min(1))
	}).nullable()
}).superRefine((data, ctx) => {
	const hasWeight = data.weight != null;
	const hasDimensions = data.length != null && data.width != null && data.height != null;

	if (!hasWeight && !hasDimensions) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['weight'], message: 'Provide weight or all three dimensions' });
	}

	if (data.discountType !== 'NONE' && data.discountValue == null) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountValue'], message: 'Discount value is required when a discount type is selected' });
	}

	if (data.discountStartDate && data.discountEndDate && data.discountEndDate < data.discountStartDate) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountEndDate'], message: 'Discount end date must be after the start date' });
	}

	const seoProvided = Boolean(data.seo && (data.seo.metaTitle || data.seo.metaDescription || data.seo.seoKeywords.length > 0));
	if (seoProvided && !data.seo?.metaTitle) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['seo', 'metaTitle'], message: 'SEO meta title is required when SEO data is provided' });
	}
});

const updateProduct = async (req: Request, res: Response) => {
	const id = String(req.params.id);

	// Fetch the existing product first (needed for image cleanup and URL validation)
	const existingProduct = await productService.getProductById(id);
	if (!existingProduct) {
		throw new AppError(404, 'Product not found', [
			{ message: 'No product found with the provided id', code: 'PRODUCT_NOT_FOUND' }
		]);
	}

	const files = req.files as Record<string, Express.Multer.File[]> | undefined;
	const mainImageFile = files?.mainImage?.[0] ?? null;
	const galleryFiles = files?.galleryImages ?? [];

	const parsed = updateProductBodySchema.parse({
		name: req.body.name,
		shortDescription: req.body.shortDescription,
		description: req.body.description,
		basePrice: req.body.basePrice,
		discountType: req.body.discountType,
		discountValue: req.body.discountValue,
		discountStartDate: req.body.discountStartDate,
		discountEndDate: req.body.discountEndDate,
		stock: req.body.stock,
		sku: req.body.sku,
		weight: req.body.weight,
		length: req.body.length,
		width: req.body.width,
		height: req.body.height,
		brandId: req.body.brandId,
		status: req.body.status,
		stockStatus: req.body.stockStatus,
		keepMainImage: req.body.keepMainImage,
		categories: parseJsonField(req.body.categories, [] as string[]),
		tags: parseJsonField(req.body.tags, [] as string[]),
		existingGalleryUrls: parseJsonField(req.body.existingGalleryUrls, [] as string[]),
		galleryImagesMeta: parseJsonField(req.body.galleryImagesMeta, [] as { id: string; name: string }[]),
		attributes: parseJsonField(req.body.attributes, [] as { name: string; pairs: { value: string; price?: number | null; imageId?: string | null; existingImageUrl?: string | null }[] }[]),
		additionalInfo: parseJsonField(req.body.additionalInfo, [] as { name: string; value: string }[]),
		seo: parseJsonField(req.body.seo, null as { metaTitle: string; metaDescription: string; seoKeywords: string[] } | null)
	});

	// Validate keepMainImage vs file presence
	if (parsed.keepMainImage === 'false' && !mainImageFile) {
		throw new AppError(400, 'Main image is required', [
			{ message: 'A new main image file must be uploaded when replacing the current image', code: 'MAIN_IMAGE_REQUIRED' }
		]);
	}

	// Validate new gallery files match metadata
	if (galleryFiles.length !== parsed.galleryImagesMeta.length) {
		throw new AppError(400, 'Invalid gallery images', [
			{ message: 'Gallery image metadata does not match uploaded files', code: 'GALLERY_IMAGE_MISMATCH' }
		]);
	}

	// Security: only allow URLs that actually belong to this product's current gallery
	const currentGallerySet = new Set(existingProduct.galleryImages as string[]);
	const validatedExistingGalleryUrls = parsed.existingGalleryUrls.filter((url) => currentGallerySet.has(url));
	const validatedExistingGallerySet = new Set(validatedExistingGalleryUrls);

	// Validate new-image client IDs referenced by attribute pairs
	const newGalleryIdSet = new Set(parsed.galleryImagesMeta.map((item) => item.id));
	const invalidAttributeImage = parsed.attributes.find((attr) =>
		attr.pairs.some((pair) => pair.imageId && !newGalleryIdSet.has(pair.imageId))
	);
	if (invalidAttributeImage) {
		const invalidPair = invalidAttributeImage.pairs.find((pair) => pair.imageId && !newGalleryIdSet.has(pair.imageId));
		throw new AppError(400, 'Invalid attribute image selection', [
			{
				message: `Attribute ${invalidAttributeImage.name} value ${invalidPair?.value ?? ''} references a gallery image that was not uploaded`,
				code: 'ATTRIBUTE_IMAGE_NOT_FOUND'
			}
		]);
	}

	const uploadedPublicIds: string[] = [];

	try {
		// ── Main image ──────────────────────────────────────────────────────────
		let finalMainImageUrl: string;

		if (parsed.keepMainImage === 'true') {
			finalMainImageUrl = existingProduct.image as string;
		} else {
			const [mainUpload] = await uploadMultipleFilesToCloudinary([mainImageFile!], {
				projectFolder: 'products',
				entityId: id,
				subFolder: 'main',
				fileNamePrefix: 'product'
			});
			uploadedPublicIds.push(mainUpload.publicId);
			finalMainImageUrl = mainUpload.secureUrl;
		}

		// ── New gallery images ──────────────────────────────────────────────────
		const galleryUploads = galleryFiles.length > 0
			? await uploadMultipleFilesToCloudinary(galleryFiles, {
					projectFolder: 'products',
					entityId: id,
					subFolder: 'gallery',
					fileNamePrefix: 'gallery'
				})
			: [];
		uploadedPublicIds.push(...galleryUploads.map((u) => u.publicId));

		const galleryUrlByClientId = new Map<string, string>();
		parsed.galleryImagesMeta.forEach((item, index) => {
			const uploaded = galleryUploads[index];
			if (uploaded) galleryUrlByClientId.set(item.id, uploaded.secureUrl);
		});

		// ── Final gallery = kept existing + new uploads ─────────────────────────
		const finalGalleryUrls = [
			...validatedExistingGalleryUrls,
			...galleryUploads.map((u) => u.secureUrl)
		];

		// ── Resolve attribute pair images ───────────────────────────────────────
		const resolvedAttributes = parsed.attributes.map((attr) => ({
			name: attr.name,
			pairs: attr.pairs.map((pair) => {
				let galleryImage: string | null = null;
				if (pair.imageId) {
					galleryImage = galleryUrlByClientId.get(pair.imageId) ?? null;
				} else if (pair.existingImageUrl && validatedExistingGallerySet.has(pair.existingImageUrl)) {
					galleryImage = pair.existingImageUrl;
				}
				return { value: pair.value, price: pair.price ?? null, galleryImage };
			})
		}));

		// ── Persist ─────────────────────────────────────────────────────────────
		const updated = await productService.updateProduct(id, {
			name: parsed.name,
			shortDescription: parsed.shortDescription,
			description: parsed.description,
			basePrice: parsed.basePrice,
			discountType: parsed.discountType,
			discountValue: parsed.discountValue,
			discountStartDate: parsed.discountStartDate,
			discountEndDate: parsed.discountEndDate,
			stock: parsed.stock,
			sku: parsed.sku,
			weight: parsed.weight,
			length: parsed.length,
			width: parsed.width,
			height: parsed.height,
			brandId: parsed.brandId,
			image: finalMainImageUrl,
			galleryImages: finalGalleryUrls,
			status: parsed.status,
			stockStatus: parsed.stockStatus,
			categoryIds: parsed.categories,
			tagIds: parsed.tags,
			attributes: resolvedAttributes,
			additionalInformations: parsed.additionalInfo,
			seo: parsed.seo && (parsed.seo.metaTitle || parsed.seo.metaDescription || parsed.seo.seoKeywords.length > 0)
				? { title: parsed.seo.metaTitle, description: parsed.seo.metaDescription || null, keyword: parsed.seo.seoKeywords }
				: null
		});

		// ── Clean up orphaned Cloudinary assets (fire-and-forget) ───────────────
		const assetsToDelete: string[] = [];

		if (parsed.keepMainImage === 'false') {
			const oldMainPublicId = getPublicIdFromUrl(existingProduct.image as string);
			if (oldMainPublicId) assetsToDelete.push(oldMainPublicId);
		}

		for (const galleryUrl of existingProduct.galleryImages as string[]) {
			if (!validatedExistingGallerySet.has(galleryUrl)) {
				const publicId = getPublicIdFromUrl(galleryUrl);
				if (publicId) assetsToDelete.push(publicId);
			}
		}

		if (assetsToDelete.length > 0) {
			Promise.allSettled(assetsToDelete.map((publicId) => deleteCloudinaryAsset(publicId)));
		}

		sendResponse({ res, statusCode: 200, success: true, message: 'Product updated', data: updated });
	} catch (error) {
		// Roll back any newly uploaded assets on failure
		await Promise.allSettled(uploadedPublicIds.map((publicId) => deleteCloudinaryAsset(publicId)));
		throw error;
	}
};

// ─── Bulk Patch (partial quick-update for multiple products) ─────────────────

const bulkPatchProductsBodySchema = z.object({
	ids: z.array(z.string().trim().min(1)).min(1, 'At least one product id is required'),
	status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
	stockStatus: z.enum(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']).optional()
}).refine(
	(data) => data.status !== undefined || data.stockStatus !== undefined,
	{ message: 'At least one field (status or stockStatus) must be provided' }
);

const bulkPatchProducts = async (req: Request, res: Response) => {
	const parsed = bulkPatchProductsBodySchema.parse(req.body);
	const result = await productService.bulkPatchProducts(parsed);
	sendResponse({ res, statusCode: 200, success: true, message: `${result.count} product(s) updated`, data: result });
};

// ─── Patch (partial quick-update) ────────────────────────────────────────────

const patchProductBodySchema = z.object({
	status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
	stockStatus: z.enum(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']).optional()
}).refine(
	(data) => data.status !== undefined || data.stockStatus !== undefined,
	{ message: 'At least one field (status or stockStatus) must be provided' }
);

const patchProduct = async (req: Request, res: Response) => {
	const id = String(req.params.id);
	const parsed = patchProductBodySchema.parse(req.body);
	const updated = await productService.patchProduct(id, parsed);
	sendResponse({ res, statusCode: 200, success: true, message: 'Product updated', data: updated });
};

export const productController = {
 	createProduct,
	getProducts,
 	getProductsLimited,
 	getAllProducts,
 	getHotDeals,
 	getNewArrivals,
	getOfferProducts,
 	getProductById,
	getProductBySlug,
 	deleteProduct,
 	updateProduct,
 	patchProduct,
 	bulkPatchProducts
};
