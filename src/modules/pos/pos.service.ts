import crypto from 'node:crypto';
import { DiscountType, OrderStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { prisma } from '../../config/prisma.js';
import { posPaymentService } from '../pos-payment/pos-payment.service.js';
import type { CreatePosBillInput, NormalizedPosBillLine, NormalizedPosPaymentLine, PosBillsListQuery, PosProductLineInput, PosProductsQuery, UpdatePosBillInput } from './pos.types.js';

const productInclude = {
	brand: true,
	categories: { include: { category: true } },
	tags: { include: { tag: true } },
	productVariations: { where: { deletedAt: null }, include: { attribute: true } },
} as const;

type PosProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

type PosProductListItem = Omit<PosProductRow, 'brand' | 'categories' | 'tags' | 'productVariations'> & {
	brand: string | null;
	categories: string[];
	tags: string[];
	productVariations: Array<{
		id: string;
		attributeValue: string;
		basePrice: number;
		finalPrice: number;
	}>;
};

const transformPosProduct = (product: PosProductRow): PosProductListItem => {
	return {
		...product,
		brand: product.brand?.name ?? null,
		categories: product.categories.map((item) => item.category.name),
		tags: product.tags.map((item) => item.tag.name),
		productVariations: product.productVariations.map((variation) => ({
			id: variation.id,
			attributeValue: variation.attributeValue,
			basePrice: variation.basePrice,
			finalPrice: variation.finalPrice
		}))
	};
};

const getProducts = async ({ storeId, searchTerm }: PosProductsQuery = {}) => {
	const where: Prisma.ProductWhereInput = {
		deletedAt: null,
		...(searchTerm ? { name: { contains: searchTerm, mode: 'insensitive' } } : {}),
		...(storeId
			? {
				stockProducts: {
					some: {
						deletedAt: null,
						quantity: { gt: 0 },
						stock: {
							storeId,
							deletedAt: null,
							orderStatus: OrderStatus.DELIVERED
						}
					}
				}
			}
			: {})
	};

	const products = await prisma.product.findMany({
		where,
		orderBy: { createdAt: 'desc' },
		take: 50,
		include: productInclude
	});

	return products.map(transformPosProduct);
};

const getBills = async ({ page = 1, limit = 10, paymentStatus }: PosBillsListQuery = {}) => {
	const skip = (page - 1) * limit;
	const where: Prisma.PosOrderWhereInput = {
		deletedAt: null,
		...(paymentStatus ? { paymentStatus } : {})
	};

	const [orders, total] = await Promise.all([
		prisma.posOrder.findMany({
			where,
			skip,
			take: limit,
			orderBy: { createdAt: 'desc' },
			select: {
				id: true,
				invoiceNumber: true,
				finalAmount: true,
				paidAmount: true,
				paymentStatus: true,
				createdAt: true,
				globalPayments: {
					where: { deletedAt: null },
					include: {
						bank: {
							select: {
								id: true,
								bankName: true,
								branch: true,
								accountNumber: true
							}
						}
					},
					orderBy: { createdAt: 'asc' }
				},
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
				posOrderItems: {
					where: { deletedAt: null },
					select: {
						quantity: true
					}
				}
			}
		}),
		prisma.posOrder.count({ where })
	]);

	return {
		data: orders.map((order) => ({
			id: order.id,
			invoiceNumber: order.invoiceNumber,
			totalQuantity: order.posOrderItems.reduce((sum, item) => sum + item.quantity, 0),
			totalAmount: order.finalAmount,
			paidAmount: order.paidAmount,
			paymentStatus: order.paymentStatus,
			payments: order.globalPayments.map((payment) => ({
				id: payment.id,
				amount: payment.amount,
				paymentMethod: payment.paymentMethod,
				bankId: payment.bankId,
				bank: payment.bank,
				createdAt: payment.createdAt,
				updatedAt: payment.updatedAt
			})),
			globalPayments: order.globalPayments.map((payment) => ({
				id: payment.id,
				amount: payment.amount,
				paymentMethod: payment.paymentMethod,
				bankId: payment.bankId,
				bank: payment.bank,
				createdAt: payment.createdAt,
				updatedAt: payment.updatedAt
			})),
			createdAt: order.createdAt,
			processedBy: {
				userId: order.user.id,
				adminName: order.user.admins[0]?.name ?? null
			}
		})),
		meta: {
			page,
			limit,
			total,
			totalPages: Math.max(1, Math.ceil(total / limit))
		}
	};
};

const getBill = async (orderId: string, userId?: string) => {
	return prisma.$transaction(async (tx) => {
		const order = await tx.posOrder.findFirst({
			where: {
				id: orderId,
				deletedAt: null
			}
		});

		if (!order) {
			throw new AppError(404, 'POS order not found', [
				{ field: 'orderId', message: 'No active POS order found with this id', code: 'POS_ORDER_NOT_FOUND' }
			]);
		}

		if (userId && order.userId !== userId) {
			throw new AppError(403, 'Access denied', [
				{ field: 'orderId', message: 'You are not allowed to view this bill', code: 'BILL_VIEW_FORBIDDEN' }
			]);
		}

		return loadPosOrderResponse(tx, order.id);
	});
};

const toTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const toPositiveInt = (value: unknown) => {
	const parsed = typeof value === 'number' ? value : Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return null;
	}
	return parsed;
};

const toStringArray = (value: unknown) => {
	if (!Array.isArray(value)) return [];
	return value.map((item) => toTrimmedString(item)).filter(Boolean);
};

const toFiniteNumber = (value: unknown) => {
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : null;
	}

	if (typeof value === 'string' && value.trim().length > 0) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}

	return null;
};

const toRoundedMoney = (value: number) => Number(value.toFixed(2));

const validPaymentMethods = new Set<PaymentMethod>([
	PaymentMethod.CASH,
	PaymentMethod.BANKCARD,
	PaymentMethod.BKASH,
	PaymentMethod.NAGAD,
	PaymentMethod.ROCKET
]);

const validDiscountTypes = new Set<DiscountType>([
	DiscountType.NONE,
	DiscountType.FLAT_DISCOUNT,
	DiscountType.PERCENTAGE_DISCOUNT
]);

const calculateDiscountedPrice = (basePrice: number, discountType: DiscountType, discountValue: number) => {
	if (discountType === DiscountType.FLAT_DISCOUNT) {
		return Math.max(0, basePrice - discountValue);
	}

	if (discountType === DiscountType.PERCENTAGE_DISCOUNT) {
		return Math.max(0, basePrice - (basePrice * discountValue) / 100);
	}

	return basePrice;
};

