import { prisma } from '../../config/prisma.js';
import toSlug from '../../common/utils/slug.js';
import { toUpperUnderscore } from '../../common/utils/format.js';
import { AppError } from '../../common/errors/app-error.js';
import type { CreateCategoryDto, UpdateCategoryDto, ServiceListResult, CategoryListQuery } from './blog-category.types.js';

import type { Prisma } from '@prisma/client';
import { deleteCloudinaryAsset, getPublicIdFromUrl } from '../../common/utils/file-upload.js';

const getCategories = async ({ page = 1, limit = 10, searchTerm }: CategoryListQuery = {}): Promise<ServiceListResult<any>> => {
    const skip = (page - 1) * limit;
    const where: Prisma.BlogCategoryWhereInput = searchTerm
        ? { name: { contains: searchTerm, mode: 'insensitive' } }
        : {};

    const [data, total] = await Promise.all([
        prisma.blogCategory.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' }
        }),
        prisma.blogCategory.count({ where })
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

const getCategoryById = async (id: string) => {
    return prisma.blogCategory.findUnique({ where: { id } });
};

const createCategory = async ({ name, image }: CreateCategoryDto) => {
    const cleanNameKey = toUpperUnderscore(name);
    const slug = toSlug(name);

    const existing = await prisma.blogCategory.findMany({ select: { id: true, name: true } });
    const conflict = existing.find((c) => toUpperUnderscore(c.name) === cleanNameKey);
    if (conflict) {
        throw new AppError(400, 'Category name already exists', [
            { message: 'A category with that name exists', code: 'NAME_CONFLICT' }
        ]);
    }

    const created = await prisma.blogCategory.create({ data: { name, slug, image } });
    return created;
};

const updateCategory = async (id: string, payload: UpdateCategoryDto, newUploadedPublicId?: string | null) => {
    const existing = await prisma.blogCategory.findUnique({ where: { id } });
    if (!existing) {
        throw new AppError(404, 'Category not found', [
            { message: 'No category exists with the provided id', code: 'NOT_FOUND' }
        ]);
    }

    const previousPublicId = getPublicIdFromUrl(existing.image) ?? null;

    const updated = await prisma.$transaction(async (tx) => {
        if (payload.name) {
            const cleanNameKey = toUpperUnderscore(payload.name);
            const slug = toSlug(payload.name);

            const others = await tx.blogCategory.findMany({ where: { NOT: { id } }, select: { id: true, name: true } });
            const conflict = others.find((c) => toUpperUnderscore(c.name) === cleanNameKey);
            if (conflict) {
                throw new AppError(400, 'Category name already exists', [
                    { message: 'Another category uses this name', code: 'NAME_CONFLICT' }
                ]);
            }

            await tx.blogCategory.update({ where: { id }, data: { name: payload.name, slug } });
        } else {
            await tx.blogCategory.update({ where: { id }, data: payload as any });
        }

        return tx.blogCategory.findUnique({ where: { id } });
    });

    try {
        if (newUploadedPublicId !== undefined) {
            const newPub = newUploadedPublicId ?? null;
            if (previousPublicId && previousPublicId !== newPub) {
                try {
                    await deleteCloudinaryAsset(previousPublicId);
                } catch (err) {
                    console.warn('Failed to delete previous cloud asset for blog category', { previousPublicId, err: (err as Error).message });
                }
            }
        }

        if (payload.image === null && previousPublicId) {
            try {
                await deleteCloudinaryAsset(previousPublicId);
            } catch (err) {
                console.warn('Failed to delete previous cloud asset on explicit remove for blog category', { previousPublicId, err: (err as Error).message });
            }
        }
    } catch (err) {
        console.warn('Unexpected error in post-update asset cleanup for blog category', (err as Error).message);
    }

    return updated;
};

const deleteCategory = async (id: string) => {
    const existing = await prisma.blogCategory.findUnique({ where: { id } });
    if (!existing) {
        throw new AppError(404, 'Category not found', [{ message: 'No category exists with the provided id', code: 'NOT_FOUND' }]);
    }

    const previousPublicId = getPublicIdFromUrl(existing.image) ?? null;

    if (previousPublicId) {
        try {
            await deleteCloudinaryAsset(previousPublicId);
        } catch (err) {
            console.warn('Failed to delete cloud asset before blog category removal', { previousPublicId, err: (err as Error).message });
            throw new AppError(500, 'Failed to delete associated image from cloud', [
                { message: (err as Error).message, code: 'CLOUD_DELETE_FAILED' }
            ]);
        }
    }

    await prisma.blogCategory.delete({ where: { id } });
    return true;
};

const getAllCategories = async () => {
    return prisma.blogCategory.findMany({ orderBy: { createdAt: 'desc' } });
};

export const blogCategoryService = {
    getCategories,
    getCategoryById,
    getAllCategories,
    createCategory,
    updateCategory,
    deleteCategory
};
