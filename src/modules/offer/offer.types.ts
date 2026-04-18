import type { DiscountType, Status } from '@prisma/client';

export type OfferDiscountDto = {
	discountType?: DiscountType | null;
	discountValue?: number | null;
	discountStartDate?: Date | null;
	discountEndDate?: Date | null;
	status?: Status;
};

export type CreateOfferDto = OfferDiscountDto & {
	productIds: string[];
};

export type UpdateOfferDto = OfferDiscountDto & {
	productIds?: string[];
};

export type BulkUpdateOfferStatusDto = {
	ids: string[];
	status: Status;
};

export type OfferListQuery = {
	page?: number;
	limit?: number;
};
