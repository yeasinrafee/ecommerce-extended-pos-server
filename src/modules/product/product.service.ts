import { prisma } from '../../config/prisma.js';
import toSlug from '../../common/utils/slug.js';
import { toUpperUnderscore } from '../../common/utils/format.js';
import { AppError } from '../../common/errors/app-error.js';
import type { Prisma } from '@prisma/client';
import type { CreateProductDto, UpdateProductDto, PatchProductDto, BulkPatchProductDto, ProductListQuery } from './product.types.js';

const offerProductInclude = {
	offerProducts: {
		include: {
			offer: true
		}
	}
};

const getDateOnlyKey = (value: Date | null | undefined) => {
	if (!value) {
		return null;
	}

	return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};

const isDateWithinRange = (current: Date, startDate: Date | null, endDate: Date | null) => {
	const currentKey = getDateOnlyKey(current) as string;
	const startKey = getDateOnlyKey(startDate) ?? '0000-01-01';
	const endKey = getDateOnlyKey(endDate) ?? '9999-12-31';

	return currentKey >= startKey && currentKey <= endKey;
};

const getInactiveOfferPayload = () => ({
	id: null,
	discountType: 'NONE' as const,
	discountValue: null,
	discountStartDate: null,
	discountEndDate: null,
	finalPrice: null,
	status: 'INACTIVE' as const
});

const getResolvedOfferPayload = (offer: {
	id: string;
	discountType: any;
	discountValue: number | null;
	discountStartDate: Date | null;
	discountEndDate: Date | null;
	status: 'ACTIVE' | 'INACTIVE';
	finalPrice?: number | null;
}) => ({
	id: offer.id,
	discountType: offer.discountType,
	discountValue: offer.discountValue,
	discountStartDate: offer.discountStartDate,
	discountEndDate: offer.discountEndDate,
	finalPrice: offer.finalPrice ?? null,
	status: offer.status
});

const calculateOfferFinalPrice = (basePrice: number, discountType: string, discountValue: number | null) => {
	if (discountType === 'FLAT_DISCOUNT') {
		return Math.max(0, basePrice - (discountValue ?? 0));
	}

	if (discountType === 'PERCENTAGE_DISCOUNT') {
		return Math.max(0, basePrice - basePrice * ((discountValue ?? 0) / 100));
	}

	return basePrice;
};

const attachOfferDetails = (products: any[]) => {
	const now = new Date();

	return products.map((product) => {
		const offerRelations = Array.isArray(product.offerProducts) ? product.offerProducts : [];
		const activeOffer = offerRelations
			.map((item: any) => item.offer)
			.find((offer: any) => offer && offer.status === 'ACTIVE' && isDateWithinRange(now, offer.discountStartDate, offer.discountEndDate));

		const resolvedOffer = activeOffer
			? getResolvedOfferPayload({
				...activeOffer,
				finalPrice: calculateOfferFinalPrice(product.Baseprice, activeOffer.discountType, activeOffer.discountValue)
			})
			: offerRelations.length > 0
				? getInactiveOfferPayload()
				: null;
		const { offerProducts, ...rest } = product;

		if (!resolvedOffer) {
			return rest;
		}

		return {
			...rest,
			discountType: resolvedOffer.discountType,
			discountValue: resolvedOffer.discountValue,
			discountStartDate: resolvedOffer.discountStartDate,
			discountEndDate: resolvedOffer.discountEndDate,
			finalPrice: resolvedOffer.finalPrice,
			offer: resolvedOffer
		};
	});
};

const generateUniqueSlugTx = async (tx: Prisma.TransactionClient, name: string) => {
	const base = toSlug(name);
	let slug = base;
	let counter = 1;

	while (true) {
		const found = await tx.product.findFirst({
			where: { slug, deletedAt: null, status: 'ACTIVE' },
			select: { id: true }
		});
		if (!found) {
			return slug;
		}
		slug = `${base}-${counter++}`;
	}
};

const calculateFinalPrice = (basePrice: number, discountType: CreateProductDto['discountType'], discountValue?: number | null) => {
	const value = discountValue ?? 0;

	switch (discountType) {
		case 'FLAT_DISCOUNT':
			return Math.max(0, basePrice - value);
		case 'PERCENTAGE_DISCOUNT':
			return Math.max(0, basePrice - basePrice * (value / 100));
		default:
			return basePrice;
	}
};

