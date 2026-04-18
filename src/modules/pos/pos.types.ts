export type PosProductsQuery = {
	storeId?: string;
	searchTerm?: string;
};

export type PosBillsListQuery = {
	page?: number;
	limit?: number;
};

export type PosVariationLineInput = {
	variationId?: string;
	quantity?: number;
};

export type PosProductLineInput = {
	productId?: string;
	quantity?: number;
	variationId?: string;
	variationIds?: string[];
	variationQuantities?: number[];
	variations?: PosVariationLineInput[];
};

export type CreatePosBillInput = {
	storeId?: string;
	productId?: string;
	quantity?: number;
	productIds?: string[];
	quantities?: number[];
	variationId?: string;
	variationIds?: string[];
	variationQuantities?: number[];
	products?: PosProductLineInput[];
};

export type UpdatePosBillInput = CreatePosBillInput;

export type NormalizedPosBillLine = {
	productId: string;
	quantity: number;
	variationIds: string[];
};