const normalizeOrderDiscountInput = (discountTypeInput: unknown, discountValueInput: unknown, fallback?: { discountType: DiscountType; discountValue: number }) => {
	if (discountTypeInput === undefined && discountValueInput === undefined && fallback) {
		return fallback;
	}

	if (discountTypeInput === undefined && discountValueInput === undefined) {
		return {
			discountType: DiscountType.NONE,
			discountValue: 0
		};
	}

	if (discountTypeInput === undefined && discountValueInput !== undefined && fallback) {
		if (fallback.discountType === DiscountType.NONE) {
			throw new AppError(400, 'Invalid discount value', [
				{ field: 'discountType', message: 'discountType is required when setting discountValue', code: 'INVALID_DISCOUNT_TYPE' }
			]);
		}

		return normalizeOrderDiscountInput(fallback.discountType, discountValueInput, fallback);
	}

	const parsedTypeValue = discountTypeInput === undefined || discountTypeInput === null || discountTypeInput === ''
		? DiscountType.NONE
		: String(discountTypeInput).trim();

	if (!validDiscountTypes.has(parsedTypeValue as DiscountType)) {
		throw new AppError(400, 'Invalid discount type', [
			{ field: 'discountType', message: 'discountType must be PERCENTAGE_DISCOUNT, FLAT_DISCOUNT, or NONE', code: 'INVALID_DISCOUNT_TYPE' }
		]);
	}

	const discountType = parsedTypeValue as DiscountType;

	if (discountType === DiscountType.NONE) {
		return {
			discountType,
			discountValue: 0
		};
	}

	const parsedValue = toFiniteNumber(discountValueInput);
	if (parsedValue === null || parsedValue < 0) {
		throw new AppError(400, 'Invalid discount value', [
			{ field: 'discountValue', message: 'discountValue must be a positive number', code: 'INVALID_DISCOUNT_VALUE' }
		]);
	}

	if (discountType === DiscountType.PERCENTAGE_DISCOUNT && parsedValue > 100) {
		throw new AppError(400, 'Invalid discount value', [
			{ field: 'discountValue', message: 'Percentage discount cannot exceed 100', code: 'INVALID_DISCOUNT_VALUE' }
		]);
	}

	return {
		discountType,
		discountValue: toRoundedMoney(parsedValue)
	};
};

const applyOrderDiscount = (amount: number, discountType: DiscountType, discountValue: number) => {
	if (discountType === DiscountType.PERCENTAGE_DISCOUNT) {
		return Math.max(0, toRoundedMoney(amount - (amount * discountValue) / 100));
	}

	if (discountType === DiscountType.FLAT_DISCOUNT) {
		return Math.max(0, toRoundedMoney(amount - discountValue));
	}

	return toRoundedMoney(amount);
};

const normalizePaymentLines = (value: unknown): NormalizedPosPaymentLine[] => {
	if (value === undefined || value === null) {
		return [];
	}

	if (!Array.isArray(value)) {
		throw new AppError(400, 'Invalid payments payload', [
			{ field: 'payments', message: 'payments must be an array', code: 'INVALID_PAYMENTS_PAYLOAD' }
		]);
	}

	return value.map((item, index) => {
		if (!item || typeof item !== 'object') {
			throw new AppError(400, 'Invalid payment line', [
				{ field: `payments.${index}`, message: 'Each payment item must be an object', code: 'INVALID_PAYMENT_LINE' }
			]);
		}

		const paymentRecord = item as { amount?: unknown; paymentMethod?: unknown; bankId?: unknown };
		const amount = toFiniteNumber(paymentRecord.amount);
		if (amount === null || amount <= 0) {
			throw new AppError(400, 'Invalid payment amount', [
				{ field: `payments.${index}.amount`, message: 'Payment amount must be greater than 0', code: 'INVALID_PAYMENT_AMOUNT' }
			]);
		}

		const paymentMethodValue = typeof paymentRecord.paymentMethod === 'string'
			? paymentRecord.paymentMethod.trim()
			: String(paymentRecord.paymentMethod ?? '').trim();

		if (!validPaymentMethods.has(paymentMethodValue as PaymentMethod)) {
			throw new AppError(400, 'Invalid payment method', [
				{ field: `payments.${index}.paymentMethod`, message: 'Invalid paymentMethod', code: 'INVALID_PAYMENT_METHOD' }
			]);
		}

		const bankId = typeof paymentRecord.bankId === 'string' && paymentRecord.bankId.trim().length > 0
			? paymentRecord.bankId.trim()
			: null;

		if (paymentMethodValue === PaymentMethod.BANKCARD && !bankId) {
			throw new AppError(400, 'Invalid bank card payment', [
				{ field: `payments.${index}.bankId`, message: 'bankId is required when paymentMethod is BANKCARD', code: 'BANK_ID_REQUIRED' }
			]);
		}

		if (paymentMethodValue !== PaymentMethod.BANKCARD && bankId) {
			throw new AppError(400, 'Invalid bank id for payment method', [
				{ field: `payments.${index}.bankId`, message: 'bankId is only allowed when paymentMethod is BANKCARD', code: 'BANK_ID_NOT_ALLOWED' }
			]);
		}

		return {
			amount: toRoundedMoney(amount),
			paymentMethod: paymentMethodValue as PaymentMethod,
			bankId: paymentMethodValue === PaymentMethod.BANKCARD ? bankId : null
		};
	});
};

const sumPaymentAmounts = (payments: NormalizedPosPaymentLine[]) => toRoundedMoney(payments.reduce((sum, payment) => sum + payment.amount, 0));

const resolvePaymentStatusFromAmounts = (finalAmount: number, paidAmount: number) => {
	if (finalAmount <= 0 || paidAmount >= finalAmount) {
		return PaymentStatus.PAID;
	}

	if (paidAmount > 0) {
		return PaymentStatus.DUE;
	}

	return PaymentStatus.PENDING;
};

const ensurePaymentBanksExist = async (tx: Prisma.TransactionClient, payments: NormalizedPosPaymentLine[]) => {
	const bankIds = Array.from(new Set(payments.map((payment) => payment.bankId).filter((id): id is string => id !== null)));

	if (bankIds.length === 0) {
		return;
	}

	const banks = await tx.bank.findMany({
		where: {
			id: { in: bankIds },
			deletedAt: null
		},
		select: { id: true }
	});

	if (banks.length !== bankIds.length) {
		throw new AppError(400, 'Invalid bank id in payments', [
			{ field: 'payments.bankId', message: 'One or more bank ids are invalid or deleted', code: 'INVALID_BANK_ID' }
		]);
	}
};

const toDateOnlyKey = (value: Date | null | undefined) => {
	if (!value) return null;
	return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};

const isDateWithinInclusiveRange = (currentDate: Date, startDate: Date | null, endDate: Date | null) => {
	const currentKey = toDateOnlyKey(currentDate) as string;
	const startKey = toDateOnlyKey(startDate) ?? '0000-01-01';
	const endKey = toDateOnlyKey(endDate) ?? '9999-12-31';
	return currentKey >= startKey && currentKey <= endKey;
};

