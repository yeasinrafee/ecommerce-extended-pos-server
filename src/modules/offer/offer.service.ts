import type { DiscountType, Prisma, Status } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import type { BulkUpdateOfferStatusDto, CreateOfferDto, OfferListQuery, UpdateOfferDto } from './offer.types.js';

const offerInclude: Prisma.OfferInclude = {
	offerProducts: {
		where: {
			deletedAt: null
		},
		include: {
			product: true
		}
	}
};

const normalizeIds = (values: string[]) => Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean)));

const toDateKey = (value: Date | null | undefined) => value ? value.toISOString().slice(0, 10) : null;

const formatDateOnly = (value: Date | null | undefined) => toDateKey(value) ?? 'no date';

const rangesOverlap = (
	leftStart: Date | null | undefined,
	leftEnd: Date | null | undefined,
	rightStart: Date | null | undefined,
	rightEnd: Date | null | undefined
) => {
	const leftStartKey = toDateKey(leftStart) ?? '0000-01-01';
	const leftEndKey = toDateKey(leftEnd) ?? '9999-12-31';
	const rightStartKey = toDateKey(rightStart) ?? '0000-01-01';
	const rightEndKey = toDateKey(rightEnd) ?? '9999-12-31';

	return leftStartKey <= rightEndKey && rightStartKey <= leftEndKey;
};

const resolveOfferDiscount = (
	payload: { discountType?: DiscountType | null; discountValue?: number | null; discountStartDate?: Date | null; discountEndDate?: Date | null; status?: Status },
	existing?: { discountType: DiscountType | null; discountValue: number | null; discountStartDate: Date | null; discountEndDate: Date | null; status: Status }
) => {
	const discountType = payload.discountType !== undefined ? payload.discountType : existing?.discountType ?? null;
	const discountValue = payload.discountValue !== undefined ? payload.discountValue : existing?.discountValue ?? null;
	const discountStartDate = payload.discountStartDate !== undefined ? payload.discountStartDate : existing?.discountStartDate ?? null;
	const discountEndDate = payload.discountEndDate !== undefined ? payload.discountEndDate : existing?.discountEndDate ?? null;
	const status = payload.status !== undefined ? payload.status : existing?.status ?? 'ACTIVE';

	if (discountType !== null && discountType !== 'NONE' && discountValue == null) {
		throw new AppError(400, 'Please add a discount value', [
			{ message: 'Choose a discount value because the discount type is not NONE.', code: 'DISCOUNT_VALUE_REQUIRED' }
		]);
	}

	if (discountStartDate && discountEndDate && discountEndDate < discountStartDate) {
		throw new AppError(400, 'Please fix the discount dates', [
			{ message: 'The end date must be the same as or later than the start date.', code: 'INVALID_DISCOUNT_RANGE' }
		]);
	}

	return {
		discountType,
		discountValue: discountType === null || discountType === 'NONE' ? null : discountValue,
		discountStartDate,
		discountEndDate,
		status
	};
};

const validateOfferProductConflicts = async (
	tx: Prisma.TransactionClient,
	params: {
		offerId?: string;
		productIds: string[];
		status: Status;
		discountStartDate: Date | null;
		discountEndDate: Date | null;
	}
) => {
	if (params.status !== 'ACTIVE' || params.productIds.length === 0) {
		return;
	}

	const candidates = await tx.offerProduct.findMany({
		where: {
			deletedAt: null,
			productId: { in: params.productIds },
			...(params.offerId ? { offerId: { not: params.offerId } } : {}),
			offer: {
				deletedAt: null,
				status: 'ACTIVE',
				...(params.offerId ? { id: { not: params.offerId } } : {})
			}
		},
		select: {
			productId: true,
			product: {
				select: {
					name: true
				}
			},
			offerId: true,
			offer: {
				select: {
					id: true,
					status: true,
					discountStartDate: true,
					discountEndDate: true
				}
			}
		}
	});

	if (candidates.length === 0) {
		return;
	}

	const conflictingProducts = new Map<string, string[]>();

	for (const candidate of candidates) {
		if (!rangesOverlap(params.discountStartDate, params.discountEndDate, candidate.offer.discountStartDate, candidate.offer.discountEndDate)) {
			continue;
		}

		const existing = conflictingProducts.get(candidate.productId) ?? [];
		existing.push(`${candidate.product.name} | ${formatDateOnly(candidate.offer.discountStartDate)} to ${formatDateOnly(candidate.offer.discountEndDate)}`);
		conflictingProducts.set(candidate.productId, existing);
	}

	if (conflictingProducts.size > 0) {
		throw new AppError(400, 'Offer overlaps with an active offer', Array.from(conflictingProducts.entries()).map(([, conflicts]) => ({
			message: `This product is already included in another active offer for an overlapping date range: ${conflicts.join(', ')}. To continue, change the dates, keep one offer inactive, or remove the product from one of the offers.`,
			code: 'OFFER_OVERLAP_CONFLICT'
		})));
	}
};

