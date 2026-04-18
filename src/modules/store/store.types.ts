import type { Status } from '@prisma/client';

export type CreateStoreDto = {
	name: string;
	address: string;
	status?: Status;
};

export type UpdateStoreDto = {
	name?: string;
	address?: string;
	status?: Status;
};

export type StoreListQuery = {
	page?: number;
	limit?: number;
	searchTerm?: string;
	status?: Status;
};

export type BulkUpdateStoreStatusDto = {
	ids: string[];
	status?: Status;
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