const normalizeProductLine = (line: PosProductLineInput, fallbackQty: number | null): NormalizedPosBillLine[] => {
	const productId = toTrimmedString(line.productId);
	if (!productId) return [];

	const lineQuantity = toPositiveInt(line.quantity) ?? fallbackQty;
	const inlineVariations = Array.isArray(line.variations) ? line.variations : [];

	if (inlineVariations.length > 0) {
		return inlineVariations.map((v) => {
			const variationId = toTrimmedString(v.variationId);
			const quantity = toPositiveInt(v.quantity) ?? lineQuantity;
			if (!variationId || !quantity) {
				throw new AppError(400, 'Invalid variation payload', [
					{ field: 'products.variations', message: 'Each variation requires variationId and quantity', code: 'INVALID_VARIATION_LINE' }
				]);
			}

			return {
				productId,
				quantity,
				variationIds: [variationId]
			};
		});
	}

	const singleVariationId = toTrimmedString(line.variationId);
	if (singleVariationId) {
		if (!lineQuantity) {
			throw new AppError(400, 'Invalid quantity', [
				{ field: 'products.quantity', message: 'Quantity must be a positive integer', code: 'INVALID_QUANTITY' }
			]);
		}

		return [{ productId, quantity: lineQuantity, variationIds: [singleVariationId] }];
	}

	const variationIds = toStringArray(line.variationIds);
	if (variationIds.length > 0) {
		const variationQuantities = Array.isArray(line.variationQuantities)
			? line.variationQuantities.map((q) => toPositiveInt(q))
			: [];

		if (variationQuantities.length !== variationIds.length) {
			throw new AppError(400, 'Invalid variation payload', [
				{ field: 'products.variationQuantities', message: 'Variation quantities must be provided for each variationId', code: 'INVALID_VARIATION_QUANTITY' }
			]);
		}

		if (variationQuantities.length === variationIds.length) {
			return variationIds.map((variationId, index) => {
				const quantity = variationQuantities[index];
				if (!quantity) {
					throw new AppError(400, 'Invalid variation quantity', [
						{ field: 'products.variationQuantities', message: 'Variation quantity must be a positive integer', code: 'INVALID_VARIATION_QUANTITY' }
					]);
				}
				return { productId, quantity, variationIds: [variationId] };
			});
		}

		if (!lineQuantity) {
			throw new AppError(400, 'Invalid quantity', [
				{ field: 'products.quantity', message: 'Quantity must be a positive integer', code: 'INVALID_QUANTITY' }
			]);
		}

		return [{ productId, quantity: lineQuantity, variationIds: variationIds.slice().sort() }];
	}

	if (!lineQuantity) {
		throw new AppError(400, 'Invalid quantity', [
			{ field: 'products.quantity', message: 'Quantity must be a positive integer', code: 'INVALID_QUANTITY' }
		]);
	}

	return [{ productId, quantity: lineQuantity, variationIds: [] }];
};

const normalizeCreatePosBillPayload = (payload: CreatePosBillInput) => {
	if (!payload || typeof payload !== 'object') {
		throw new AppError(400, 'Invalid payload', [
			{ field: 'body', message: 'Request body is required', code: 'INVALID_BODY' }
		]);
	}

	const storeId = toTrimmedString(payload.storeId) || null;
	const orderDiscount = normalizeOrderDiscountInput(payload.discountType, payload.discountValue);
	const payments = normalizePaymentLines(payload.payments);

	let lines: NormalizedPosBillLine[] = [];

	if (Array.isArray(payload.products) && payload.products.length > 0) {
		for (const line of payload.products) {
			lines.push(...normalizeProductLine(line, null));
		}
	} else if (Array.isArray(payload.productIds) && payload.productIds.length > 0) {
		const productIds = toStringArray(payload.productIds);
		const quantities = Array.isArray(payload.quantities) ? payload.quantities.map((q) => toPositiveInt(q)) : [];
		const variationIds = toStringArray(payload.variationIds);
		const variationQuantities = Array.isArray(payload.variationQuantities)
			? payload.variationQuantities.map((q) => toPositiveInt(q))
			: [];

		if (productIds.length === 1 && variationIds.length > 0 && variationQuantities.length === variationIds.length) {
			lines = variationIds.map((variationId, index) => {
				const quantity = variationQuantities[index];
				if (!quantity) {
					throw new AppError(400, 'Invalid variation quantity', [
						{ field: 'variationQuantities', message: 'Variation quantity must be a positive integer', code: 'INVALID_VARIATION_QUANTITY' }
					]);
				}
				return { productId: productIds[0], quantity, variationIds: [variationId] };
			});
		} else if (productIds.length === 1 && variationIds.length > 0) {
			throw new AppError(400, 'Invalid variation payload', [
				{ field: 'variationQuantities', message: 'Variation quantities must be provided for each variationId', code: 'INVALID_VARIATION_QUANTITY' }
			]);
		} else {
			lines = productIds.map((productId, index) => {
				const quantity = quantities[index] ?? toPositiveInt(payload.quantity) ?? 1;
				if (!quantity) {
					throw new AppError(400, 'Invalid quantity', [
						{ field: 'quantities', message: 'Quantity must be a positive integer', code: 'INVALID_QUANTITY' }
					]);
				}

				let lineVariationIds: string[] = [];
				if (variationIds.length === productIds.length) {
					lineVariationIds = variationIds[index] ? [variationIds[index]] : [];
				} else if (productIds.length === 1 && variationIds.length > 0) {
					lineVariationIds = variationIds.slice().sort();
				}

				return { productId, quantity, variationIds: lineVariationIds };
			});
		}
	} else {
		lines = normalizeProductLine(
			{
				productId: payload.productId,
				quantity: payload.quantity,
				variationId: payload.variationId,
				variationIds: payload.variationIds,
				variationQuantities: payload.variationQuantities
			},
			null
		);
	}

	if (lines.length === 0) {
		throw new AppError(400, 'No products found in payload', [
			{ field: 'products', message: 'At least one product line is required', code: 'PRODUCTS_REQUIRED' }
		]);
	}

	const grouped = new Map<string, NormalizedPosBillLine>();
	for (const line of lines) {
		const variationIds = line.variationIds.slice().sort();
		const key = `${line.productId}::${variationIds.join(',')}`;
		const existing = grouped.get(key);
		if (existing) {
			existing.quantity += line.quantity;
		} else {
			grouped.set(key, { ...line, variationIds });
		}
	}

	return {
		storeId,
		lines: Array.from(grouped.values()),
		orderDiscount,
		payments
	};
};

const generateInvoiceCandidate = () => {
	const max = 1_000_000_000_000;
	const value = crypto.randomInt(0, max);
	return String(value).padStart(12, '0');
};

const getUniquePosInvoiceNumber = async (tx: Prisma.TransactionClient) => {
	for (let attempt = 0; attempt < 30; attempt += 1) {
		const generated = generateInvoiceCandidate();
		const found = await tx.posOrder.findFirst({ where: { invoiceNumber: generated }, select: { id: true } });
		if (!found) {
			return generated;
		}
	}

	throw new AppError(500, 'Failed to generate invoice number', [
		{ field: 'invoiceNumber', message: 'Could not generate a unique invoice number', code: 'INVOICE_GENERATION_FAILED' }
	]);
};

