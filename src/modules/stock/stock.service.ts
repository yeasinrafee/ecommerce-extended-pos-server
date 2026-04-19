import crypto from 'node:crypto';
import { OrderStatus, Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { prisma } from '../../config/prisma.js';
import type {
	BulkPatchStockDto,
	CreateStockDto,
	CreateStockProductDto,
	ServiceListResult,
	StockListQuery,
	UpdateStockDto
} from './stock.types.js';

const INVOICE_REGEX = /^\d{12}$/;

type NormalizedStockProduct = {
	productId: string;
	quantity: number;
	purchasePrice: number;
	totalPrice: number;
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

const normalizeProducts = (products: CreateStockProductDto[] | undefined, required: boolean): NormalizedStockProduct[] => {
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
		const purchasePrice = toNumber(item?.purchasePrice);

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

		if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
			throw new AppError(400, 'Invalid purchase price', [
				{ field: `products.${index}.purchasePrice`, message: 'Purchase price must be 0 or greater', code: 'INVALID_PURCHASE_PRICE' }
			]);
		}

		seen.add(productId);

		return {
			productId,
			quantity,
			purchasePrice,
			totalPrice: Number((quantity * purchasePrice).toFixed(2))
		};
	});
};

const buildStockWhere = ({ searchTerm, orderStatus }: Pick<StockListQuery, 'searchTerm' | 'orderStatus'>): Prisma.StockWhereInput => {
	const where: Prisma.StockWhereInput = {
		deletedAt: null
	};

	if (searchTerm) {
		where.OR = [
			{ invoiceNumber: { contains: searchTerm, mode: 'insensitive' } },
			{ note: { contains: searchTerm, mode: 'insensitive' } },
			{ supplier: { name: { contains: searchTerm, mode: 'insensitive' } } },
			{ store: { name: { contains: searchTerm, mode: 'insensitive' } } },
			{ user: { email: { contains: searchTerm, mode: 'insensitive' } } }
		];
	}

	if (orderStatus) {
		where.orderStatus = orderStatus;
	}

	return where;
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

const ensureSupplierAndStore = async (tx: Prisma.TransactionClient, supplierId: number, storeId: string) => {
	const [supplier, store] = await Promise.all([
		tx.supplier.findFirst({ where: { id: supplierId, deletedAt: null }, select: { id: true } }),
		tx.store.findFirst({ where: { id: storeId, deletedAt: null }, select: { id: true } })
	]);

	if (!supplier) {
		throw new AppError(404, 'Supplier not found', [
			{ field: 'supplierId', message: 'No active supplier found with this id', code: 'SUPPLIER_NOT_FOUND' }
		]);
	}

	if (!store) {
		throw new AppError(404, 'Store not found', [
			{ field: 'storeId', message: 'No active store found with this id', code: 'STORE_NOT_FOUND' }
		]);
	}
};

const ensureProductsExist = async (tx: Prisma.TransactionClient, products: NormalizedStockProduct[]) => {
	const ids = products.map((item) => item.productId);
	const existing = await tx.product.findMany({
		where: {
			id: { in: ids },
			deletedAt: null
		},
		select: { id: true }
	});

	if (existing.length !== ids.length) {
		const existingSet = new Set(existing.map((item) => item.id));
		const missing = ids.filter((id) => !existingSet.has(id));
		throw new AppError(404, 'Some products were not found', [
			{ field: 'products', message: `Missing products: ${missing.join(', ')}`, code: 'PRODUCT_NOT_FOUND' }
		]);
	}
};

const ensureUniqueInvoiceNumber = async (
	tx: Prisma.TransactionClient,
	invoiceNumber: string,
	excludeStockId?: string
) => {
	const found = await tx.stock.findFirst({
		where: {
			invoiceNumber,
			...(excludeStockId ? { id: { not: excludeStockId } } : {})
		},
		select: { id: true }
	});

	if (found) {
		throw new AppError(409, 'Invoice number already exists', [
			{ field: 'invoiceNumber', message: 'Invoice number must be unique', code: 'DUPLICATE_INVOICE_NUMBER' }
		]);
	}
};

const getOrGenerateInvoiceNumber = async (
	tx: Prisma.TransactionClient,
	providedInvoiceNumber?: string,
	excludeStockId?: string
) => {
	if (providedInvoiceNumber) {
		validateInvoiceNumberFormat(providedInvoiceNumber);
		await ensureUniqueInvoiceNumber(tx, providedInvoiceNumber, excludeStockId);
		return providedInvoiceNumber;
	}

	for (let attempt = 0; attempt < 30; attempt += 1) {
		const generated = generateInvoiceCandidate();
		const found = await tx.stock.findFirst({ where: { invoiceNumber: generated }, select: { id: true } });
		if (!found) {
			return generated;
		}
	}

	throw new AppError(500, 'Failed to generate invoice number', [
		{ field: 'invoiceNumber', message: 'Could not generate a unique invoice number', code: 'INVOICE_GENERATION_FAILED' }
	]);
};

const applyStockDelta = async (tx: Prisma.TransactionClient, productId: string, delta: number) => {
	if (delta === 0) return;

	if (delta > 0) {
		await tx.product.update({
			where: { id: productId },
			data: {
				stock: {
					increment: delta
				}
			}
		});
		return;
	}

	const result = await tx.product.updateMany({
		where: {
			id: productId,
			stock: {
				gte: Math.abs(delta)
			}
		},
		data: {
			stock: {
				decrement: Math.abs(delta)
			}
		}
	});

	if (result.count === 0) {
		throw new AppError(400, 'Insufficient product stock for adjustment', [
			{ field: 'products', message: `Cannot reduce stock for product ${productId}`, code: 'INSUFFICIENT_PRODUCT_STOCK' }
		]);
	}
};

const sumTotals = (products: NormalizedStockProduct[]) => {
	const totalProductQuantity = products.reduce((sum, item) => sum + item.quantity, 0);
	const grandTotal = Number(products.reduce((sum, item) => sum + item.totalPrice, 0).toFixed(2));
	return { totalProductQuantity, grandTotal };
};

const getStocks = async ({
	page = 1,
	limit = 10,
	searchTerm,
	orderStatus
}: StockListQuery = {}): Promise<ServiceListResult<any>> => {
	const safePage = Number.isFinite(page) && page > 0 ? page : 1;
	const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 10;
	const skip = (safePage - 1) * safeLimit;
	const where = buildStockWhere({ searchTerm, orderStatus });

	const [data, total] = await Promise.all([
		prisma.stock.findMany({
			where,
			skip,
			take: safeLimit,
			orderBy: { createdAt: 'desc' },
			include: {
				supplier: true,
				store: true,
				user: {
					select: {
						id: true,
						email: true,
						admins: {
							select: { name: true },
							take: 1
						}
					}
				}
			}
		}),
		prisma.stock.count({ where })
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

const getStockById = async (id: string) => {
	return prisma.stock.findFirst({
		where: {
			id,
			deletedAt: null
		},
		include: {
			supplier: true,
			store: true,
			user: {
				select: {
					id: true,
					email: true,
					admins: {
						select: { name: true },
						take: 1
					}
				}
			},
			stockProducts: {
				where: { deletedAt: null },
				include: {
					product: {
						select: {
							id: true,
							name: true,
							sku: true,
							image: true,
							stock: true
						}
					}
				},
				orderBy: { createdAt: 'asc' }
			}
		}
	});
};

const generateInvoiceNumber = async () => {
	return prisma.$transaction(async (tx) => getOrGenerateInvoiceNumber(tx));
};

const createStock = async (userId: string, payload: CreateStockDto) => {
	const supplierId = toInteger(payload?.supplierId);
	const storeId = normalizeTrimmedString(payload?.storeId);
	const note = payload?.note === undefined ? undefined : payload.note?.trim() || null;
	const orderStatus = payload?.orderStatus ?? OrderStatus.PENDING;
	const createdAt = parseCreatedAt(payload?.createdAt);
	const products = normalizeProducts(payload?.products, true);

	if (!Number.isInteger(supplierId) || supplierId <= 0) {
		throw new AppError(400, 'Invalid supplier id', [
			{ field: 'supplierId', message: 'Supplier is required', code: 'INVALID_SUPPLIER_ID' }
		]);
	}

	if (!storeId) {
		throw new AppError(400, 'Invalid store id', [
			{ field: 'storeId', message: 'Store is required', code: 'INVALID_STORE_ID' }
		]);
	}

	const totals = sumTotals(products);

	return prisma.$transaction(async (tx) => {
		await ensureSupplierAndStore(tx, supplierId, storeId);
		await ensureProductsExist(tx, products);
		const invoiceNumber = await getOrGenerateInvoiceNumber(tx, payload?.invoiceNumber);

		for (const item of products) {
			await applyStockDelta(tx, item.productId, item.quantity);
		}

		const created = await tx.stock.create({
			data: {
				userId,
				supplierId,
				storeId,
				invoiceNumber,
				note,
				orderStatus,
				totalProductQuantity: totals.totalProductQuantity,
				grandTotal: totals.grandTotal,
				...(createdAt ? { createdAt } : {}),
				stockProducts: {
					create: products.map((item) => ({
						productId: item.productId,
						quantity: item.quantity,
						purchasePrice: item.purchasePrice,
						totalPrice: item.totalPrice
					}))
				}
			}
		});

		return tx.stock.findUnique({
			where: { id: created.id },
			include: {
				supplier: true,
				store: true,
				user: {
					select: {
						id: true,
						email: true,
						admins: {
							select: { name: true },
							take: 1
						}
					}
				},
				stockProducts: {
					where: { deletedAt: null },
					include: {
						product: {
							select: {
								id: true,
								name: true,
								sku: true,
								image: true,
								stock: true
							}
						}
					}
				}
			}
		});
	});
};

const updateStock = async (id: string, payload: UpdateStockDto) => {
	const existing = await prisma.stock.findFirst({
		where: {
			id,
			deletedAt: null
		},
		include: {
			stockProducts: {
				where: { deletedAt: null },
				select: { productId: true, quantity: true }
			}
		}
	});

	if (!existing) {
		throw new AppError(404, 'Stock not found', [
			{ field: 'id', message: 'No active stock found with this id', code: 'STOCK_NOT_FOUND' }
		]);
	}

	const hasProducts = Object.prototype.hasOwnProperty.call(payload, 'products');
	const products = hasProducts ? normalizeProducts(payload.products, true) : [];
	const supplierId = payload.supplierId === undefined ? undefined : toInteger(payload.supplierId);
	const storeId = payload.storeId === undefined ? undefined : normalizeTrimmedString(payload.storeId);
	const note = payload.note === undefined ? undefined : payload.note?.trim() || null;
	const createdAt = parseCreatedAt(payload.createdAt);

	if (supplierId !== undefined && (!Number.isInteger(supplierId) || supplierId <= 0)) {
		throw new AppError(400, 'Invalid supplier id', [
			{ field: 'supplierId', message: 'Supplier id must be a valid number', code: 'INVALID_SUPPLIER_ID' }
		]);
	}

	if (storeId !== undefined && !storeId) {
		throw new AppError(400, 'Invalid store id', [
			{ field: 'storeId', message: 'Store id is required', code: 'INVALID_STORE_ID' }
		]);
	}

	return prisma.$transaction(async (tx) => {
		if (supplierId !== undefined || storeId !== undefined) {
			await ensureSupplierAndStore(tx, supplierId ?? existing.supplierId, storeId ?? existing.storeId);
		}

		let invoiceNumber: string | undefined;
		if (payload.invoiceNumber !== undefined) {
			if (payload.invoiceNumber !== existing.invoiceNumber) {
				invoiceNumber = await getOrGenerateInvoiceNumber(tx, payload.invoiceNumber, id);
			} else {
				invoiceNumber = payload.invoiceNumber;
			}
		}

		if (hasProducts) {
			await ensureProductsExist(tx, products);
			const oldQuantities = new Map<string, number>();
			for (const item of existing.stockProducts) {
				oldQuantities.set(item.productId, item.quantity);
			}

			const newQuantities = new Map<string, number>();
			for (const item of products) {
				newQuantities.set(item.productId, item.quantity);
			}

			const productIds = new Set<string>([...oldQuantities.keys(), ...newQuantities.keys()]);
			for (const productId of productIds) {
				const oldQty = oldQuantities.get(productId) ?? 0;
				const newQty = newQuantities.get(productId) ?? 0;
				const delta = newQty - oldQty;
				await applyStockDelta(tx, productId, delta);
			}

			await tx.stockProduct.updateMany({
				where: {
					stockId: id,
					deletedAt: null
				},
				data: {
					deletedAt: new Date()
				}
			});

			if (products.length > 0) {
				await tx.stockProduct.createMany({
					data: products.map((item) => ({
						stockId: id,
						productId: item.productId,
						quantity: item.quantity,
						purchasePrice: item.purchasePrice,
						totalPrice: item.totalPrice
					}))
				});
			}
		}

		const data: Prisma.StockUpdateInput = {};

		if (supplierId !== undefined) {
			data.supplier = {
				connect: { id: supplierId }
			};
		}

		if (storeId !== undefined) {
			data.store = {
				connect: { id: storeId }
			};
		}

		if (invoiceNumber !== undefined) {
			data.invoiceNumber = invoiceNumber;
		}

		if (note !== undefined) {
			data.note = note;
		}

		if (payload.orderStatus !== undefined) {
			data.orderStatus = payload.orderStatus;
		}

		if (createdAt !== undefined) {
			data.createdAt = createdAt;
		}

		if (hasProducts) {
			const totals = sumTotals(products);
			data.totalProductQuantity = totals.totalProductQuantity;
			data.grandTotal = totals.grandTotal;
		}

		const updated = Object.keys(data).length
			? await tx.stock.update({ where: { id }, data })
			: await tx.stock.findUnique({ where: { id } });

		if (!updated) {
			throw new AppError(404, 'Stock not found', [
				{ field: 'id', message: 'No active stock found with this id', code: 'STOCK_NOT_FOUND' }
			]);
		}

		return tx.stock.findUnique({
			where: { id: updated.id },
			include: {
				supplier: true,
				store: true,
				user: {
					select: {
						id: true,
						email: true,
						admins: {
							select: { name: true },
							take: 1
						}
					}
				},
				stockProducts: {
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

const deleteStock = async (id: string) => {
	return prisma.$transaction(async (tx) => {
		const existing = await tx.stock.findFirst({
			where: {
				id,
				deletedAt: null
			},
			include: {
				stockProducts: {
					where: { deletedAt: null },
					select: { productId: true, quantity: true }
				}
			}
		});

		if (!existing) {
			throw new AppError(404, 'Stock not found', [
				{ field: 'id', message: 'No active stock found with this id', code: 'STOCK_NOT_FOUND' }
			]);
		}

		for (const item of existing.stockProducts) {
			await applyStockDelta(tx, item.productId, -item.quantity);
		}

		await tx.stockProduct.updateMany({
			where: {
				stockId: id,
				deletedAt: null
			},
			data: {
				deletedAt: new Date()
			}
		});

		await tx.stock.update({
			where: { id },
			data: {
				deletedAt: new Date()
			}
		});

		return true;
	});
};

const bulkPatchStocks = async (payload: BulkPatchStockDto) => {
	return prisma.stock.updateMany({
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

export const stockService = {
	getStocks,
	getStockById,
	generateInvoiceNumber,
	createStock,
	updateStock,
	bulkPatchStocks,
	deleteStock
};
