import { prisma } from '../../config/prisma.js';
import toSlug from '../../common/utils/slug.js';
import { toUpperUnderscore } from '../../common/utils/format.js';
import { AppError } from '../../common/errors/app-error.js';
import type { CreateAttributeDto, UpdateAttributeDto, ServiceListResult, AttributeListQuery } from './attribute.types.js';

import type { Prisma } from '@prisma/client';

const getAttributes = async ({ page = 1, limit = 10, searchTerm }: AttributeListQuery = {}): Promise<ServiceListResult<any>> => {
    const skip = (page - 1) * limit;
    const where: Prisma.AttributeWhereInput = searchTerm
        ? { name: { contains: searchTerm, mode: 'insensitive' } }
        : {};

    const [data, total] = await Promise.all([
        prisma.attribute.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' }
        }),
        prisma.attribute.count({ where })
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

const getAttributeById = async (id: string) => {
    return prisma.attribute.findUnique({ where: { id } });
};

const createAttribute = async ({ name, values = [] }: CreateAttributeDto) => {
    const cleanNameKey = toUpperUnderscore(name);
    const slug = toSlug(name);

    const existing = await prisma.attribute.findMany({ select: { id: true, name: true } });
    const conflict = existing.find((c) => toUpperUnderscore(c.name) === cleanNameKey);
    if (conflict) {
        throw new AppError(400, 'Attribute name already exists', [
            { message: 'An attribute with that name exists', code: 'NAME_CONFLICT' }
        ]);
    }

    const normalizedValues = Array.isArray(values) ? values.map((v) => String(v).trim()).filter(Boolean) : [];

    const created = await prisma.attribute.create({ data: { name, slug, values: normalizedValues } });
    return created;
};

const updateAttribute = async (id: string, payload: UpdateAttributeDto) => {
    const existing = await prisma.attribute.findUnique({ where: { id } });
    if (!existing) {
        throw new AppError(404, 'Attribute not found', [
            { message: 'No attribute exists with the provided id', code: 'NOT_FOUND' }
        ]);
    }

    const data: any = {};

    if (payload.name) {
        const cleanNameKey = toUpperUnderscore(payload.name);
        const others = await prisma.attribute.findMany({ where: { NOT: { id } }, select: { id: true, name: true } });
        const conflict = others.find((c) => toUpperUnderscore(c.name) === cleanNameKey);
        if (conflict) {
            throw new AppError(400, 'Attribute name already exists', [
                { message: 'Another attribute uses this name', code: 'NAME_CONFLICT' }
            ]);
        }

        data.name = payload.name;
        data.slug = toSlug(payload.name);
    }

    if (payload.values !== undefined) {
        const normalizedValues = Array.isArray(payload.values) ? payload.values.map((v) => String(v).trim()).filter(Boolean) : [];
        data.values = normalizedValues;
    }

    if (Object.keys(data).length === 0) {
        // nothing to update
        return prisma.attribute.update({ where: { id }, data: payload as any });
    }

    return prisma.attribute.update({ where: { id }, data });
};

const deleteAttribute = async (id: string) => {
    await prisma.attribute.delete({ where: { id } });
    return true;
};

const getAllAttributes = async () => {
    return prisma.attribute.findMany({ orderBy: { createdAt: 'desc' } });
};

export const attributeService = {
    getAttributes,
    getAttributeById,
    getAllAttributes,
    createAttribute,
    updateAttribute,
    deleteAttribute
};