const parseVariantPrice = (val: unknown, fallback: number) => {
	if (val === null || val === undefined) return fallback;
	if (typeof val === 'number' && Number.isFinite(val)) return val;
	if (typeof val === 'string') {
 		const t = val.trim();
 		if (t === '') return fallback;
 		const n = Number(t);
 		return Number.isFinite(n) ? n : fallback;
 	}

	return fallback;
};

const createProduct = async (payload: CreateProductDto) => {
	return prisma.$transaction(async (tx) => {
		if (payload.brandId) {
			const brand = await tx.brand.findUnique({ where: { id: payload.brandId }, select: { id: true } });
			if (!brand) {
				throw new AppError(400, 'Brand not found', [
					{ message: 'Provided brandId does not match any brand', code: 'BRAND_NOT_FOUND' }
				]);
			}
		}

		if (payload.sku) {
			const existingSku = await tx.product.findFirst({
				where: { sku: payload.sku, deletedAt: null, status: 'ACTIVE' },
				select: { id: true }
			});
			if (existingSku) {
				throw new AppError(400, 'SKU already exists', [
					{ message: 'Another product uses the provided SKU', code: 'SKU_CONFLICT' }
				]);
			}
		}

		const categoryIds = Array.from(new Set(payload.categoryIds));
		const tagIds = Array.from(new Set(payload.tagIds ?? []));

		const [categories, tags] = await Promise.all([
			tx.productCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true } }),
			tx.productTag.findMany({ where: { id: { in: tagIds } }, select: { id: true } })
		]);

		if (categories.length !== categoryIds.length) {
			throw new AppError(400, 'Invalid categories', [
				{ message: 'One or more selected categories do not exist', code: 'CATEGORY_NOT_FOUND' }
			]);
		}

		if (tags.length !== tagIds.length) {
			throw new AppError(400, 'Invalid tags', [
				{ message: 'One or more selected tags do not exist', code: 'TAG_NOT_FOUND' }
			]);
		}

		const attributeNames = Array.from(new Set(payload.attributes.map((attribute) => attribute.name.trim()).filter(Boolean)));
		const attributeRecords = attributeNames.length > 0
			? await tx.attribute.findMany({
				where: {
					OR: attributeNames.map((name) => ({
						name: { equals: name, mode: 'insensitive' }
					}))
				},
				select: { id: true, name: true }
			})
			: [];

		const normalizedAttributeMap = new Map(attributeRecords.map((attribute) => [
			toUpperUnderscore(attribute.name),
			{ id: attribute.id, name: attribute.name }
		]));

		for (const name of attributeNames) {
			const normalizedName = toUpperUnderscore(name);
			if (!normalizedAttributeMap.has(normalizedName)) {
				const slug = toSlug(name);
				const createdAttribute = await tx.attribute.create({ data: { name, slug, values: [] } });
				normalizedAttributeMap.set(normalizedName, { id: createdAttribute.id, name: createdAttribute.name });
			}
		}

		const attributeMap = new Map(Array.from(normalizedAttributeMap.entries()).map(([key, value]) => [key, value.id]));
		const slug = await generateUniqueSlugTx(tx, payload.name);
		const volume = payload.length != null && payload.width != null && payload.height != null
			? payload.length * payload.width * payload.height
			: null;
		const finalPrice = calculateFinalPrice(payload.basePrice, payload.discountType, payload.discountValue);

		const created = await tx.product.create({
			data: {
				name: payload.name,
				slug,
				shortDescription: payload.shortDescription ?? null,
				description: payload.description,
				Baseprice: payload.basePrice,
				posPrice: payload.posPrice ?? null,
				finalPrice,
				discountType: payload.discountType,
				discountValue: payload.discountType === 'NONE' ? null : payload.discountValue ?? null,
				stock: payload.stock,
				weight: payload.weight ?? null,
				length: payload.length ?? null,
				width: payload.width ?? null,
				height: payload.height ?? null,
				volume,
				sku: payload.sku ?? null,
				discountStartDate: payload.discountStartDate ?? null,
				discountEndDate: payload.discountEndDate ?? null,
				...(payload.brandId !== undefined && { brandId: payload.brandId }),
				image: payload.image,
				galleryImages: payload.galleryImages,
				status: payload.status,
				stockStatus: payload.stockStatus
			}
		});

		if (categoryIds.length > 0) {
			await tx.categoriesOnProducts.createMany({
				data: categoryIds.map((categoryId) => ({ productId: created.id, categoryId }))
			});
		}

		if (tagIds.length > 0) {
			await tx.tagsOnProducts.createMany({
				data: tagIds.map((tagId) => ({ productId: created.id, tagId }))
			});
		}

		if (payload.additionalInformations.length > 0) {
			await tx.additionalInformation.createMany({
				data: payload.additionalInformations.map((item) => ({
					productId: created.id,
					name: item.name,
					value: item.value
				}))
			});
		}

		if (payload.attributes.length > 0) {
			const variations = payload.attributes.flatMap((attribute) => {
				const normalizedName = toUpperUnderscore(attribute.name);
				const attributeId = attributeMap.get(normalizedName) as string;
				return attribute.pairs.map((pair) => {
					const basePrice = pair.price != null && Number.isFinite(pair.price) ? pair.price : payload.basePrice;
					const finalPrice = calculateFinalPrice(basePrice, payload.discountType, payload.discountValue);
					return {
						productId: created.id,
						attributeId,
						attributeValue: pair.value,
						basePrice,
						finalPrice,
						galleryImage: (pair as any).galleryImage ?? null
					};
				});
			});

			if (variations.length > 0) {
				await tx.productVariation.createMany({ data: variations });
			}
		}

		if (payload.seo && (payload.seo.title.trim() || payload.seo.description || payload.seo.keyword.length > 0)) {
			await tx.seo.create({
				data: {
					productId: created.id,
					title: payload.seo.title,
					description: payload.seo.description ?? null,
					keyword: payload.seo.keyword
				}
			});
		}

		return tx.product.findUnique({
			where: { id: created.id },
			include: {
				brand: true,
				categories: {
					include: {
						category: true
					}
				},
				tags: {
					include: {
						tag: true
					}
				},
				additionalInformations: true,
				seos: true,
				productVariations: {
					where: { deletedAt: null },
					include: {
						attribute: true
					}
				}
			}
		});
	});
};

