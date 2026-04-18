import crypto from 'node:crypto';
import { Prisma, OrderStatus } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { prisma } from '../../config/prisma.js';
import type {
	BulkPatchStockTransferDto,
	CreateStockTransferDto,
	CreateStockTransferProductDto,
	ServiceListResult,
	StockTransferListQuery,
	StockTransferProductSearchResult,
	UpdateStockTransferDto
} from './stock-transfer.types.js';

const INVOICE_REGEX = /^\d{12}$/;

type StockTransferAvailability = {
	availableByProductId: Map<string, number>;
	purchasePriceByProductId: Map<string, number>;
};

const toNumber = (value: unknown) => {
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : NaN;
	}

	if (typeof value === 'string') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : NaN;
	}

	return NaN;
};

const toInteger = (value: unknown) => {
	const parsed = toNumber(value);
	return Number.isInteger(parsed) ? parsed : NaN;
};

const normalizeTrimmedString = (value: unknown) => {
	if (typeof value !== 'string') return '';
	return value.trim();
};

const parseCreatedAt = (value: unknown) => {
	if (value === undefined) return undefined;
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) {
			throw new AppError(400, 'Invalid create date', [
				{ field: 'createdAt', message: 'Create date must be a valid date', code: 'INVALID_DATE' }
			]);
		}
		return value;
	}

	if (typeof value === 'string') {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) {
			throw new AppError(400, 'Invalid create date', [
				{ field: 'createdAt', message: 'Create date must be a valid date', code: 'INVALID_DATE' }
			]);
		}
		return date;
	}

	throw new AppError(400, 'Invalid create date', [
		{ field: 'createdAt', message: 'Create date must be a valid date', code: 'INVALID_DATE' }
	]);
};

const generateInvoiceCandidate = () => {
	const max = 1_000_000_000_000;
	const value = crypto.randomInt(0, max);
	return String(value).padStart(12, '0');
};

const validateInvoiceNumberFormat = (invoiceNumber: string) => {
	if (!INVOICE_REGEX.test(invoiceNumber)) {
		throw new AppError(400, 'Invalid invoice number format', [
			{ field: 'invoiceNumber', message: 'Invoice number must be 12 digits', code: 'INVALID_INVOICE_NUMBER' }
		]);
	}
};

const ensureUniqueInvoiceNumber = async (tx: Prisma.TransactionClient, invoiceNumber: string, excludeTransferId?: string) => {
	const found = await tx.stockTransfer.findFirst({
		where: {
			invoiceNumber,
			...(excludeTransferId ? { id: { not: excludeTransferId } } : {})
		},
		select: { id: true }
	});

	if (found) {
		throw new AppError(409, 'Invoice number already exists', [
			{ field: 'invoiceNumber', message: 'Invoice number must be unique', code: 'DUPLICATE_INVOICE_NUMBER' }
		]);
	}
};

const getOrGenerateInvoiceNumber = async (tx: Prisma.TransactionClient, providedInvoiceNumber?: string, excludeTransferId?: string) => {
	if (providedInvoiceNumber) {
		validateInvoiceNumberFormat(providedInvoiceNumber);
		await ensureUniqueInvoiceNumber(tx, providedInvoiceNumber, excludeTransferId);
		return providedInvoiceNumber;
	}

	for (let attempt = 0; attempt < 30; attempt += 1) {
		const candidate = generateInvoiceCandidate();
		const found = await tx.stockTransfer.findFirst({ where: { invoiceNumber: candidate }, select: { id: true } });
		if (!found) {
			return candidate;
		}
	}

	throw new AppError(500, 'Failed to generate invoice number', [
		{ field: 'invoiceNumber', message: 'Could not generate a unique invoice number', code: 'INVOICE_GENERATION_FAILED' }
	]);
};

const ensureStoreExists = async (tx: Prisma.TransactionClient, storeId: string) => {
	const store = await tx.store.findFirst({
		where: {
			id: storeId,
			deletedAt: null
		},
		select: { id: true }
	});

	if (!store) {
		throw new AppError(404, 'Store not found', [
			{ field: 'storeId', message: 'No active store found with this id', code: 'STORE_NOT_FOUND' }
		]);
	}

	return store;
};