const ensureProductsCanBeAddedToOffer = async (tx: Prisma.TransactionClient, productIds: string[]) => {
	const products = await tx.product.findMany({
		where: {
			id: { in: productIds },
			deletedAt: null
		},
		select: {
			id: true,
			name: true,
			discountType: true
		}
	});

	if (products.length !== productIds.length) {
		throw new AppError(404, 'Some products could not be found', [
			{ message: 'One or more selected products do not exist, were removed, or are no longer available.', code: 'PRODUCT_NOT_FOUND' }
		]);
	}

	const blockedProducts = products.filter((product) => product.discountType !== null && product.discountType !== 'NONE');

	if (blockedProducts.length > 0) {
		throw new AppError(400, 'One or more products cannot be added to this offer', blockedProducts.map((product) => ({
			message: `"${product.name}" already has its own discount. Remove the product discount first, or keep this product out of the offer.`,
			code: 'PRODUCT_DISCOUNT_CONFLICT'
		})));
	}

	return products;
};

const syncOfferProducts = async (tx: Prisma.TransactionClient, offerId: string, productIds: string[]) => {
	const desiredIds = normalizeIds(productIds);
	const existingRelations = await tx.offerProduct.findMany({
		where: {
			offerId,
			productId: { in: desiredIds }
		},
		select: {
			productId: true,
			deletedAt: true
		}
	});

	const activeRelationIds = new Set(existingRelations.filter((relation) => relation.deletedAt === null).map((relation) => relation.productId));
	const softDeletedRelationIds = new Set(existingRelations.filter((relation) => relation.deletedAt !== null).map((relation) => relation.productId));
	const idsToCreate = desiredIds.filter((productId) => !activeRelationIds.has(productId) && !softDeletedRelationIds.has(productId));
	const idsToRevive = desiredIds.filter((productId) => softDeletedRelationIds.has(productId));

	if (idsToRevive.length > 0) {
		await tx.offerProduct.updateMany({
			where: {
				offerId,
				productId: { in: idsToRevive }
			},
			data: {
				deletedAt: null
			}
		});
	}

	if (idsToCreate.length > 0) {
		await tx.offerProduct.createMany({
			data: idsToCreate.map((productId) => ({
				offerId,
				productId
			}))
		});
	}

	if (desiredIds.length > 0) {
		await tx.offerProduct.updateMany({
			where: {
				offerId,
				productId: { in: desiredIds }
			},
			data: {
				deletedAt: null
			}
		});
	}

	await tx.offerProduct.updateMany({
		where: {
			offerId,
			deletedAt: null,
			productId: { notIn: desiredIds }
		},
		data: {
			deletedAt: new Date()
		}
	});
};

const getOffers = async ({ page = 1, limit = 10 }: OfferListQuery = {}) => {
	const skip = (page - 1) * limit;
	const where: Prisma.OfferWhereInput = {
		deletedAt: null
	};

	const [data, total] = await Promise.all([
		prisma.offer.findMany({
			where,
			skip,
			take: limit,
			orderBy: { createdAt: 'desc' },
			include: offerInclude
		}),
		prisma.offer.count({ where })
	]);

	return {
		data,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.max(1, Math.ceil(total / limit))
		}
	};
};

const getAllOffers = async () => {
	return prisma.offer.findMany({
		where: {
			deletedAt: null
		},
		orderBy: { createdAt: 'desc' },
		include: offerInclude
	});
};

const getOfferById = async (id: string) => {
	return prisma.offer.findFirst({
		where: {
			id,
			deletedAt: null
		},
		include: offerInclude
	});
};

