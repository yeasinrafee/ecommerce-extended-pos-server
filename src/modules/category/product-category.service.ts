import { prisma } from '../../config/prisma.js';
import toSlug from '../../common/utils/slug.js';
import { toUpperUnderscore } from '../../common/utils/format.js';
import { AppError } from '../../common/errors/app-error.js';
import type { CreateCategoryDto, UpdateCategoryDto, ServiceListResult, CategoryListQuery } from './product-category.types.js';

import type { Prisma } from '@prisma/client';
import { deleteCloudinaryAsset, getPublicIdFromUrl } from '../../common/utils/file-upload.js';

const generateUniqueSlug = async (name: string, excludeId?: string) => {
    const base = toSlug(name);
    let slug = base;
    let counter = 1;

    while (true) {
        const where: any = excludeId ? { slug, NOT: { id: excludeId } } : { slug };
        const found = await prisma.productCategory.findFirst({ where, select: { id: true } });
        if (!found) return slug;
        slug = `${base}-${counter++}`;
    }
};

const generateUniqueSlugTx = async (tx: any, name: string, excludeId?: string) => {
    const base = toSlug(name);
    let slug = base;
    let counter = 1;

    while (true) {
        const where: any = excludeId ? { slug, NOT: { id: excludeId } } : { slug };
        const found = await tx.productCategory.findFirst({ where, select: { id: true } });
        if (!found) return slug;
        slug = `${base}-${counter++}`;
    }
};