const ensureTransferExists = async (tx: Prisma.TransactionClient, id: string) => {
	const transfer = await tx.stockTransfer.findFirst({
		where: {
			id,
			deletedAt: null
		},
		select: { id: true }
	});

	if (!transfer) {
		throw new AppError(404, 'Stock transfer not found', [
			{ field: 'id', message: 'No active stock transfer found with this id', code: 'TRANSFER_NOT_FOUND' }
		]);
	}

	return transfer;
};

const getTransferWhere = ({ searchTerm, orderStatus }: Pick<StockTransferListQuery, 'searchTerm' | 'orderStatus'>): Prisma.StockTransferWhereInput => {
	const where: Prisma.StockTransferWhereInput = {
		deletedAt: null
	};

	if (searchTerm) {
		where.OR = [
			{ invoiceNumber: { contains: searchTerm, mode: 'insensitive' } },
			{ fromStore: { name: { contains: searchTerm, mode: 'insensitive' } } },
			{ toStore: { name: { contains: searchTerm, mode: 'insensitive' } } }
		];
	}

	if (orderStatus) {
		where.orderStatus = orderStatus;
	}

	return where;
};

const buildAvailabilitySnapshot = async (tx: Prisma.TransactionClient, storeId: string, productIds?: string[]): Promise<StockTransferAvailability> => {
	const [stockProducts, outgoingTransfers] = await Promise.all([
		tx.stockProduct.findMany({
			where: {
				deletedAt: null,
				...(productIds ? { productId: { in: productIds } } : {}),
				stock: {
					deletedAt: null,
					storeId
				}
			},
			select: {
				productId: true,
				quantity: true,
				purchasePrice: true,
				createdAt: true
			},
			orderBy: {
				createdAt: 'desc'
			}
		}),
		tx.stockTransfer.findMany({
			where: {
				deletedAt: null,
				fromStoreId: storeId,
				orderStatus: {
					not: OrderStatus.CANCELLED
				},
				...(productIds
					? {
						stockProductTransfers: {
							some: {
								deletedAt: null,
								productId: { in: productIds }
							}
						}
					}
					: {})
			},
			select: {
				stockProductTransfers: {
					where: {
						deletedAt: null,
						...(productIds ? { productId: { in: productIds } } : {})
					},
					select: {
						productId: true,
						quantity: true
					}
				}
			}
		})
	]);

	const availableByProductId = new Map<string, number>();
	const purchasePriceByProductId = new Map<string, number>();

	for (const item of stockProducts) {
		availableByProductId.set(item.productId, (availableByProductId.get(item.productId) ?? 0) + item.quantity);
		if (!purchasePriceByProductId.has(item.productId)) {
			purchasePriceByProductId.set(item.productId, item.purchasePrice);
		}
	}

	for (const transfer of outgoingTransfers) {
		for (const item of transfer.stockProductTransfers) {
			availableByProductId.set(item.productId, (availableByProductId.get(item.productId) ?? 0) - item.quantity);
		}
	}

	return {
		availableByProductId,
		purchasePriceByProductId
	};
};

const getStoreProductSearchResults = async (
	tx: Prisma.TransactionClient,
	fromStoreId: string,
	searchTerm: string
): Promise<StockTransferProductSearchResult[]> => {
	const normalized = normalizeTrimmedString(searchTerm);
	if (!normalized) return [];

	await ensureStoreExists(tx, fromStoreId);

	const matchingProducts = await tx.product.findMany({
		where: {
			deletedAt: null,
			OR: [
				{ name: { contains: normalized, mode: 'insensitive' } },
				{ sku: { contains: normalized, mode: 'insensitive' } },
				{ id: { contains: normalized, mode: 'insensitive' } }
			]
		},
		select: {
			id: true,
			name: true,
			sku: true,
			stock: true
		},
		orderBy: {
			createdAt: 'desc'
		},
		take: 10
	});

	if (matchingProducts.length === 0) return [];

	const productIds = matchingProducts.map((item) => item.id);
	const availability = await buildAvailabilitySnapshot(tx, fromStoreId, productIds);

	return matchingProducts
		.map((product) => {
			const availableQuantity = availability.availableByProductId.get(product.id) ?? 0;
			if (availableQuantity <= 0) return null;

			return {
				id: product.id,
				name: product.name,
				sku: product.sku,
				stock: product.stock,
				availableQuantity,
				purchasePrice: availability.purchasePriceByProductId.get(product.id) ?? 0
			};
		})
		.filter((item): item is StockTransferProductSearchResult => item !== null);
};