const decrementStoreStockProducts = async (
	tx: Prisma.TransactionClient,
	storeId: string,
	productId: string,
	requiredQuantity: number
) => {
	const stockProducts = await tx.stockProduct.findMany({
		where: {
			productId,
			deletedAt: null,
			quantity: { gt: 0 },
			stock: {
				storeId,
				deletedAt: null
			}
		},
		orderBy: { createdAt: 'asc' },
		select: {
			id: true,
			stockId: true,
			quantity: true,
			purchasePrice: true,
			totalPrice: true
		}
	});

	const availableQuantity = stockProducts.reduce((sum, item) => sum + item.quantity, 0);
	if (availableQuantity < requiredQuantity) {
		throw new AppError(400, 'Insufficient stock in store', [
			{ field: 'products', message: `Insufficient store stock for product ${productId}`, code: 'INSUFFICIENT_STORE_STOCK' }
		]);
	}

	let remaining = requiredQuantity;

	for (const stockProduct of stockProducts) {
		if (remaining <= 0) break;
		const decrementBy = Math.min(remaining, stockProduct.quantity);
		if (decrementBy <= 0) continue;

		const priceDelta = Number((decrementBy * stockProduct.purchasePrice).toFixed(2));
		const nextTotalPrice = Math.max(0, Number((stockProduct.totalPrice - priceDelta).toFixed(2)));

		await tx.stockProduct.update({
			where: { id: stockProduct.id },
			data: {
				quantity: { decrement: decrementBy },
				totalPrice: nextTotalPrice
			}
		});

		const stockUpdate = await tx.stock.updateMany({
			where: {
				id: stockProduct.stockId,
				totalProductQuantity: { gte: decrementBy },
				grandTotal: { gte: priceDelta }
			},
			data: {
				totalProductQuantity: { decrement: decrementBy },
				grandTotal: { decrement: priceDelta }
			}
		});

		if (stockUpdate.count === 0) {
			throw new AppError(400, 'Stock summary update failed', [
				{ field: 'stocks', message: `Unable to update stock totals for stock ${stockProduct.stockId}`, code: 'STOCK_SUMMARY_UPDATE_FAILED' }
			]);
		}

		remaining -= decrementBy;
	}

	if (remaining > 0) {
		throw new AppError(400, 'Insufficient stock in store', [
			{ field: 'products', message: `Insufficient store stock for product ${productId}`, code: 'INSUFFICIENT_STORE_STOCK' }
		]);
	}
};

const incrementStoreStockProducts = async (
	tx: Prisma.TransactionClient,
	storeId: string,
	productId: string,
	restoredQuantity: number
) => {
	if (restoredQuantity <= 0) return;

	const stockProduct = await tx.stockProduct.findFirst({
		where: {
			productId,
			deletedAt: null,
			stock: {
				storeId,
				deletedAt: null
			}
		},
		orderBy: { createdAt: 'asc' },
		select: {
			id: true,
			stockId: true,
			purchasePrice: true,
			totalPrice: true
		}
	});

	if (!stockProduct) {
		throw new AppError(400, 'Store stock restore failed', [
			{ field: 'products', message: `No active stock bucket found to restore product ${productId} in store ${storeId}`, code: 'STORE_STOCK_RESTORE_FAILED' }
		]);
	}

	const priceDelta = Number((restoredQuantity * stockProduct.purchasePrice).toFixed(2));

	await tx.stockProduct.update({
		where: { id: stockProduct.id },
		data: {
			quantity: { increment: restoredQuantity },
			totalPrice: Number((stockProduct.totalPrice + priceDelta).toFixed(2))
		}
	});

	await tx.stock.update({
		where: { id: stockProduct.stockId },
		data: {
			totalProductQuantity: { increment: restoredQuantity },
			grandTotal: { increment: priceDelta }
		}
	});
};

const loadPosOrderResponse = async (tx: Prisma.TransactionClient, orderId: string, userId?: string) => {
	const createdOrder = await tx.posOrder.findUnique({
		where: { id: orderId },
		select: {
			id: true,
			invoiceNumber: true,
			storeId: true,
			baseAmount: true,
			finalAmount: true,
			paidAmount: true,
			paymentStatus: true,
			orderDiscountType: true,
			orderDiscountValue: true,
			createdAt: true,
			updatedAt: true,
			deletedAt: true,
			userId: true
		}
	});

	if (!createdOrder) {
		throw new AppError(500, 'POS order retrieval failed', [
			{ field: 'order', message: 'Could not load POS order', code: 'POS_ORDER_FETCH_FAILED' }
		]);
	}

	const [store, globalPayments, posOrderItems] = await Promise.all([
		createdOrder.storeId
			? tx.store.findUnique({
				where: { id: createdOrder.storeId },
				select: {
					id: true,
					name: true,
					address: true,
					status: true,
					createdAt: true,
					updatedAt: true,
					deletedAt: true
				}
			})
			: Promise.resolve(null),
		tx.globalPayment.findMany({
			where: {
				posOrderId: createdOrder.id,
				deletedAt: null
			},
			include: {
				bank: {
					select: {
						id: true,
						bankName: true,
						branch: true,
						accountNumber: true
					}
				}
			},
			orderBy: { createdAt: 'asc' }
		}),
		tx.posOrderItem.findMany({
			where: {
				posOrderId: createdOrder.id,
				deletedAt: null
			},
			include: {
				product: {
					select: {
						id: true,
						name: true,
						image: true,
						sku: true
					}
				},
				variations: {
					where: { deletedAt: null },
					include: {
						productVariation: {
							include: {
								attribute: {
									select: {
										id: true,
										name: true
									}
								}
							}
						}
					}
				}
			},
			orderBy: { createdAt: 'asc' }
		})
	]);

	const cashierUser = await tx.user.findUnique({
		where: { id: userId ?? createdOrder.userId },
		select: {
			id: true,
			email: true,
			admins: {
				select: { name: true },
				take: 1
			}
		}
	});

	const items = posOrderItems.map((item) => {
		const lineBaseTotal = Number((item.Baseprice * item.quantity).toFixed(2));
		const lineFinalTotal = Number((item.finalPrice * item.quantity).toFixed(2));

		return {
			id: item.id,
			productId: item.productId,
			productName: item.product.name,
			productImage: item.product.image,
			productSku: item.product.sku,
			quantity: item.quantity,
			unitBasePrice: item.Baseprice,
			unitFinalPrice: item.finalPrice,
			lineBaseTotal,
			lineFinalTotal,
			discountType: item.discountType,
			discountValue: item.discountValue,
			variations: item.variations.map((variation) => ({
				id: variation.productVariation.id,
				attributeId: variation.productVariation.attribute.id,
				attributeName: variation.productVariation.attribute.name,
				attributeValue: variation.productVariation.attributeValue
			}))
		};
	});

	const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
	const totalPaid = toRoundedMoney(createdOrder.paidAmount);
	const dueAmount = Math.max(0, toRoundedMoney(createdOrder.finalAmount - totalPaid));

	return {
		id: createdOrder.id,
		invoiceNumber: createdOrder.invoiceNumber,
		storeId: createdOrder.storeId,
		store,
		paymentStatus: createdOrder.paymentStatus,
		orderDiscountType: createdOrder.orderDiscountType,
		orderDiscountValue: createdOrder.orderDiscountValue,
		cashier: {
			id: cashierUser?.id ?? userId,
			email: cashierUser?.email ?? null,
			name: cashierUser?.admins[0]?.name ?? null
		},
		baseAmount: createdOrder.baseAmount,
		finalAmount: createdOrder.finalAmount,
		paidAmount: createdOrder.paidAmount,
		totalPaid,
		dueAmount,
		createdAt: createdOrder.createdAt,
		updatedAt: createdOrder.updatedAt,
		payments: globalPayments.map((payment) => ({
			id: payment.id,
			amount: payment.amount,
			paymentMethod: payment.paymentMethod,
			bankId: payment.bankId,
			bank: payment.bank,
			createdAt: payment.createdAt
		})),
		globalPayments: globalPayments.map((payment) => ({
			id: payment.id,
			amount: payment.amount,
			paymentMethod: payment.paymentMethod,
			bankId: payment.bankId,
			bank: payment.bank,
			createdAt: payment.createdAt
		})),
		items,
		summary: {
			totalItems: items.length,
			totalQuantity
		}
	};
};