const getProducts = async ({
	page = 1,
	limit = 20,
	searchTerm,
	category,
	brand,
	minPrice,
	maxPrice
}: ProductListQuery = {}) => {
	const skip = (page - 1) * limit;

	const where: Prisma.ProductWhereInput = {
		deletedAt: null
	};

	if (searchTerm) {
		where.OR = [
			{ name: { contains: searchTerm, mode: 'insensitive' } },
			{ sku: { contains: searchTerm, mode: 'insensitive' } }
		];
	}

	const categoryFilter = category ? (Array.isArray(category) ? category : String(category).split('&')) : [];
	const brandFilter = brand ? (Array.isArray(brand) ? brand : String(brand).split('&')) : [];

	if (categoryFilter.length > 0 || brandFilter.length > 0) {
		const conditions: Prisma.ProductWhereInput[] = [];

		if (categoryFilter.length > 0) {
			conditions.push({
				categories: {
					some: {
						category: {
							slug: { in: categoryFilter }
						}
					}
				}
			});
		}

		if (brandFilter.length > 0) {
			conditions.push({
				brand: {
					slug: { in: brandFilter }
				}
			});
		}

		if (where.OR) {
			where.AND = [
				{ OR: where.OR },
				{ OR: conditions }
			];
			delete where.OR;
		} else {
			where.OR = conditions;
		}
	}

	if (minPrice !== undefined || maxPrice !== undefined) {
		where.finalPrice = {};
		if (minPrice !== undefined) {
			where.finalPrice.gte = minPrice;
		}
		if (maxPrice !== undefined) {
			where.finalPrice.lte = maxPrice;
		}
	}

	const [data, total] = await Promise.all([
		prisma.product.findMany({
			where,
			skip,
			take: limit,
			orderBy: { createdAt: 'desc' },
			include: {
				brand: true,
				categories: { include: { category: true } },
				tags: { include: { tag: true } },
				additionalInformations: true,
				seos: true,
				productVariations: { where: { deletedAt: null }, include: { attribute: true } },
				productReviews: { include: { user: true } },
				offerProducts: { include: { offer: true } }
			}
		}),
		prisma.product.count({ where })
	]);

	const enrichedData = attachOfferDetails(data as any[]);

	const meta = {
		page,
		total,
		totalPages: Math.max(1, Math.ceil(total / limit))
	};

	return { data: enrichedData, meta };
};

