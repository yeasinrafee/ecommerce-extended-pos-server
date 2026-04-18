import { prisma } from '../../config/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import { Prisma, Status } from '@prisma/client';
import type { CreateSupplierDto, SupplierListQuery, UpdateSupplierDto, ServiceListResult } from './supplier.types.js';
import { deleteCloudinaryAsset, getPublicIdFromUrl } from '../../common/utils/file-upload.js';

const getSupplierWhere = ({ searchTerm, status }: Pick<SupplierListQuery, 'searchTerm' | 'status'>): Prisma.SupplierWhereInput => {
	const where: Prisma.SupplierWhereInput = {
		deletedAt: null
	};

	if (searchTerm) {
		where.OR = [
			{ name: { contains: searchTerm, mode: 'insensitive' } },
			{ companyName: { contains: searchTerm, mode: 'insensitive' } },
			{ email: { contains: searchTerm, mode: 'insensitive' } },
			{ phone: { contains: searchTerm, mode: 'insensitive' } },
			{ address: { contains: searchTerm, mode: 'insensitive' } }
		];
	}

	if (status) {
		where.status = status;
	}

	return where;
};

const ensureUniqueSupplierFields = async (
	payload: Pick<CreateSupplierDto | UpdateSupplierDto, 'email' | 'phone'>,
	excludeId?: number
) => {
	if (payload.email !== undefined && payload.email !== null) {
		const existingEmail = await prisma.supplier.findFirst({
			where: {
				email: payload.email,
				deletedAt: null,
				...(excludeId ? { id: { not: excludeId } } : {})
			},
			select: { id: true }
		});

		if (existingEmail) {
			throw new AppError(409, 'Email already in use', [
				{ field: 'email', message: 'This email is already taken', code: 'EMAIL_ALREADY_EXISTS' }
			]);
		}
	}

	if (payload.phone !== undefined && payload.phone !== null) {
		const existingPhone = await prisma.supplier.findFirst({
			where: {
				phone: payload.phone,
				deletedAt: null,
				...(excludeId ? { id: { not: excludeId } } : {})
			},
			select: { id: true }
		});

		if (existingPhone) {
			throw new AppError(409, 'Phone already in use', [
				{ field: 'phone', message: 'This phone number is already taken', code: 'PHONE_ALREADY_EXISTS' }
			]);
		}
	}
};

const getSuppliers = async ({ page = 1, limit = 10, searchTerm, status }: SupplierListQuery = {}): Promise<ServiceListResult<any>> => {
	const skip = (page - 1) * limit;
	const where = getSupplierWhere({ searchTerm, status });

	const [data, total] = await Promise.all([
		prisma.supplier.findMany({
			where,
			skip,
			take: limit,
			orderBy: { createdAt: 'desc' }
		}),
		prisma.supplier.count({ where })
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

const getAllSuppliers = async () => {
	return prisma.supplier.findMany({
		where: { deletedAt: null },
		orderBy: { createdAt: 'desc' }
	});
};

const getSupplierById = async (id: number) => {
	return prisma.supplier.findFirst({
		where: {
			id,
			deletedAt: null
		}
	});
};

const createSupplier = async (payload: CreateSupplierDto) => {
	await ensureUniqueSupplierFields(payload);

	return prisma.supplier.create({
		data: {
			name: payload.name,
			email: payload.email ?? null,
			phone: payload.phone ?? null,
			address: payload.address ?? null,
			companyName: payload.companyName ?? null,
			image: payload.image ?? null,
			status: payload.status ?? Status.ACTIVE
		}
	});
};

const updateSupplier = async (id: number, payload: UpdateSupplierDto, newUploadedPublicId?: string | null) => {
	const existing = await prisma.supplier.findFirst({
		where: {
			id,
			deletedAt: null
		}
	});

	if (!existing) {
		throw new AppError(404, 'Supplier not found', [
			{ message: 'No supplier exists with the provided id', code: 'NOT_FOUND' }
		]);
	}

	await ensureUniqueSupplierFields(payload, id);

	const previousPublicId = getPublicIdFromUrl(existing.image) ?? null;

	const data: Prisma.SupplierUpdateInput = {};

	if (payload.name !== undefined) {
		data.name = payload.name;
	}

	if (payload.email !== undefined) {
		data.email = payload.email;
	}

	if (payload.phone !== undefined) {
		data.phone = payload.phone;
	}

	if (payload.address !== undefined) {
		data.address = payload.address;
	}

	if (payload.companyName !== undefined) {
		data.companyName = payload.companyName;
	}

	if (payload.image !== undefined) {
		data.image = payload.image;
	}

	if (payload.status !== undefined) {
		data.status = payload.status;
	}

	if (Object.keys(data).length === 0) {
		return existing;
	}

	const updated = await prisma.supplier.update({
		where: { id },
		data
	});

	if (previousPublicId) {
		const hasNewImage = newUploadedPublicId !== undefined && newUploadedPublicId !== null;
		const explicitlyRemovedImage = payload.image === null;

		if ((hasNewImage || explicitlyRemovedImage) && previousPublicId !== newUploadedPublicId) {
			try {
				await deleteCloudinaryAsset(previousPublicId);
			} catch (_err) {
			}
		}
	}

	return updated;
};

const deleteSupplier = async (id: number) => {
	const existing = await prisma.supplier.findFirst({
		where: {
			id,
			deletedAt: null
		}
	});

	if (!existing) {
		throw new AppError(404, 'Supplier not found', [
			{ message: 'No supplier exists with the provided id', code: 'NOT_FOUND' }
		]);
	}

	const previousPublicId = getPublicIdFromUrl(existing.image) ?? null;

	await prisma.supplier.update({
		where: { id },
		data: {
			deletedAt: new Date()
		}
	});

	if (previousPublicId) {
		try {
			await deleteCloudinaryAsset(previousPublicId);
		} catch (_err) {
		}
	}

	return true;
};

const bulkUpdateStatus = async (ids: number[], status?: Status) => {
	if (!Array.isArray(ids) || ids.length === 0) {
		throw new AppError(400, 'No ids provided', [
			{ message: 'Provide an array of supplier ids', code: 'INVALID_PAYLOAD' }
		]);
	}

	if (!status) {
		throw new AppError(400, 'Status is required', [
			{ message: 'Provide a status value', code: 'INVALID_PAYLOAD' }
		]);
	}

	const result = await prisma.supplier.updateMany({
		where: { id: { in: ids } },
		data: { status }
	});

	return result.count;
};

export const supplierService = {
	getSuppliers,
	getAllSuppliers,
	getSupplierById,
	createSupplier,
	updateSupplier,
	deleteSupplier,
	bulkUpdateStatus
};