const createBill = async (userId: string, payload: CreatePosBillInput) => {
	const normalized = normalizeCreatePosBillPayload(payload);

	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			const transactionResult = await prisma.$transaction(async (tx) => {
				if (normalized.storeId) {
					const store = await tx.store.findFirst({ where: { id: normalized.storeId, deletedAt: null } });
					if (!store) {
						throw new AppError(404, 'Store not found', [
							{ field: 'storeId', message: 'No active store found with this id', code: 'STORE_NOT_FOUND' }
						]);
					}
				}

				await ensurePaymentBanksExist(tx, normalized.payments);

				const uniqueProductIds = Array.from(new Set(normalized.lines.map((line) => line.productId)));
				const uniqueVariationIds = Array.from(new Set(normalized.lines.flatMap((line) => line.variationIds).filter(Boolean)));

				const products = await tx.product.findMany({
					where: {
						id: { in: uniqueProductIds },
						deletedAt: null
					},
					select: {
						id: true,
						name: true,
						image: true,
						posPrice: true,
						Baseprice: true,
						finalPrice: true,
						discountType: true,
						discountValue: true,
						discountStartDate: true,
						discountEndDate: true,
						stock: true
					}
				});

				if (products.length !== uniqueProductIds.length) {
					const foundIds = new Set(products.map((p) => p.id));
					const missing = uniqueProductIds.filter((id) => !foundIds.has(id));
					throw new AppError(404, 'Some products were not found', [
						{ field: 'products', message: `Missing products: ${missing.join(', ')}`, code: 'PRODUCT_NOT_FOUND' }
					]);
				}

				const variationMap = new Map<string, {
					id: string;
					productId: string;
					basePrice: number;
					finalPrice: number;
					attributeValue: string;
					attribute: { id: string; name: string };
				}>();

				if (uniqueVariationIds.length > 0) {
					const variations = await tx.productVariation.findMany({
						where: {
							id: { in: uniqueVariationIds },
							deletedAt: null
						},
						select: {
							id: true,
							productId: true,
							basePrice: true,
							finalPrice: true,
							attributeValue: true,
							attribute: {
								select: {
									id: true,
									name: true
								}
							}
						}
					});

					if (variations.length !== uniqueVariationIds.length) {
						const foundVariationIds = new Set(variations.map((v) => v.id));
						const missing = uniqueVariationIds.filter((id) => !foundVariationIds.has(id));
						throw new AppError(404, 'Some variations were not found', [
							{ field: 'variationIds', message: `Missing variations: ${missing.join(', ')}`, code: 'VARIATION_NOT_FOUND' }
						]);
					}

					for (const variation of variations) {
						variationMap.set(variation.id, variation);
					}
				}

				const productMap = new Map(products.map((product) => [product.id, product]));
				const now = new Date();

				const processedLines = normalized.lines.map((line) => {
					const product = productMap.get(line.productId);
					if (!product) {
						throw new AppError(404, 'Product not found', [
							{ field: 'products', message: `Product ${line.productId} not found`, code: 'PRODUCT_NOT_FOUND' }
						]);
					}

					if (line.variationIds.length > 0) {
						const selectedVariations = line.variationIds.map((variationId) => {
							const variation = variationMap.get(variationId);
							if (!variation) {
								throw new AppError(404, 'Variation not found', [
									{ field: 'variationIds', message: `Variation ${variationId} not found`, code: 'VARIATION_NOT_FOUND' }
								]);
							}

							if (variation.productId !== product.id) {
								throw new AppError(400, 'Variation does not belong to product', [
									{ field: 'variationIds', message: `Variation ${variationId} does not belong to product ${product.id}`, code: 'VARIATION_PRODUCT_MISMATCH' }
								]);
							}

							return variation;
						});

						const unitBasePrice = Math.max(...selectedVariations.map((variation) => variation.basePrice));
						const unitFinalPrice = Math.max(...selectedVariations.map((variation) => variation.finalPrice));

						return {
							product,
							quantity: line.quantity,
							variationIds: line.variationIds,
							unitBasePrice,
							unitFinalPrice,
							discountType: null as DiscountType | null,
							discountValue: null as number | null,
							lineBaseTotal: Number((unitBasePrice * line.quantity).toFixed(2)),
							lineFinalTotal: Number((unitFinalPrice * line.quantity).toFixed(2))
						};
					}

					const unitBasePrice = product.posPrice ?? product.Baseprice;
					const hasActiveDiscount =
						product.discountType != null &&
						product.discountType !== DiscountType.NONE &&
						product.discountValue != null &&
						isDateWithinInclusiveRange(now, product.discountStartDate, product.discountEndDate);

					const unitFinalPrice = hasActiveDiscount
						? calculateDiscountedPrice(unitBasePrice, product.discountType as DiscountType, product.discountValue as number)
						: unitBasePrice;

					return {
						product,
						quantity: line.quantity,
						variationIds: [] as string[],
						unitBasePrice,
						unitFinalPrice,
						discountType: hasActiveDiscount ? (product.discountType as DiscountType) : DiscountType.NONE,
						discountValue: hasActiveDiscount ? (product.discountValue as number) : 0,
						lineBaseTotal: Number((unitBasePrice * line.quantity).toFixed(2)),
						lineFinalTotal: Number((unitFinalPrice * line.quantity).toFixed(2))
					};
				});

				const perProductQuantity = new Map<string, number>();
				for (const line of processedLines) {
					perProductQuantity.set(line.product.id, (perProductQuantity.get(line.product.id) ?? 0) + line.quantity);
				}

				for (const [productId, totalQuantity] of perProductQuantity.entries()) {
					const product = productMap.get(productId);
					if (!product) continue;
					if (product.stock < totalQuantity) {
						throw new AppError(400, 'Not enough product stock', [
							{ field: 'products', message: `Not enough stock for product ${product.name}`, code: 'INSUFFICIENT_PRODUCT_STOCK' }
						]);
					}

					if (normalized.storeId) {
						const storeStockSummary = await tx.stockProduct.aggregate({
							where: {
								productId,
								deletedAt: null,
								stock: {
									storeId: normalized.storeId,
									deletedAt: null
								}
							},
							_sum: { quantity: true }
						});

						const availableStoreQuantity = storeStockSummary._sum.quantity ?? 0;
						if (availableStoreQuantity < totalQuantity) {
							throw new AppError(400, 'Not enough store stock', [
								{ field: 'products', message: `Store does not have enough stock for product ${product.name}`, code: 'INSUFFICIENT_STORE_STOCK' }
							]);
						}
					}
				}

				const baseAmount = toRoundedMoney(processedLines.reduce((sum, line) => sum + line.lineBaseTotal, 0));
				const subtotalAmount = toRoundedMoney(processedLines.reduce((sum, line) => sum + line.lineFinalTotal, 0));
				const finalAmount = applyOrderDiscount(subtotalAmount, normalized.orderDiscount.discountType, normalized.orderDiscount.discountValue);
				const incomingPaymentTotal = sumPaymentAmounts(normalized.payments);

				if (incomingPaymentTotal > finalAmount) {
					throw new AppError(400, 'Overpayment is not allowed', [
						{ field: 'payments', message: 'Total payment amount cannot exceed order final amount', code: 'OVERPAYMENT_NOT_ALLOWED' }
					]);
				}

				const invoiceNumber = await getUniquePosInvoiceNumber(tx);

				const order = await tx.posOrder.create({
					data: {
						userId,
						storeId: normalized.storeId,
						invoiceNumber,
						baseAmount,
						finalAmount,
						paidAmount: 0,
						orderDiscountType: normalized.orderDiscount.discountType,
						orderDiscountValue: normalized.orderDiscount.discountValue,
						paymentStatus: resolvePaymentStatusFromAmounts(finalAmount, 0)
					}
				});

				for (const line of processedLines) {
					const createdItem = await tx.posOrderItem.create({
						data: {
							posOrderId: order.id,
							productId: line.product.id,
							quantity: line.quantity,
							Baseprice: line.unitBasePrice,
							finalPrice: line.unitFinalPrice,
							discountType: line.discountType,
							discountValue: line.discountValue
						}
					});

					if (line.variationIds.length > 0) {
						await tx.posOrderItemVariation.createMany({
							data: line.variationIds.map((variationId) => ({
								orderItemId: createdItem.id,
								productVariationId: variationId
							}))
						});
					}
				}

				for (const [productId, totalQuantity] of perProductQuantity.entries()) {
					const productUpdate = await tx.product.updateMany({
						where: {
							id: productId,
							stock: { gte: totalQuantity }
						},
						data: {
							stock: { decrement: totalQuantity }
						}
					});

					if (productUpdate.count === 0) {
						throw new AppError(400, 'Product stock update failed', [
							{ field: 'products', message: `Unable to update stock for product ${productId}`, code: 'PRODUCT_STOCK_UPDATE_FAILED' }
						]);
					}

					if (normalized.storeId) {
						await decrementStoreStockProducts(tx, normalized.storeId, productId, totalQuantity);
					}
				}

				const response = await loadPosOrderResponse(tx, order.id, userId);

				return {
					response,
					orderId: order.id
				};
			});

			if (normalized.payments.length > 0) {
				void posPaymentService.enqueuePayments(transactionResult.orderId, normalized.payments).catch(() => undefined);
			}

			return transactionResult.response;
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === 'P2002' &&
				Array.isArray((error as any).meta?.target) &&
				(error as any).meta.target.includes('invoiceNumber')
			) {
				continue;
			}

			throw error;
		}
	}

	throw new AppError(500, 'Failed to generate invoice number', [
		{ field: 'invoiceNumber', message: 'Could not generate a unique invoice number', code: 'INVOICE_GENERATION_FAILED' }
	]);
};

