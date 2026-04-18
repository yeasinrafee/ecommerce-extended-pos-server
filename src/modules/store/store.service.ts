import { prisma } from '../../config/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import { Prisma, Status } from '@prisma/client';
import type { CreateStoreDto, StoreListQuery, UpdateStoreDto, ServiceListResult } from './store.types.js';

const getStoreWhere = ({ searchTerm, status }: Pick<StoreListQuery, 'searchTerm' | 'status'>): Prisma.StoreWhereInput => {
	const where: Prisma.StoreWhereInput = {
		deletedAt: null
	};

	if (searchTerm) {
		where.OR = [
			{ name: { contains: searchTerm, mode: 'insensitive' } },
			{ address: { contains: searchTerm, mode: 'insensitive' } }
		];
	}

	if (status) {
		where.status = status;
	}

	return where;
};

const getStores = async ({ page = 1, limit = 10, searchTerm, status }: StoreListQuery = {}): Promise<ServiceListResult<any>> => {
	const skip = (page - 1) * limit;
	const where = getStoreWhere({ searchTerm, status });

	const [data, total] = await Promise.all([
		prisma.store.findMany({
			where,
			skip,
			take: limit,
			orderBy: { createdAt: 'desc' }
		}),
		prisma.store.count({ where })
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

const getAllStores = async () => {
	return prisma.store.findMany({
		where: { deletedAt: null },
		orderBy: { createdAt: 'desc' }
	});
};

const getStoreById = async (id: string) => {
	return prisma.store.findFirst({
		where: {
			id,
			deletedAt: null
		}
	});
};

const createStore = async (payload: CreateStoreDto) => {
	return prisma.store.create({
		data: {
			name: payload.name,
			address: payload.address,
			status: payload.status ?? Status.ACTIVE
		}
	});
};

const updateStore = async (id: string, payload: UpdateStoreDto) => {
	const existing = await prisma.store.findFirst({
		where: {
			id,
			deletedAt: null
		}
	});

	if (!existing) {
		throw new AppError(404, 'Store not found', [
			{ message: 'No store exists with the provided id', code: 'NOT_FOUND' }
		]);
	}

	const data: Prisma.StoreUpdateInput = {};

	if (payload.name !== undefined) {
		data.name = payload.name;
	}

	if (payload.address !== undefined) {
		data.address = payload.address;
	}

	if (payload.status !== undefined) {
		data.status = payload.status;
	}

	if (Object.keys(data).length === 0) {
		return existing;
	}

	return prisma.store.update({
		where: { id },
		data
	});
};

const deleteStore = async (id: string) => {
	const existing = await prisma.store.findFirst({
		where: {
			id,
			deletedAt: null
		}
	});

	if (!existing) {
		throw new AppError(404, 'Store not found', [
			{ message: 'No store exists with the provided id', code: 'NOT_FOUND' }
		]);
	}

	await prisma.store.update({
		where: { id },
		data: {
			deletedAt: new Date()
		}
	});

	return true;
};

const bulkUpdateStatus = async (ids: string[], status?: Status) => {
	if (!Array.isArray(ids) || ids.length === 0) {
		throw new AppError(400, 'No ids provided', [
			{ message: 'Provide an array of store ids', code: 'INVALID_PAYLOAD' }
		]);
	}

	if (!status) {
		throw new AppError(400, 'Status is required', [
			{ message: 'Provide a status value', code: 'INVALID_PAYLOAD' }
		]);
	}

	const result = await prisma.store.updateMany({
		where: { id: { in: ids } },
		data: { status }
	});

	return result.count;
};

export const storeService = {
	getStores,
	getAllStores,
	getStoreById,
	createStore,
	updateStore,
	deleteStore,
	bulkUpdateStatus
};