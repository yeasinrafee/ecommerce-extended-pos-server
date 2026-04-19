import type { Job } from 'bullmq';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { createQueue, createWorker } from '../../common/services/mq.service.js';
import { prisma } from '../../config/prisma.js';
import type { PosPaymentJobData, PosPaymentJobLine } from './pos-payment.types.js';

const roundMoney = (value: number) => Number(value.toFixed(2));

const paymentMethodSet = new Set<PaymentMethod>([
	PaymentMethod.CASH,
	PaymentMethod.BANKCARD,
	PaymentMethod.BKASH,
	PaymentMethod.NAGAD,
	PaymentMethod.ROCKET
]);

const normalizePaymentLine = (line: PosPaymentJobLine) => {
	const amount = typeof line.amount === 'number' ? line.amount : Number(line.amount);
	if (!Number.isFinite(amount) || amount <= 0) {
		throw new Error('Invalid payment amount');
	}

	if (!paymentMethodSet.has(line.paymentMethod)) {
		throw new Error('Invalid payment method');
	}

	const bankId = typeof line.bankId === 'string' && line.bankId.trim().length > 0 ? line.bankId.trim() : null;

	if (line.paymentMethod === PaymentMethod.BANKCARD && !bankId) {
		throw new Error('bankId is required when paymentMethod is BANKCARD');
	}

	if (line.paymentMethod !== PaymentMethod.BANKCARD && bankId) {
		throw new Error('bankId is only allowed when paymentMethod is BANKCARD');
	}

	return {
		amount: roundMoney(amount),
		paymentMethod: line.paymentMethod,
		bankId: line.paymentMethod === PaymentMethod.BANKCARD ? bankId : null
	};
};

const resolvePaymentStatus = (finalAmount: number, paidAmount: number) => {
	if (finalAmount <= 0 || paidAmount >= finalAmount) {
		return PaymentStatus.PAID;
	}

	if (paidAmount > 0) {
		return PaymentStatus.DUE;
	}

	return PaymentStatus.PENDING;
};

const getPaidAmount = async (orderId: string) => {
	const paidAggregate = await prisma.globalPayment.aggregate({
		where: {
			posOrderId: orderId,
			deletedAt: null
		},
		_sum: {
			amount: true
		}
	});

	return roundMoney(paidAggregate._sum.amount ?? 0);
};

const processPayments = async (orderId: string, payments: PosPaymentJobLine[]) => {
	if (payments.length === 0) {
		return;
	}

	const normalizedPayments = payments.map(normalizePaymentLine);

	await prisma.$transaction(async (tx) => {
		const order = await tx.posOrder.findFirst({
			where: {
				id: orderId,
				deletedAt: null
			},
			select: {
				id: true,
				finalAmount: true
			}
		});

		if (!order) {
			throw new Error('POS order not found for payment processing');
		}

		const bankIds = Array.from(new Set(normalizedPayments.map((line) => line.bankId).filter((id): id is string => id !== null)));
		if (bankIds.length > 0) {
			const banks = await tx.bank.findMany({
				where: {
					id: { in: bankIds },
					deletedAt: null
				},
				select: { id: true }
			});

			if (banks.length !== bankIds.length) {
				throw new Error('Invalid bankId in payment payload');
			}
		}

		const paidAggregate = await tx.globalPayment.aggregate({
			where: {
				posOrderId: order.id,
				deletedAt: null
			},
			_sum: {
				amount: true
			}
		});

		const paidBefore = roundMoney(paidAggregate._sum.amount ?? 0);
		const incomingTotal = roundMoney(normalizedPayments.reduce((sum, line) => sum + line.amount, 0));

		if (roundMoney(paidBefore + incomingTotal) > roundMoney(order.finalAmount)) {
			throw new Error('Overpayment is not allowed');
		}

		await tx.globalPayment.createMany({
			data: normalizedPayments.map((line) => ({
				posOrderId: order.id,
				amount: line.amount,
				paymentMethod: line.paymentMethod,
				bankId: line.bankId
			}))
		});

		const paidAfter = roundMoney(paidBefore + incomingTotal);

		await tx.posOrder.update({
			where: { id: order.id },
			data: {
				paymentStatus: resolvePaymentStatus(order.finalAmount, paidAfter)
			}
		});
	});
};

export const posPaymentQueue = createQueue('pos_payment_queue', { verify: true });

export const posPaymentWorker = createWorker(
	'pos_payment_queue',
	async (job: Job) => {
		if (job.name !== 'process_pos_order_payments') {
			return;
		}

		const data = job.data as PosPaymentJobData;
		await processPayments(data.orderId, data.payments);
	},
	1,
	{ verify: true }
);

const enqueuePayments = async (orderId: string, payments: PosPaymentJobLine[]) => {
	if (payments.length === 0) {
		return;
	}

	await posPaymentQueue.add('process_pos_order_payments', {
		orderId,
		payments
	});
};

export const posPaymentService = {
	enqueuePayments,
	getPaidAmount
};