const updateBill = async (orderId: string, userId: string, payload: UpdatePosBillInput) => {
	const normalizedFromPayload = normalizeCreatePosBillPayload(payload);

	const transactionResult = await prisma.$transaction(async (tx) => {
		const existingOrder = await tx.posOrder.findFirst({
			where: {
				id: orderId,
				deletedAt: null
			},
			select: {
				id: true,
				userId: true,
				storeId: true,
				orderDiscountType: true,
				orderDiscountValue: true,
				posOrderItems: {
					where: { deletedAt: null },
					select: {
						id: true,
						productId: true,
						quantity: true
					}
				}
			}
		});

		if (!existingOrder) {
			throw new AppError(404, 'POS order not found', [
				{ field: 'orderId', message: 'No active POS order found with this id', code: 'POS_ORDER_NOT_FOUND' }
			]);
		}

		if (existingOrder.userId !== userId) {
			throw new AppError(403, 'Access denied', [
				{ field: 'orderId', message: 'You are not allowed to update this bill', code: 'BILL_UPDATE_FORBIDDEN' }
			]);
		}

		const hasStoreIdInPayload = Object.prototype.hasOwnProperty.call(payload, 'storeId');
		const nextStoreId = hasStoreIdInPayload
			? (toTrimmedString(payload.storeId) || null)
			: (existingOrder.storeId ?? null);

		const normalized = {
			...normalizedFromPayload,
			storeId: nextStoreId,
			orderDiscount: normalizeOrderDiscountInput(payload.discountType, payload.discountValue, {
				discountType: existingOrder.orderDiscountType,
				discountValue: existingOrder.orderDiscountValue
			})
		};

		if (normalized.storeId) {
			const store = await tx.store.findFirst({ where: { id: normalized.storeId, deletedAt: null } });
			if (!store) {
				throw new AppError(404, 'Store not found', [
					{ field: 'storeId', message: 'No active store found with this id', code: 'STORE_NOT_FOUND' }
				]);
			}
		}

		await ensurePaymentBanksExist(tx, normalized.payments);

		const previousPerProductQuantity = new Map<string, number>();
		for (const item of existingOrder.posOrderItems) {
			previousPerProductQuantity.set(
				item.productId,
				(previousPerProductQuantity.get(item.productId) ?? 0) + item.quantity
			);
		}

		for (const [productId, quantity] of previousPerProductQuantity.entries()) {
			await tx.product.update({
				where: { id: productId },
				data: { stock: { increment: quantity } }
			});

			if (existingOrder.storeId) {
				await incrementStoreStockProducts(tx, existingOrder.storeId, productId, quantity);
			}
		}

		const uniqueProductIds = Array.from(new Set(normalized.lines.map((line) => line.productId)));
		const uniqueVariationIds = Array.from(new Set(normalized.lines.flatMap((line) => line.variationIds).filter(Boolean)));

		const products = await tx.product.findMany({
			where: {
				id: { in: uniqueProductIds },
				deletedAt: null
			},
			select: {
				id: true,
				name: true,
				image: true,
				posPrice: true,
				Baseprice: true,
				finalPrice: true,
				discountType: true,
				discountValue: true,
				discountStartDate: true,
				discountEndDate: true,
				stock: true
			}
		});

		if (products.length !== uniqueProductIds.length) {
			const foundIds = new Set(products.map((p) => p.id));
			const missing = uniqueProductIds.filter((id) => !foundIds.has(id));
			throw new AppError(404, 'Some products were not found', [
				{ field: 'products', message: `Missing products: ${missing.join(', ')}`, code: 'PRODUCT_NOT_FOUND' }
			]);
		}

		const variationMap = new Map<string, {
			id: string;
			productId: string;
			basePrice: number;
			finalPrice: number;
			attributeValue: string;
			attribute: { id: string; name: string };
		}>();

		if (uniqueVariationIds.length > 0) {
			const variations = await tx.productVariation.findMany({
				where: {
					id: { in: uniqueVariationIds },
					deletedAt: null
				},
				select: {
					id: true,
					productId: true,
					basePrice: true,
					finalPrice: true,
					attributeValue: true,
					attribute: {
						select: {
							id: true,
							name: true
						}
					}
				}
			});

			if (variations.length !== uniqueVariationIds.length) {
				const foundVariationIds = new Set(variations.map((v) => v.id));
				const missing = uniqueVariationIds.filter((id) => !foundVariationIds.has(id));
				throw new AppError(404, 'Some variations were not found', [
					{ field: 'variationIds', message: `Missing variations: ${missing.join(', ')}`, code: 'VARIATION_NOT_FOUND' }
				]);
			}

			for (const variation of variations) {
				variationMap.set(variation.id, variation);
			}
		}

		const productMap = new Map(products.map((product) => [product.id, product]));
		const now = new Date();

		const processedLines = normalized.lines.map((line) => {
			const product = productMap.get(line.productId);
			if (!product) {
				throw new AppError(404, 'Product not found', [
					{ field: 'products', message: `Product ${line.productId} not found`, code: 'PRODUCT_NOT_FOUND' }
				]);
			}

			if (line.variationIds.length > 0) {
				const selectedVariations = line.variationIds.map((variationId) => {
					const variation = variationMap.get(variationId);
					if (!variation) {
						throw new AppError(404, 'Variation not found', [
							{ field: 'variationIds', message: `Variation ${variationId} not found`, code: 'VARIATION_NOT_FOUND' }
						]);
					}

					if (variation.productId !== product.id) {
						throw new AppError(400, 'Variation does not belong to product', [
							{ field: 'variationIds', message: `Variation ${variationId} does not belong to product ${product.id}`, code: 'VARIATION_PRODUCT_MISMATCH' }
						]);
					}

					return variation;
				});

				const unitBasePrice = Math.max(...selectedVariations.map((variation) => variation.basePrice));
				const unitFinalPrice = Math.max(...selectedVariations.map((variation) => variation.finalPrice));

				return {
					product,
					quantity: line.quantity,
					variationIds: line.variationIds,
					unitBasePrice,
					unitFinalPrice,
					discountType: null as DiscountType | null,
					discountValue: null as number | null,
					lineBaseTotal: Number((unitBasePrice * line.quantity).toFixed(2)),
					lineFinalTotal: Number((unitFinalPrice * line.quantity).toFixed(2))
				};
			}

			const unitBasePrice = product.posPrice ?? product.Baseprice;
			const hasActiveDiscount =
				product.discountType != null &&
				product.discountType !== DiscountType.NONE &&
				product.discountValue != null &&
				isDateWithinInclusiveRange(now, product.discountStartDate, product.discountEndDate);

			const unitFinalPrice = hasActiveDiscount
				? calculateDiscountedPrice(unitBasePrice, product.discountType as DiscountType, product.discountValue as number)
				: unitBasePrice;

			return {
				product,
				quantity: line.quantity,
				variationIds: [] as string[],
				unitBasePrice,
				unitFinalPrice,
				discountType: hasActiveDiscount ? (product.discountType as DiscountType) : DiscountType.NONE,
				discountValue: hasActiveDiscount ? (product.discountValue as number) : 0,
				lineBaseTotal: Number((unitBasePrice * line.quantity).toFixed(2)),
				lineFinalTotal: Number((unitFinalPrice * line.quantity).toFixed(2))
			};
		});

		const perProductQuantity = new Map<string, number>();
		for (const line of processedLines) {
			perProductQuantity.set(line.product.id, (perProductQuantity.get(line.product.id) ?? 0) + line.quantity);
		}

		for (const [productId, totalQuantity] of perProductQuantity.entries()) {
			const product = productMap.get(productId);
			if (!product) continue;

			if (product.stock < totalQuantity) {
				throw new AppError(400, 'Not enough product stock', [
					{ field: 'products', message: `Not enough stock for product ${product.name}`, code: 'INSUFFICIENT_PRODUCT_STOCK' }
				]);
			}

			if (normalized.storeId) {
				const storeStockSummary = await tx.stockProduct.aggregate({
					where: {
						productId,
						deletedAt: null,
						stock: {
							storeId: normalized.storeId,
							deletedAt: null
						}
					},
					_sum: { quantity: true }
				});

				const availableStoreQuantity = storeStockSummary._sum.quantity ?? 0;
				if (availableStoreQuantity < totalQuantity) {
					throw new AppError(400, 'Not enough store stock', [
						{ field: 'products', message: `Store does not have enough stock for product ${product.name}`, code: 'INSUFFICIENT_STORE_STOCK' }
					]);
				}
			}
		}

		await tx.posOrderItemVariation.deleteMany({
			where: {
				orderItem: {
					posOrderId: existingOrder.id
				}
			}
		});

		await tx.posOrderItem.deleteMany({
			where: {
				posOrderId: existingOrder.id
			}
		});

		for (const line of processedLines) {
			const createdItem = await tx.posOrderItem.create({
				data: {
					posOrderId: existingOrder.id,
					productId: line.product.id,
					quantity: line.quantity,
					Baseprice: line.unitBasePrice,
					finalPrice: line.unitFinalPrice,
					discountType: line.discountType,
					discountValue: line.discountValue
				}
			});

			if (line.variationIds.length > 0) {
				await tx.posOrderItemVariation.createMany({
					data: line.variationIds.map((variationId) => ({
						orderItemId: createdItem.id,
						productVariationId: variationId
					}))
				});
			}
		}

		for (const [productId, totalQuantity] of perProductQuantity.entries()) {
			const productUpdate = await tx.product.updateMany({
				where: {
					id: productId,
					stock: { gte: totalQuantity }
				},
				data: {
					stock: { decrement: totalQuantity }
				}
			});

			if (productUpdate.count === 0) {
				throw new AppError(400, 'Product stock update failed', [
					{ field: 'products', message: `Unable to update stock for product ${productId}`, code: 'PRODUCT_STOCK_UPDATE_FAILED' }
				]);
			}

			if (normalized.storeId) {
				await decrementStoreStockProducts(tx, normalized.storeId, productId, totalQuantity);
			}
		}

		const baseAmount = toRoundedMoney(processedLines.reduce((sum, line) => sum + line.lineBaseTotal, 0));
		const subtotalAmount = toRoundedMoney(processedLines.reduce((sum, line) => sum + line.lineFinalTotal, 0));
		const finalAmount = applyOrderDiscount(subtotalAmount, normalized.orderDiscount.discountType, normalized.orderDiscount.discountValue);

		const paidAggregate = await tx.globalPayment.aggregate({
			where: {
				posOrderId: existingOrder.id,
				deletedAt: null
			},
			_sum: {
				amount: true
			}
		});

		const existingPaidAmount = toRoundedMoney(paidAggregate._sum.amount ?? 0);
		const incomingPaymentTotal = sumPaymentAmounts(normalized.payments);

		if (existingPaidAmount > finalAmount) {
			throw new AppError(400, 'Overpayment is not allowed', [
				{ field: 'payments', message: 'Existing paid amount is greater than the updated order total', code: 'OVERPAYMENT_NOT_ALLOWED' }
			]);
		}

		if (toRoundedMoney(existingPaidAmount + incomingPaymentTotal) > finalAmount) {
			throw new AppError(400, 'Overpayment is not allowed', [
				{ field: 'payments', message: 'Total payment amount cannot exceed order final amount', code: 'OVERPAYMENT_NOT_ALLOWED' }
			]);
		}

		await tx.posOrder.update({
			where: { id: existingOrder.id },
			data: {
				storeId: normalized.storeId,
				baseAmount,
				finalAmount,
				paidAmount: existingPaidAmount,
				orderDiscountType: normalized.orderDiscount.discountType,
				orderDiscountValue: normalized.orderDiscount.discountValue,
				paymentStatus: resolvePaymentStatusFromAmounts(finalAmount, existingPaidAmount)
			}
		});

		const response = await loadPosOrderResponse(tx, existingOrder.id, userId);

		return {
			response,
			orderId: existingOrder.id,
			payments: normalized.payments
		};
	});

	if (transactionResult.payments.length > 0) {
		void posPaymentService.enqueuePayments(transactionResult.orderId, transactionResult.payments).catch(() => undefined);
	}

	return transactionResult.response;
};

