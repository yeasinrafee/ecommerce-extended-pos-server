import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import type { CreateBankDto, UpdateBankDto } from './bank.types.js';

const normalizeText = (value: string) => value.trim();

const findBankConflict = async (
	tx: Prisma.TransactionClient,
	params: {
		bankName: string;
		accountNumber: string;
		excludeId?: string;
	}
) => {
	return tx.bank.findFirst({
		where: {
			deletedAt: null,
			bankName: { equals: params.bankName, mode: 'insensitive' },
			accountNumber: params.accountNumber,
			...(params.excludeId ? { id: { not: params.excludeId } } : {})
		},
		select: {
			id: true
		}
	});
};

const assertUniqueBank = async (
	tx: Prisma.TransactionClient,
	params: {
		bankName: string;
		accountNumber: string;
		excludeId?: string;
	}
) => {
	const conflict = await findBankConflict(tx, params);

	if (conflict) {
		throw new AppError(400, 'Bank already exists', [
			{
				message: 'Another active bank record already uses the same bank name and account number.',
				code: 'BANK_ACCOUNT_CONFLICT'
			}
		]);
	}
};

const getAllBanks = async () => {
	return prisma.bank.findMany({
		where: {
			deletedAt: null
		},
		orderBy: {
			createdAt: 'desc'
		}
	});
};

const createBank = async (payload: CreateBankDto) => {
	const bankName = normalizeText(payload.bankName);
	const branch = normalizeText(payload.branch);
	const accountNumber = normalizeText(payload.accountNumber);

	return prisma.$transaction(async (tx) => {
		await assertUniqueBank(tx, {
			bankName,
			accountNumber
		});

		return tx.bank.create({
			data: {
				bankName,
				branch,
				accountNumber
			}
		});
	});
};

const updateBank = async (id: string, payload: UpdateBankDto) => {
	return prisma.$transaction(async (tx) => {
		const existing = await tx.bank.findFirst({
			where: {
				id,
				deletedAt: null
			},
			select: {
				id: true,
				bankName: true,
				branch: true,
				accountNumber: true
			}
		});

		if (!existing) {
			throw new AppError(404, 'Bank not found', [
				{
					message: 'We could not find an active bank record with that id.',
					code: 'BANK_NOT_FOUND'
				}
			]);
		}

		const bankName = payload.bankName !== undefined ? normalizeText(payload.bankName) : existing.bankName;
		const branch = payload.branch !== undefined ? normalizeText(payload.branch) : existing.branch;
		const accountNumber = payload.accountNumber !== undefined ? normalizeText(payload.accountNumber) : existing.accountNumber;

		await assertUniqueBank(tx, {
			bankName,
			accountNumber,
			excludeId: id
		});

		return tx.bank.update({
			where: {
				id
			},
			data: {
				bankName,
				branch,
				accountNumber
			}
		});
	});
};

const deleteBank = async (id: string) => {
	const existing = await prisma.bank.findFirst({
		where: {
			id,
			deletedAt: null
		},
		select: {
			id: true
		}
	});

	if (!existing) {
		throw new AppError(404, 'Bank not found', [
			{
				message: 'We could not find an active bank record with that id.',
				code: 'BANK_NOT_FOUND'
			}
		]);
	}

	await prisma.bank.update({
		where: {
			id
		},
		data: {
			deletedAt: new Date()
		}
	});

	return true;
};

export const bankService = {
	getAllBanks,
	createBank,
	updateBank,
	deleteBank
};