const getProductsLimited = async ({ count = 10, searchTerm, category, brand, minPrice, maxPrice }: { count?: number; searchTerm?: string; category?: string | string[]; brand?: string | string[]; minPrice?: number; maxPrice?: number } = {}) => {
	const where: Prisma.ProductWhereInput = {};

	if (searchTerm) {
		where.OR = [
			{ name: { contains: searchTerm, mode: 'insensitive' } },
			{ sku: { contains: searchTerm, mode: 'insensitive' } }
		];
	}

	const categoryFilter = category ? (Array.isArray(category) ? category : String(category).split('&')) : [];
	const brandFilter = brand ? (Array.isArray(brand) ? brand : String(brand).split('&')) : [];

	if (categoryFilter.length > 0 || brandFilter.length > 0) {
		const conditions: Prisma.ProductWhereInput[] = [];

		if (categoryFilter.length > 0) {
			conditions.push({
				categories: {
					some: {
						category: {
							slug: { in: categoryFilter }
						}
					}
				}
			});
		}

		if (brandFilter.length > 0) {
			conditions.push({
				brand: {
					slug: { in: brandFilter }
				}
			});
		}

		if (where.OR) {
			where.AND = [
				{ OR: where.OR },
				{ OR: conditions }
			];
			delete where.OR;
		} else {
			where.OR = conditions;
		}
	}

	if (minPrice !== undefined || maxPrice !== undefined) {
		where.finalPrice = {};
		if (minPrice !== undefined) {
			where.finalPrice.gte = minPrice;
		}
		if (maxPrice !== undefined) {
			where.finalPrice.lte = maxPrice;
		}
	}

	return prisma.product.findMany({
		where: {
			deletedAt: null,
			...where
		},
		take: count,
		orderBy: { createdAt: 'desc' },
		include: {
			brand: true,
			categories: { include: { category: true } },
			tags: { include: { tag: true } },
			additionalInformations: true,
			seos: true,
			productVariations: { where: { deletedAt: null }, include: { attribute: true } },
			productReviews: { include: { user: true } }
		}
	});
};

const getProductById = async (id: string) => {
	return prisma.product.findFirst({
		where: { id, deletedAt: null },
 		include: {
 			brand: true,
 			categories: { include: { category: true } },
 			tags: { include: { tag: true } },
 			additionalInformations: true,
 			seos: true,
			productVariations: { where: { deletedAt: null }, include: { attribute: true } },
			productReviews: {
				where: { parentId: null },
				include: {
					user: {
						select: {
							id: true,
							email: true,
							customers: { select: { phone: true } },
							admins: { select: { name: true, image: true } }
						}
					},
					replies: {
						include: {
							user: {
								select: {
									id: true,
									email: true,
									customers: { select: { phone: true } },
									admins: { select: { name: true, image: true } }
								}
							}
						},
						orderBy: { createdAt: 'asc' }
					}
				},
				orderBy: { createdAt: 'desc' }
			}
 		}
 	});
};

const getProductBySlug = async (slug: string) => {
	return prisma.product.findFirst({
		where: { slug, deletedAt: null },
		include: {
			brand: true,
			categories: { include: { category: true } },
			tags: { include: { tag: true } },
			additionalInformations: true,
			seos: true,
			productVariations: { where: { deletedAt: null }, include: { attribute: true } },
			productReviews: {
				where: { parentId: null },
				include: {
					user: {
						select: {
							id: true,
							email: true,
							customers: { select: { phone: true } },
							admins: { select: { name: true, image: true } }
						}
					},
					replies: {
						include: {
							user: {
								select: {
									id: true,
									email: true,
									customers: { select: { phone: true } },
									admins: { select: { name: true, image: true } }
								}
							}
						},
						orderBy: { createdAt: 'asc' }
					}
				},
				orderBy: { createdAt: 'desc' }
			}
		}
	});
};