const addBillPayments = async (orderId: string, userId: string, payload: { payments?: unknown }) => {
	const payments = normalizePaymentLines(payload?.payments);

	if (payments.length === 0) {
		throw new AppError(400, 'No payments provided', [
			{ field: 'payments', message: 'At least one payment record is required', code: 'PAYMENTS_REQUIRED' }
		]);
	}

	const queuePayload = await prisma.$transaction(async (tx) => {
		const order = await tx.posOrder.findFirst({
			where: {
				id: orderId,
				deletedAt: null
			},
			select: {
				id: true,
				userId: true,
				finalAmount: true,
				paidAmount: true,
				paymentStatus: true
			}
		});

		if (!order) {
			throw new AppError(404, 'POS order not found', [
				{ field: 'orderId', message: 'No active POS order found with this id', code: 'POS_ORDER_NOT_FOUND' }
			]);
		}

		if (order.userId !== userId) {
			throw new AppError(403, 'Access denied', [
				{ field: 'orderId', message: 'You are not allowed to add payments to this bill', code: 'BILL_UPDATE_FORBIDDEN' }
			]);
		}

		await ensurePaymentBanksExist(tx, payments);

		const paidAggregate = await tx.globalPayment.aggregate({
			where: {
				posOrderId: order.id,
				deletedAt: null
			},
			_sum: {
				amount: true
			}
		});

		const existingPaidAmount = toRoundedMoney(paidAggregate._sum.amount ?? 0);
		const incomingPaymentTotal = sumPaymentAmounts(payments);

		if (existingPaidAmount >= order.finalAmount) {
			throw new AppError(400, 'Order is already fully paid', [
				{ field: 'payments', message: 'No more payments can be added to this order', code: 'ORDER_ALREADY_PAID' }
			]);
		}

		if (toRoundedMoney(existingPaidAmount + incomingPaymentTotal) > order.finalAmount) {
			throw new AppError(400, 'Overpayment is not allowed', [
				{ field: 'payments', message: 'Total payment amount cannot exceed order final amount', code: 'OVERPAYMENT_NOT_ALLOWED' }
			]);
		}

		return {
			orderId: order.id,
			payments,
			existingPaidAmount,
			incomingPaymentTotal,
			finalAmount: order.finalAmount,
			paidAmount: order.paidAmount,
			paymentStatus: order.paymentStatus
		};
	});

	await posPaymentService.enqueuePayments(queuePayload.orderId, queuePayload.payments);

	return {
		orderId: queuePayload.orderId,
		queuedPayments: queuePayload.payments.length,
		paymentStatus: queuePayload.paymentStatus,
		finalAmount: queuePayload.finalAmount,
		totalPaid: queuePayload.existingPaidAmount,
		incomingAmount: queuePayload.incomingPaymentTotal,
		dueAmount: toRoundedMoney(queuePayload.finalAmount - queuePayload.existingPaidAmount)
	};
};