const normalizeTransferProducts = (
	products: CreateStockTransferProductDto[] | undefined,
	required: boolean
): CreateStockTransferProductDto[] => {
	if (!products) {
		if (required) {
			throw new AppError(400, 'Products are required', [
				{ field: 'products', message: 'At least one product is required', code: 'PRODUCTS_REQUIRED' }
			]);
		}

		return [];
	}

	if (!Array.isArray(products)) {
		throw new AppError(400, 'Invalid products payload', [
			{ field: 'products', message: 'Products must be an array', code: 'INVALID_PRODUCTS' }
		]);
	}

	if (required && products.length === 0) {
		throw new AppError(400, 'Products are required', [
			{ field: 'products', message: 'At least one product is required', code: 'PRODUCTS_REQUIRED' }
		]);
	}

	const seen = new Set<string>();

	return products.map((item, index) => {
		const productId = normalizeTrimmedString(item?.productId);
		const quantity = toInteger(item?.quantity);

		if (!productId) {
			throw new AppError(400, 'Invalid product id', [
				{ field: `products.${index}.productId`, message: 'Product id is required', code: 'INVALID_PRODUCT_ID' }
			]);
		}

		if (seen.has(productId)) {
			throw new AppError(400, 'Duplicate product found', [
				{ field: `products.${index}.productId`, message: 'Each product can be selected only once', code: 'DUPLICATE_PRODUCT' }
			]);
		}

		if (!Number.isInteger(quantity) || quantity <= 0) {
			throw new AppError(400, 'Invalid quantity', [
				{ field: `products.${index}.quantity`, message: 'Quantity must be a positive integer', code: 'INVALID_QUANTITY' }
			]);
		}

		seen.add(productId);

		return {
			productId,
			quantity
		};
	});
};

const resolveTransferProductsForCreate = async (
	tx: Prisma.TransactionClient,
	fromStoreId: string,
	products: CreateStockTransferProductDto[]
) => {
	const productIds = products.map((item) => item.productId);
	const availability = await buildAvailabilitySnapshot(tx, fromStoreId, productIds);

	return products.map((item, index) => {
		const availableQuantity = availability.availableByProductId.get(item.productId) ?? 0;
		if (availableQuantity <= 0) {
			throw new AppError(400, 'Product is not available in this store', [
				{ field: `products.${index}.productId`, message: 'Product is not available in this store', code: 'PRODUCT_NOT_AVAILABLE' }
			]);
		}

		if (item.quantity > availableQuantity) {
			throw new AppError(400, 'Insufficient stock for transfer', [
				{
					field: `products.${index}.quantity`,
					message: `Available quantity is ${availableQuantity}`,
					code: 'INSUFFICIENT_STOCK'
				}
			]);
		}

		const purchasePrice = availability.purchasePriceByProductId.get(item.productId);
		if (purchasePrice === undefined) {
			throw new AppError(400, 'Purchase price not found', [
				{ field: `products.${index}.productId`, message: 'Purchase price could not be resolved for this product', code: 'PURCHASE_PRICE_NOT_FOUND' }
			]);
		}

		return {
			productId: item.productId,
			quantity: item.quantity,
			purchasePrice,
			totalPrice: Number((item.quantity * purchasePrice).toFixed(2))
		};
	});
};

const getTransferById = async (id: string) => {
	return prisma.stockTransfer.findFirst({
		where: {
			id,
			deletedAt: null
		},
		include: {
			fromStore: true,
			toStore: true,
			stockProductTransfers: {
				where: { deletedAt: null },
				include: {
					product: {
						select: {
							id: true,
							name: true,
							sku: true,
							stock: true
						}
					}
				},
				orderBy: { createdAt: 'asc' }
			}
		}
	});
};