const getHotDeals = async (count: number = 10) => {
	const now = new Date();
	return prisma.product.findMany({
		where: {
			deletedAt: null,
			discountType: { not: 'NONE' },
			discountValue: { not: null },
			status: 'ACTIVE',
			AND: [
				{
					OR: [
						{ discountStartDate: null },
						{ discountStartDate: { lte: now } }
					]
				},
				{
					OR: [
						{ discountEndDate: null },
						{ discountEndDate: { gte: now } }
					]
				}
			]
		},
		take: count,
		orderBy: { discountValue: 'desc' },
		include: {
			brand: true,
			categories: { include: { category: true } },
			tags: { include: { tag: true } },
			additionalInformations: true,
			seos: true,
			productVariations: { where: { deletedAt: null }, include: { attribute: true } },
			productReviews: { include: { user: true } }
		}
	});
};

const getNewArrivals = async (count: number = 10) => {
	return prisma.product.findMany({
		where: { deletedAt: null },
		take: count,
		orderBy: { createdAt: 'desc' },
		include: {
			brand: true,
			categories: { include: { category: true } },
			tags: { include: { tag: true } },
			additionalInformations: true,
			seos: true,
			productVariations: { where: { deletedAt: null }, include: { attribute: true } },
			productReviews: { include: { user: true } }
		}
	});
};

const getAllProducts = async () => {
	const data = await prisma.product.findMany({
		where: { deletedAt: null },
		orderBy: { createdAt: 'desc' },
		include: {
			brand: true,
			categories: { include: { category: true } },
			tags: { include: { tag: true } },
			additionalInformations: true,
			seos: true,
			productVariations: { where: { deletedAt: null }, include: { attribute: true } },
			productReviews: { include: { user: true } },
			offerProducts: { include: { offer: true } }
		}
	});

	return attachOfferDetails(data as any[]);
};

const getOfferProducts = async () => {
	const products = await prisma.product.findMany({
		where: {
			deletedAt: null,
			offerProducts: {
				some: {
					deletedAt: null,
					offer: {
						deletedAt: null
					}
				}
			}
		},
		orderBy: { createdAt: 'desc' },
		include: {
			brand: true,
			categories: { include: { category: true } },
			tags: { include: { tag: true } },
			additionalInformations: true,
			seos: true,
			productVariations: { where: { deletedAt: null }, include: { attribute: true } },
			productReviews: { include: { user: true } },
			...offerProductInclude
		}
	});

	return attachOfferDetails(products as any[]);
};

const deleteProduct = async (id: string) => {
	return prisma.$transaction(async (tx) => {
		await tx.product.update({
			where: { id },
			data: { deletedAt: new Date() }
		});
 		return true;
 	});
};

