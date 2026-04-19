import type { DiscountType, PaymentMethod } from '@prisma/client';
import type { PaymentStatus } from '@prisma/client';

export type PosProductsQuery = {
	storeId?: string;
	searchTerm?: string;
};

export type PosBillsListQuery = {
	page?: number;
	limit?: number;
	paymentStatus?: PaymentStatus;
};

export type PosVariationLineInput = {
	variationId?: string;
	quantity?: number;
};

export type PosProductLineInput = {
	productId?: string;
	quantity?: number;
	variationId?: string;
	variationIds?: string[];
	variationQuantities?: number[];
	variations?: PosVariationLineInput[];
};

export type PosPaymentLineInput = {
	amount?: number;
	paymentMethod?: PaymentMethod;
	bankId?: string;
};

export type CreatePosBillInput = {
	storeId?: string;
	discountType?: DiscountType;
	discountValue?: number;
	payments?: PosPaymentLineInput[];
	productId?: string;
	quantity?: number;
	productIds?: string[];
	quantities?: number[];
	variationId?: string;
	variationIds?: string[];
	variationQuantities?: number[];
	products?: PosProductLineInput[];
};

export type UpdatePosBillInput = CreatePosBillInput;

export type NormalizedPosBillLine = {
	productId: string;
	quantity: number;
	variationIds: string[];
};

export type NormalizedPosPaymentLine = {
	amount: number;
	paymentMethod: PaymentMethod;
	bankId: string | null;
};