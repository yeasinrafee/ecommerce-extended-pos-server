import type { OrderStatus } from '@prisma/client';

export type CreateStockTransferProductDto = {
	productId: string;
	quantity: number;
};

export type CreateStockTransferDto = {
	fromStoreId: string;
	toStoreId: string;
	invoiceNumber?: string;
	createdAt?: string | Date;
	products: CreateStockTransferProductDto[];
};

export type UpdateStockTransferDto = {
	orderStatus?: OrderStatus;
};

export type BulkPatchStockTransferDto = {
	ids: string[];
	orderStatus: OrderStatus;
};

export type StockTransferListQuery = {
	page?: number;
	limit?: number;
	searchTerm?: string;
	orderStatus?: OrderStatus;
};

export type StockTransferProductSearchResult = {
	id: string;
	name: string;
	sku: string | null;
	stock: number;
	availableQuantity: number;
	purchasePrice: number;
	image?: string | null;
};

export type ServiceListResult<T> = {
	data: T[];
	meta: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
};