const updateProduct = async (id: string, payload: UpdateProductDto) => {
	return prisma.$transaction(async (tx) => {
		const existing = await tx.product.findUnique({
			where: { id },
			select: { id: true, name: true, slug: true }
		});
		if (!existing) {
			throw new AppError(404, 'Product not found', [
				{ message: 'No product found with the provided id', code: 'PRODUCT_NOT_FOUND' }
			]);
		}

		if (payload.brandId !== undefined) {
			const brand = await tx.brand.findUnique({ where: { id: payload.brandId }, select: { id: true } });
			if (!brand) {
				throw new AppError(400, 'Brand not found', [
					{ message: 'Provided brandId does not match any brand', code: 'BRAND_NOT_FOUND' }
				]);
			}
		}

		if (payload.sku) {
			const existingSku = await tx.product.findFirst({
				where: { sku: payload.sku, id: { not: id }, deletedAt: null, status: 'ACTIVE' },
				select: { id: true }
			});
			if (existingSku) {
				throw new AppError(400, 'SKU already exists', [
					{ message: 'Another product uses the provided SKU', code: 'SKU_CONFLICT' }
				]);
			}
		}

		const categoryIds = Array.from(new Set(payload.categoryIds));
		const tagIds = Array.from(new Set(payload.tagIds ?? []));

		const [categories, tags] = await Promise.all([
			tx.productCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true } }),
			tx.productTag.findMany({ where: { id: { in: tagIds } }, select: { id: true } })
		]);

		if (categories.length !== categoryIds.length) {
			throw new AppError(400, 'Invalid categories', [
				{ message: 'One or more selected categories do not exist', code: 'CATEGORY_NOT_FOUND' }
			]);
		}

		if (tags.length !== tagIds.length) {
			throw new AppError(400, 'Invalid tags', [
				{ message: 'One or more selected tags do not exist', code: 'TAG_NOT_FOUND' }
			]);
		}

		const attributeNames = Array.from(new Set(payload.attributes.map((a) => a.name.trim()).filter(Boolean)));
		const attributeRecords = attributeNames.length > 0
			? await tx.attribute.findMany({
				where: { OR: attributeNames.map((name) => ({ name: { equals: name, mode: 'insensitive' } })) },
				select: { id: true, name: true }
			})
			: [];

		const normalizedAttributeMap = new Map(
			attributeRecords.map((attr) => [toUpperUnderscore(attr.name), { id: attr.id, name: attr.name }])
		);

		for (const name of attributeNames) {
			const normalizedName = toUpperUnderscore(name);
			if (!normalizedAttributeMap.has(normalizedName)) {
				const slug = toSlug(name);
				const createdAttr = await tx.attribute.create({ data: { name, slug, values: [] } });
				normalizedAttributeMap.set(normalizedName, { id: createdAttr.id, name: createdAttr.name });
			}
		}

		const attributeMap = new Map(Array.from(normalizedAttributeMap.entries()).map(([k, v]) => [k, v.id]));

		let slug = existing.slug;
		if (payload.name.trim().toLowerCase() !== existing.name.trim().toLowerCase()) {
			slug = await generateUniqueSlugTx(tx, payload.name);
		}

		const volume = payload.length != null && payload.width != null && payload.height != null
			? payload.length * payload.width * payload.height
			: null;
		const finalPrice = calculateFinalPrice(payload.basePrice, payload.discountType, payload.discountValue);

		await tx.product.update({
			where: { id },
			data: {
				name: payload.name,
				slug,
				shortDescription: payload.shortDescription ?? null,
				description: payload.description,
				Baseprice: payload.basePrice,
				posPrice: payload.posPrice ?? null,
				finalPrice,
				discountType: payload.discountType,
				discountValue: payload.discountType === 'NONE' ? null : payload.discountValue ?? null,
				stock: payload.stock,
				weight: payload.weight ?? null,
				length: payload.length ?? null,
				width: payload.width ?? null,
				height: payload.height ?? null,
				volume,
				sku: payload.sku ?? null,
				discountStartDate: payload.discountStartDate ?? null,
				discountEndDate: payload.discountEndDate ?? null,
				...(payload.brandId !== undefined && { brandId: payload.brandId }),
				image: payload.image,
				galleryImages: payload.galleryImages,
				status: payload.status,
				stockStatus: payload.stockStatus
			}
		});

		await Promise.all([
			tx.categoriesOnProducts.deleteMany({ where: { productId: id } }),
			tx.tagsOnProducts.deleteMany({ where: { productId: id } }),
			tx.additionalInformation.deleteMany({ where: { productId: id } }),
			tx.seo.deleteMany({ where: { productId: id } })
		]);

		if (categoryIds.length > 0) {
			await tx.categoriesOnProducts.createMany({
				data: categoryIds.map((categoryId) => ({ productId: id, categoryId }))
			});
		}

		if (tagIds.length > 0) {
			await tx.tagsOnProducts.createMany({
				data: tagIds.map((tagId) => ({ productId: id, tagId }))
			});
		}

		if (payload.additionalInformations.length > 0) {
			await tx.additionalInformation.createMany({
				data: payload.additionalInformations.map((item) => ({
					productId: id,
					name: item.name,
					value: item.value
				}))
			});
		}

		if (Array.isArray(payload.attributes)) {
			const existingVariations = await tx.productVariation.findMany({
				where: { productId: id }
			});
			const existingVariationsByKey = new Map(
				existingVariations.map((variation) => [
					`${variation.attributeId}-${variation.attributeValue}`,
					variation
				])
			);

			const desiredVariations = payload.attributes.flatMap((attribute) => {
				const normalizedName = toUpperUnderscore(attribute.name);
				const attributeId = attributeMap.get(normalizedName) as string;
				return attribute.pairs.map((pair) => {
					const basePrice = pair.price != null && Number.isFinite(pair.price) ? pair.price : payload.basePrice;
					const finalPrice = calculateFinalPrice(basePrice, payload.discountType, payload.discountValue);
					return {
						productId: id,
						attributeId,
						attributeValue: pair.value,
						basePrice,
						finalPrice,
						galleryImage: (pair as any).galleryImage ?? null
					};
				});
			});

			const toCreate = [];
			const toUpdate = [];
			const toSoftDeleteIds: string[] = [];
			const desiredKeys = new Set(desiredVariations.map((variation) => `${variation.attributeId}-${variation.attributeValue}`));

			for (const desired of desiredVariations) {
				const key = `${desired.attributeId}-${desired.attributeValue}`;
				const existingVariation = existingVariationsByKey.get(key);
				if (existingVariation) {
					toUpdate.push({ id: existingVariation.id, data: { ...desired, deletedAt: null } });
				} else {
					toCreate.push(desired);
				}
			}

			for (const existing of existingVariations) {
				const key = `${existing.attributeId}-${existing.attributeValue}`;
				if (existing.deletedAt === null && !desiredKeys.has(key)) {
					toSoftDeleteIds.push(existing.id);
				}
			}

			if (toSoftDeleteIds.length > 0) {
				await tx.productVariation.updateMany({
					where: { id: { in: toSoftDeleteIds } },
					data: { deletedAt: new Date() }
				});
			}

			for (const updateDef of toUpdate) {
				await tx.productVariation.update({
					where: { id: updateDef.id },
					data: updateDef.data
				});
			}

			if (toCreate.length > 0) {
				await tx.productVariation.createMany({ data: toCreate });
			}
		} else {
			const existingVars = await tx.productVariation.findMany({
				where: { productId: id, deletedAt: null }
			});
			for (const v of existingVars) {
				const finalPrice = calculateFinalPrice(v.basePrice, payload.discountType, payload.discountValue);
				await tx.productVariation.update({ where: { id: v.id }, data: { finalPrice } });
			}
		}

		if (payload.seo && (payload.seo.title.trim() || payload.seo.description || payload.seo.keyword.length > 0)) {
			await tx.seo.create({
				data: {
					productId: id,
					title: payload.seo.title,
					description: payload.seo.description ?? null,
					keyword: payload.seo.keyword
				}
			});
		}

		return tx.product.findUnique({
			where: { id },
			include: {
				brand: true,
				categories: { include: { category: true } },
				tags: { include: { tag: true } },
				additionalInformations: true,
				seos: true,
				productVariations: { where: { deletedAt: null }, include: { attribute: true } }
			}
		});
	});
};