const getCategories = async ({ page = 1, limit = 10, searchTerm }: CategoryListQuery = {}): Promise<ServiceListResult<any>> => {
    const skip = (page - 1) * limit;
    const where: Prisma.ProductCategoryWhereInput = searchTerm
        ? { name: { contains: searchTerm, mode: 'insensitive' } }
        : {};

    const [data, total] = await Promise.all([
        prisma.productCategory.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: { subCategories: true }
        }),
        prisma.productCategory.count({ where })
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

const getParentCategories = async ({ page = 1, limit = 10, searchTerm }: CategoryListQuery = {}): Promise<ServiceListResult<any>> => {
    const skip = (page - 1) * limit;
    const where: Prisma.ProductCategoryWhereInput = {
        parentId: null,
        ...(searchTerm ? { name: { contains: searchTerm, mode: 'insensitive' } } : {})
    };

    const [data, total] = await Promise.all([
        prisma.productCategory.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: { subCategories: true }
        }),
        prisma.productCategory.count({ where })
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
    return prisma.productCategory.findUnique({ where: { id } });
};

const createCategory = async ({ name, image, parentId }: CreateCategoryDto) => {
    const cleanNameKey = toUpperUnderscore(name);

    if (!parentId) {
        const allCategories = await prisma.productCategory.findMany({ select: { id: true, name: true } });
        const conflict = allCategories.find((c) => toUpperUnderscore(c.name) === cleanNameKey);
        if (conflict) {
            throw new AppError(400, 'Category name already exists', [
                { message: 'A category or subcategory with that name exists', code: 'NAME_CONFLICT' }
            ]);
        }
    } else {
        const parent = await prisma.productCategory.findUnique({ where: { id: parentId } });
        if (!parent) {
            throw new AppError(400, 'Parent category not found', [
                { message: 'Provided parentId does not match any category', code: 'PARENT_NOT_FOUND' }
            ]);
        }

        const parents = await prisma.productCategory.findMany({ where: { parentId: null }, select: { id: true, name: true } });
        const parentNameConflict = parents.find((c) => toUpperUnderscore(c.name) === cleanNameKey);
        if (parentNameConflict) {
            throw new AppError(400, 'Category name already exists', [
                { message: 'A parent category with that name exists', code: 'NAME_CONFLICT' }
            ]);
        }

        const siblings = await prisma.productCategory.findMany({ where: { parentId }, select: { id: true, name: true } });
        const siblingConflict = siblings.find((c) => toUpperUnderscore(c.name) === cleanNameKey);
        if (siblingConflict) {
            throw new AppError(400, 'Category name already exists', [
                { message: 'A subcategory with that name already exists under this parent', code: 'NAME_CONFLICT' }
            ]);
        }
    }

    const uniqueSlug = await generateUniqueSlug(name);

    const created = await prisma.productCategory.create({ data: { name, slug: uniqueSlug, image, parentId: parentId ?? null } });
    return created;
};

const updateCategory = async (id: string, payload: UpdateCategoryDto, newUploadedPublicId?: string | null) => {
    const existing = await prisma.productCategory.findUnique({ where: { id } });
    if (!existing) {
        throw new AppError(404, 'Category not found', [
            { message: 'No category exists with the provided id', code: 'NOT_FOUND' }
        ]);
    }

    const previousPublicId = getPublicIdFromUrl(existing.image) ?? null;

    const updated = await prisma.$transaction(async (tx) => {
      
        if (payload.parentId !== undefined && payload.parentId !== null) {
            if (payload.parentId === id) {
                throw new AppError(400, 'Invalid parent', [ { message: 'Category cannot be its own parent', code: 'INVALID_PARENT' } ]);
            }

            const parent = await tx.productCategory.findUnique({ where: { id: payload.parentId } });
            if (!parent) {
                throw new AppError(400, 'Parent category not found', [ { message: 'Provided parentId does not match any category', code: 'PARENT_NOT_FOUND' } ]);
            }

        
            let currentParentId = parent.parentId ?? null;
            while (currentParentId) {
                if (currentParentId === id) {
                    throw new AppError(400, 'Invalid parent', [ { message: 'Setting this parent would create a cycle', code: 'PARENT_CYCLE' } ]);
                }
                const next = await tx.productCategory.findUnique({ where: { id: currentParentId }, select: { parentId: true } });
                currentParentId = next?.parentId ?? null;
            }
        }

            const finalParentId = payload.parentId !== undefined ? payload.parentId : existing.parentId;
            const nameToCheck = payload.name ?? existing.name;

            
            const others = await tx.productCategory.findMany({ where: { NOT: { id } }, select: { id: true, name: true, parentId: true } });

            if (finalParentId === null) {
                const globalConflict = others.find((c) => toUpperUnderscore(c.name) === toUpperUnderscore(nameToCheck));
                if (globalConflict) {
                    throw new AppError(400, 'Category name already exists', [ { message: 'Another category or subcategory uses this name', code: 'NAME_CONFLICT' }]);
                }
            } else {
                const parentConflict = others.find((c) => c.parentId === null && toUpperUnderscore(c.name) === toUpperUnderscore(nameToCheck));
                if (parentConflict) {
                    throw new AppError(400, 'Category name already exists', [ { message: 'A parent category with that name exists', code: 'NAME_CONFLICT' }]);
                }

                const siblingConflict = others.find((c) => c.parentId === finalParentId && toUpperUnderscore(c.name) === toUpperUnderscore(nameToCheck));
                if (siblingConflict) {
                    throw new AppError(400, 'Category name already exists', [ { message: 'A subcategory with that name already exists under this parent', code: 'NAME_CONFLICT' }]);
                }
            }

            if (payload.name) {
                const uniqueSlug = await generateUniqueSlugTx(tx, payload.name, id);
                await tx.productCategory.update({ where: { id }, data: { ...payload, name: payload.name, slug: uniqueSlug } as any });
            } else {
                await tx.productCategory.update({ where: { id }, data: payload as any });
            }

        return tx.productCategory.findUnique({ where: { id } });
    });

    try {
        if (newUploadedPublicId !== undefined) {
            const newPub = newUploadedPublicId ?? null;
            if (previousPublicId && previousPublicId !== newPub) {
                try {
                    await deleteCloudinaryAsset(previousPublicId);
                } catch (err) {
                    console.warn('Failed to delete previous cloud asset for category', { previousPublicId, err: (err as Error).message });
                }
            }
        }

        if (payload.image === null && previousPublicId) {
            try {
                await deleteCloudinaryAsset(previousPublicId);
            } catch (err) {
                console.warn('Failed to delete previous cloud asset on explicit remove for category', { previousPublicId, err: (err as Error).message });
            }
        }
    } catch (err) {
        console.warn('Unexpected error in post-update asset cleanup for category', (err as Error).message);
    }

    return updated;
};

const deleteCategory = async (id: string) => {
    const existing = await prisma.productCategory.findUnique({ where: { id } });
    if (!existing) {
        throw new AppError(404, 'Category not found', [{ message: 'No category exists with the provided id', code: 'NOT_FOUND' }]);
    }

    const previousPublicId = getPublicIdFromUrl(existing.image) ?? null;

    if (previousPublicId) {
        try {
            await deleteCloudinaryAsset(previousPublicId);
        } catch (err) {
            console.warn('Failed to delete cloud asset before category removal', { previousPublicId, err: (err as Error).message });
            throw new AppError(500, 'Failed to delete associated image from cloud', [
                { message: (err as Error).message, code: 'CLOUD_DELETE_FAILED' }
            ]);
        }
    }

    await prisma.productCategory.delete({ where: { id } });
    return true;
};

const getAllCategories = async () => {
    return prisma.productCategory.findMany({ orderBy: { createdAt: 'desc' }, include: { subCategories: true } });
};

export const productCategoryService = {
    getCategories,
    getParentCategories,
    getCategoryById,
    getAllCategories,
    createCategory,
    updateCategory,
    deleteCategory
};
