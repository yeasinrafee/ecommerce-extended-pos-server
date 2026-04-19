import type { PaymentMethod } from '@prisma/client';

export type PosPaymentJobLine = {
	amount: number;
	paymentMethod: PaymentMethod;
	bankId: string | null;
};

export type PosPaymentJobData = {
	orderId: string;
	payments: PosPaymentJobLine[];
};

export type PosPaymentStatusJobData = {
	orderId: string;
};