const patchProduct = async (id: string, payload: PatchProductDto) => {
	const existing = await prisma.product.findUnique({ where: { id }, select: { id: true } });
	if (!existing) {
		throw new AppError(404, 'Product not found', [
			{ message: 'No product found with the provided id', code: 'PRODUCT_NOT_FOUND' }
		]);
	}

	return prisma.product.update({
		where: { id },
		data: {
			...(payload.status !== undefined && { status: payload.status }),
			...(payload.stockStatus !== undefined && { stockStatus: payload.stockStatus })
		},
		include: {
			brand: true,
			categories: { include: { category: true } },
			tags: { include: { tag: true } },
			additionalInformations: true,
			seos: true,
			productVariations: { where: { deletedAt: null }, include: { attribute: true } }
		}
	});
};

const bulkPatchProducts = async (payload: BulkPatchProductDto) => {
	const result = await prisma.product.updateMany({
		where: { id: { in: payload.ids } },
		data: {
			...(payload.status !== undefined && { status: payload.status }),
			...(payload.stockStatus !== undefined && { stockStatus: payload.stockStatus })
		}
	});
	return result;
};

export const productService = {
 	createProduct,
	getProducts,
	getProductsLimited,
	getAllProducts,
	getProductById,
	getProductBySlug,
	getHotDeals,
	getNewArrivals,
	getOfferProducts,
	deleteProduct,
	updateProduct,
	patchProduct,
	bulkPatchProducts
};