const createOffer = async (payload: CreateOfferDto) => {
	const productIds = normalizeIds(payload.productIds);

	if (productIds.length === 0) {
		throw new AppError(400, 'Please select at least one product', [
			{ message: 'An offer needs one or more products before it can be saved.', code: 'PRODUCTS_REQUIRED' }
		]);
	}

	return prisma.$transaction(async (tx) => {
		await ensureProductsCanBeAddedToOffer(tx, productIds);
		const discount = resolveOfferDiscount(payload);
		await validateOfferProductConflicts(tx, {
			productIds,
			status: discount.status,
			discountStartDate: discount.discountStartDate,
			discountEndDate: discount.discountEndDate
		});

		const created = await tx.offer.create({
			data: {
				discountType: discount.discountType,
				discountValue: discount.discountValue,
				discountStartDate: discount.discountStartDate,
				discountEndDate: discount.discountEndDate,
				status: discount.status
			}
		});

		await tx.offerProduct.createMany({
			data: productIds.map((productId) => ({
				offerId: created.id,
				productId
			}))
		});

		return tx.offer.findFirst({
			where: {
				id: created.id,
				deletedAt: null
			},
			include: offerInclude
		});
	});
};

const updateOffer = async (id: string, payload: UpdateOfferDto) => {
	return prisma.$transaction(async (tx) => {
		const existing = await tx.offer.findFirst({
			where: {
				id,
				deletedAt: null
			},
			select: {
				id: true,
				discountType: true,
				discountValue: true,
				discountStartDate: true,
				discountEndDate: true,
				status: true
			}
		});

		if (!existing) {
			throw new AppError(404, 'Offer not found', [
				{ message: 'We could not find an active offer with that id. Please refresh and try again.', code: 'OFFER_NOT_FOUND' }
			]);
		}

		const discount = resolveOfferDiscount(payload, existing);
		const productIds = payload.productIds !== undefined
			? normalizeIds(payload.productIds)
			: await tx.offerProduct.findMany({
				where: {
					offerId: id,
					deletedAt: null
				},
				select: {
					productId: true
					}
			}).then((rows) => Array.from(new Set(rows.map((row) => row.productId))));

		if (payload.productIds !== undefined && productIds.length === 0) {
			throw new AppError(400, 'Please select at least one product', [
				{ message: 'An offer needs one or more products before it can be saved.', code: 'PRODUCTS_REQUIRED' }
			]);
		}

		await ensureProductsCanBeAddedToOffer(tx, productIds);
		await validateOfferProductConflicts(tx, {
			offerId: id,
			productIds,
			status: discount.status,
			discountStartDate: discount.discountStartDate,
			discountEndDate: discount.discountEndDate
		});

		if (payload.productIds !== undefined) {
			await syncOfferProducts(tx, id, productIds);
		}

		await tx.offer.update({
			where: {
				id
			},
			data: {
				discountType: discount.discountType,
				discountValue: discount.discountValue,
				discountStartDate: discount.discountStartDate,
				discountEndDate: discount.discountEndDate,
				status: discount.status
			}
		});

		return tx.offer.findFirst({
			where: {
				id,
				deletedAt: null
			},
			include: offerInclude
		});
	});
};

const deleteOffer = async (id: string) => {
	return prisma.$transaction(async (tx) => {
		const existing = await tx.offer.findFirst({
			where: {
				id,
				deletedAt: null
			},
			select: {
				id: true
			}
		});

		if (!existing) {
			throw new AppError(404, 'Offer not found', [
				{ message: 'We could not find an active offer with that id. Please refresh and try again.', code: 'OFFER_NOT_FOUND' }
			]);
		}

		await tx.offerProduct.updateMany({
			where: {
				offerId: id,
				deletedAt: null
			},
			data: {
				deletedAt: new Date()
			}
		});

		await tx.offer.update({
			where: {
				id
			},
			data: {
				deletedAt: new Date()
			}
		});

		return true;
	});
};

const bulkUpdateStatus = async (payload: BulkUpdateOfferStatusDto) => {
	const ids = normalizeIds(payload.ids);

	if (ids.length === 0) {
		throw new AppError(400, 'Please select at least one offer', [
			{ message: 'Select one or more offers before updating their status.', code: 'OFFERS_REQUIRED' }
		]);
	}

	return prisma.$transaction(async (tx) => {
		const existing = await tx.offer.findMany({
			where: {
				id: { in: ids },
				deletedAt: null
			},
			select: { id: true }
		});

		if (existing.length !== ids.length) {
			throw new AppError(404, 'Some offers could not be found', [
				{ message: 'One or more selected offers no longer exist or were already removed.', code: 'OFFER_NOT_FOUND' }
			]);
		}

		const result = await tx.offer.updateMany({
			where: {
				id: { in: ids },
				deletedAt: null
			},
			data: {
				status: payload.status
			}
		});

		return result.count;
	});
};

export const offerService = {
	getOffers,
	getAllOffers,
	getOfferById,
	createOffer,
	updateOffer,
	deleteOffer,
	bulkUpdateStatus
};
