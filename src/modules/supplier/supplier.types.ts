import type { Status } from '@prisma/client';

export type CreateSupplierDto = {
	name: string;
	email?: string | null;
	phone?: string | null;
	address?: string | null;
	companyName?: string | null;
	image?: string | null;
	status?: Status;
};

export type UpdateSupplierDto = {
	name?: string;
	email?: string | null;
	phone?: string | null;
	address?: string | null;
	companyName?: string | null;
	image?: string | null;
	status?: Status;
};

export type SupplierListQuery = {
	page?: number;
	limit?: number;
	searchTerm?: string;
	status?: Status;
};

export type BulkUpdateSupplierStatusDto = {
	ids: number[];
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