const getTransfers = async ({ page = 1, limit = 10, searchTerm, orderStatus }: StockTransferListQuery = {}): Promise<ServiceListResult<any>> => {
	const safePage = Number.isFinite(page) && page > 0 ? page : 1;
	const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 10;
	const skip = (safePage - 1) * safeLimit;
	const where = getTransferWhere({ searchTerm, orderStatus });

	const [data, total] = await Promise.all([
		prisma.stockTransfer.findMany({
			where,
			skip,
			take: safeLimit,
			orderBy: { createdAt: 'desc' },
			include: {
				fromStore: true,
				toStore: true
			}
		}),
		prisma.stockTransfer.count({ where })
	]);

	return {
		data,
		meta: {
			page: safePage,
			limit: safeLimit,
			total,
			totalPages: Math.max(1, Math.ceil(total / safeLimit))
		}
	};
};

const generateInvoiceNumber = async () => {
	const generated = await prisma.$transaction(async (tx) => getOrGenerateInvoiceNumber(tx));

	return generated;
};

const createTransfer = async (payload: CreateStockTransferDto) => {
	const fromStoreId = normalizeTrimmedString(payload?.fromStoreId);
	const toStoreId = normalizeTrimmedString(payload?.toStoreId);
	const createdAt = parseCreatedAt(payload?.createdAt);
	const products = normalizeTransferProducts(payload?.products, true);
	const orderStatus = OrderStatus.PENDING;

	if (!fromStoreId) {
		throw new AppError(400, 'Invalid source store', [
			{ field: 'fromStoreId', message: 'Source store is required', code: 'INVALID_FROM_STORE' }
		]);
	}

	if (!toStoreId) {
		throw new AppError(400, 'Invalid destination store', [
			{ field: 'toStoreId', message: 'Destination store is required', code: 'INVALID_TO_STORE' }
		]);
	}

	if (fromStoreId === toStoreId) {
		throw new AppError(400, 'Invalid stores', [
			{ field: 'toStoreId', message: 'Source and destination stores must be different', code: 'SAME_STORE_TRANSFER' }
		]);
	}

	return prisma.$transaction(async (tx) => {
		await ensureStoreExists(tx, fromStoreId);
		await ensureStoreExists(tx, toStoreId);

		const transferProducts = await resolveTransferProductsForCreate(tx, fromStoreId, products);
		const invoiceNumber = await getOrGenerateInvoiceNumber(tx, payload?.invoiceNumber);

		const quantity = transferProducts.reduce((sum, item) => sum + item.quantity, 0);

		const created = await tx.stockTransfer.create({
			data: {
				invoiceNumber,
				fromStoreId,
				toStoreId,
				orderStatus,
				quantity,
				...(createdAt ? { createdAt } : {}),
				stockProductTransfers: {
					create: transferProducts.map((item) => ({
						productId: item.productId,
						quantity: item.quantity,
						purchasePrice: item.purchasePrice,
						totalPrice: item.totalPrice
					}))
				}
			}
		});

		return tx.stockTransfer.findUnique({
			where: { id: created.id },
			include: {
				fromStore: true,
				toStore: true,
				stockProductTransfers: {
					where: { deletedAt: null },
					include: {
						product: {
							select: {
								id: true,
								name: true,
								sku: true,
								stock: true
							}
						}
					}
				}
			}
		});
	});
};

const patchTransfer = async (id: string, payload: UpdateStockTransferDto) => {
	await ensureTransferExists(prisma, id);

	if (payload.orderStatus === undefined) {
		return getTransferById(id);
	}

	await prisma.stockTransfer.update({
		where: { id },
		data: { orderStatus: payload.orderStatus }
	});

	return getTransferById(id);
};

const bulkPatchTransfers = async (payload: BulkPatchStockTransferDto) => {
	return prisma.stockTransfer.updateMany({
		where: {
			id: {
				in: payload.ids
			},
			deletedAt: null
		},
		data: {
			orderStatus: payload.orderStatus
		}
	});
};

const deleteTransfer = async (id: string) => {
	await ensureTransferExists(prisma, id);

	await prisma.stockTransfer.update({
		where: { id },
		data: {
			deletedAt: new Date()
		}
	});

	return true;
};

const searchTransferProducts = async (fromStoreId: string, searchTerm: string) => {
	const normalized = normalizeTrimmedString(searchTerm);
	if (!normalized) return [];

	return prisma.$transaction(async (tx) => getStoreProductSearchResults(tx, fromStoreId, normalized));
};

export const stockTransferService = {
	getTransfers,
	getTransferById,
	generateInvoiceNumber,
	createTransfer,
	patchTransfer,
	bulkPatchTransfers,
	deleteTransfer,
	searchTransferProducts
};