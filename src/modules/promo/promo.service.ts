import { prisma } from '../../config/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import type { CreatePromoDto, UpdatePromoDto, PromoListQuery } from './promo.types.js';
import { toUpperUnderscore, fromUpperUnderscore } from '../../common/utils/format.js';

const getPromos = async ({ page = 1, limit = 10, searchTerm }: PromoListQuery) => {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (searchTerm) {
        where.code = { contains: searchTerm, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
        prisma.promo.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' }
        }),
        prisma.promo.count({ where })
    ]);

    const converted = data.map((p: any) => ({ ...p, code: fromUpperUnderscore(p.code) }));

    return {
        data: converted,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit))
        }
    };
};

const getAllPromos = async () => {
    const data = await prisma.promo.findMany({
        orderBy: { createdAt: 'desc' }
    });

    return data.map((p: any) => ({ ...p, code: fromUpperUnderscore(p.code) }));
};

const getPromoById = async (id: string) => {
    const promo = await prisma.promo.findUnique({
        where: { id }
    });

    if (!promo) return promo;
    return { ...promo, code: fromUpperUnderscore(promo.code) };
};

const getPromoByCode = async (code: string) => {
    const normalizedCode = toUpperUnderscore(code);
    const promo = await prisma.promo.findUnique({
        where: { code: normalizedCode }
    });

    if (!promo) return promo;
    return { ...promo, code: fromUpperUnderscore(promo.code) };
};

const createPromo = async (payload: CreatePromoDto) => {
    const code = toUpperUnderscore(payload.code);

    const existing = await prisma.promo.findUnique({ where: { code } });
    if (existing) {
        throw new AppError(400, 'Promo code already exists', [{ message: 'Code must be unique', code: 'UNIQUE_CONSTRAINT' }]);
    }

    return prisma.$transaction(async (tx) => {
        const promo = await tx.promo.create({
            data: {
                code,
                discountType: payload.discountType,
                discountValue: Number(payload.discountValue),
                numberOfUses: Number(payload.numberOfUses),
                startDate: new Date(payload.startDate),
                endDate: new Date(payload.endDate)
            }
        });

        return tx.promo.findUnique({
            where: { id: promo.id }
        });
    });
};

const updatePromo = async (id: string, payload: UpdatePromoDto) => {
    const existingPromo = await prisma.promo.findUnique({ where: { id } });
    if (!existingPromo) {
        throw new AppError(404, 'Promo not found', [{ message: 'No promo corresponds to this ID', code: 'NOT_FOUND' }]);
    }

    let parsedCode = existingPromo.code;
    if (payload.code) {
        parsedCode = toUpperUnderscore(payload.code);
        if (parsedCode !== existingPromo.code) {
            const conflicting = await prisma.promo.findUnique({ where: { code: parsedCode } });
            if (conflicting) {
                throw new AppError(400, 'Promo code already exists', [{ message: 'Code must be unique', code: 'UNIQUE_CONSTRAINT' }]);
            }
        }
    }

    return prisma.$transaction(async (tx) => {
        const updateData: any = {};
        if (payload.code) updateData.code = parsedCode;
        if (payload.discountType) updateData.discountType = payload.discountType;
        if (payload.discountValue !== undefined) updateData.discountValue = Number(payload.discountValue);
        if (payload.numberOfUses !== undefined) updateData.numberOfUses = Number(payload.numberOfUses);
        if (payload.startDate) updateData.startDate = new Date(payload.startDate);
        if (payload.endDate) updateData.endDate = new Date(payload.endDate);

        const promo = await tx.promo.update({
            where: { id },
            data: updateData
        });

        return tx.promo.findUnique({
            where: { id }
        });
    });
};

const deletePromo = async (id: string) => {
    return prisma.$transaction(async (tx) => {
        await tx.promo.delete({ where: { id } });
        return true;
    });
};

export const promoService = {
    getPromos,
    getAllPromos,
    getPromoById,
    getPromoByCode,
    createPromo,
    updatePromo,
    deletePromo
};
