import type { OrderStatus } from '@prisma/client';

export type CreateStockProductDto = {
	productId: string;
	quantity: number;
	purchasePrice: number;
	totalPrice?: number;
};

export type CreateStockDto = {
	supplierId: number;
	storeId: string;
	invoiceNumber?: string;
	note?: string | null;
	orderStatus?: OrderStatus;
	createdAt?: string | Date;
	products: CreateStockProductDto[];
};

export type UpdateStockDto = {
	supplierId?: number;
	storeId?: string;
	invoiceNumber?: string;
	note?: string | null;
	orderStatus?: OrderStatus;
	createdAt?: string | Date;
	products?: CreateStockProductDto[];
};

export type BulkPatchStockDto = {
	ids: string[];
	orderStatus: OrderStatus;
};

export type StockListQuery = {
	page?: number;
	limit?: number;
	searchTerm?: string;
	orderStatus?: OrderStatus;
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
