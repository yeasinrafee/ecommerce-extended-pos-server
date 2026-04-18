import type { DiscountType, Status, StockStatus } from '@prisma/client';

export type CreateProductAttributePairDto = {
	value: string;
	price?: number | null;
	galleryImage?: string | null;
};

export type CreateProductAttributeDto = {
	name: string;
	pairs: CreateProductAttributePairDto[];
};

export type CreateProductAdditionalInfoDto = {
	name: string;
	value: string;
};

export type CreateProductSeoDto = {
	title: string;
	description?: string | null;
	keyword: string[];
};

export type CreateProductDto = {
	name: string;
	shortDescription?: string | null;
	description: string;
	basePrice: number;
	discountType: DiscountType;
	discountValue?: number | null;
	discountStartDate?: Date | null;
	discountEndDate?: Date | null;
	stock: number;
	sku?: string | null;
	weight?: number | null;
	length?: number | null;
	width?: number | null;
	height?: number | null;
	brandId?: string;
	image: string;
	galleryImages: string[];
	status: Status;
	stockStatus: StockStatus;
	categoryIds: string[];
	tagIds?: string[];
	attributes: CreateProductAttributeDto[];
	additionalInformations: CreateProductAdditionalInfoDto[];
	seo?: CreateProductSeoDto | null;
};

// ─── Update DTO ───────────────────────────────────────────────────────────────

export type UpdateProductAttributePairDto = {
	value: string;
	price?: number | null;
	galleryImage?: string | null;
};

export type UpdateProductAttributeDto = {
	name: string;
	pairs: UpdateProductAttributePairDto[];
};

export type UpdateProductDto = {
	name: string;
	shortDescription?: string | null;
	description: string;
	basePrice: number;
	discountType: DiscountType;
	discountValue?: number | null;
	discountStartDate?: Date | null;
	discountEndDate?: Date | null;
	stock: number;
	sku?: string | null;
	weight?: number | null;
	length?: number | null;
	width?: number | null;
	height?: number | null;
	brandId?: string;
	image: string;
	galleryImages: string[];
	status: Status;
	stockStatus: StockStatus;
	categoryIds: string[];
	tagIds?: string[];
	attributes: UpdateProductAttributeDto[];
	additionalInformations: CreateProductAdditionalInfoDto[];
	seo?: CreateProductSeoDto | null;
};

export type PatchProductDto = {
	status?: Status;
	stockStatus?: StockStatus;
};

export type BulkPatchProductDto = {
	ids: string[];
	status?: Status;
	stockStatus?: StockStatus;
};

export type ProductListQuery = {
	page?: number;
	limit?: number;
	searchTerm?: string;
	category?: string | string[];
	brand?: string | string[];
	minPrice?: number;
	maxPrice?: number;
};
