import { DiscountType } from '@prisma/client';

export type CreatePromoDto = {
    code: string;
    discountType: DiscountType;
    discountValue: number;
    numberOfUses: number;
    startDate: string | Date;
    endDate: string | Date;
};

export type UpdatePromoDto = Partial<CreatePromoDto>;

export type PromoListQuery = {
    page?: number;
    limit?: number;
    searchTerm?: string;
};