const deleteBillPayment = async (orderId: string, paymentId: string, userId: string) => {
	const deletedPayment = await prisma.$transaction(async (tx) => {
		const order = await tx.posOrder.findFirst({
			where: {
				id: orderId,
				deletedAt: null
			},
			select: {
				id: true,
				userId: true
			}
		});

		if (!order) {
			throw new AppError(404, 'POS order not found', [
				{ field: 'orderId', message: 'No active POS order found with this id', code: 'POS_ORDER_NOT_FOUND' }
			]);
		}

		if (order.userId !== userId) {
			throw new AppError(403, 'Access denied', [
				{ field: 'orderId', message: 'You are not allowed to delete payment records for this bill', code: 'BILL_UPDATE_FORBIDDEN' }
			]);
		}

		const payment = await tx.globalPayment.findFirst({
			where: {
				id: paymentId,
				posOrderId: order.id,
				deletedAt: null
			},
			select: {
				id: true,
				amount: true,
				paymentMethod: true,
				bankId: true,
				createdAt: true,
				updatedAt: true
			}
		});

		if (!payment) {
			throw new AppError(404, 'Payment not found', [
				{ field: 'paymentId', message: 'No active payment record found for this order', code: 'PAYMENT_NOT_FOUND' }
			]);
		}

		await tx.globalPayment.delete({
			where: { id: payment.id }
		});

		return payment;
	});

	void posPaymentService.enqueuePaymentStatusRecalculation(orderId).catch(() => undefined);

	return deletedPayment;
};

const deleteBill = async (orderId: string, userId: string) => {
	return prisma.$transaction(async (tx) => {
		const existingOrder = await tx.posOrder.findFirst({
			where: {
				id: orderId,
				deletedAt: null
			},
			select: {
				id: true,
				userId: true,
				storeId: true,
				invoiceNumber: true,
				paidAmount: true,
				posOrderItems: {
					where: { deletedAt: null },
					select: {
						id: true,
						productId: true,
						quantity: true
					}
				}
			}
		});

		if (!existingOrder) {
			throw new AppError(404, 'POS order not found', [
				{ field: 'orderId', message: 'No active POS order found with this id', code: 'POS_ORDER_NOT_FOUND' }
			]);
		}

		if (existingOrder.userId !== userId) {
			throw new AppError(403, 'Access denied', [
				{ field: 'orderId', message: 'You are not allowed to delete this bill', code: 'BILL_DELETE_FORBIDDEN' }
			]);
		}

		const perProductQuantity = new Map<string, number>();
		for (const item of existingOrder.posOrderItems) {
			perProductQuantity.set(
				item.productId,
				(perProductQuantity.get(item.productId) ?? 0) + item.quantity
			);
		}

		for (const [productId, quantity] of perProductQuantity.entries()) {
			await tx.product.update({
				where: { id: productId },
				data: { stock: { increment: quantity } }
			});

			if (existingOrder.storeId) {
				await incrementStoreStockProducts(tx, existingOrder.storeId, productId, quantity);
			}
		}

		const deletedAt = new Date();

		await tx.posOrderItemVariation.updateMany({
			where: {
				deletedAt: null,
				orderItem: {
					posOrderId: existingOrder.id,
					deletedAt: null
				}
			},
			data: {
				deletedAt
			}
		});

		await tx.posOrderItem.updateMany({
			where: {
				posOrderId: existingOrder.id,
				deletedAt: null
			},
			data: {
				deletedAt
			}
		});

		await tx.posOrder.update({
			where: { id: existingOrder.id },
			data: {
				deletedAt
			}
		});

		return {
			id: existingOrder.id,
			invoiceNumber: existingOrder.invoiceNumber,
			deletedAt
		};
	});
};

export const posService = {
	getBills,
	getBill,
	getProducts,
	createBill,
	updateBill,
	addBillPayments,
	deleteBillPayment,
	deleteBill
};