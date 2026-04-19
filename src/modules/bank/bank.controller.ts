import type { Request, Response } from 'express';
import { z } from 'zod';
import { sendResponse } from '../../common/utils/send-response.js';
import { bankService } from './bank.service.js';

const bankTextSchema = z.preprocess((value) => {
	if (typeof value !== 'string') {
		return value;
	}

	return value.trim();
}, z.string().min(1));

const optionalBankTextSchema = z.preprocess((value) => {
	if (value === undefined) {
		return undefined;
	}

	if (typeof value !== 'string') {
		return value;
	}

	return value.trim();
}, z.string().min(1).optional());

const createBankBodySchema = z.object({
	bankName: bankTextSchema,
	branch: bankTextSchema,
	accountNumber: bankTextSchema
});

const updateBankBodySchema = z.object({
	bankName: optionalBankTextSchema,
	branch: optionalBankTextSchema,
	accountNumber: optionalBankTextSchema
});

const getIdParam = (value: string | string[] | undefined) => String(Array.isArray(value) ? value[0] : value);

const getAllBanks = async (req: Request, res: Response) => {
	const searchTerm = typeof req.query.searchTerm === 'string' ? req.query.searchTerm.trim() : undefined;
	const data = await bankService.getAllBanks(searchTerm || undefined);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Banks fetched',
		data
	});
};

const createBank = async (req: Request, res: Response) => {
	const parsed = createBankBodySchema.parse({
		bankName: req.body.bankName,
		branch: req.body.branch,
		accountNumber: req.body.accountNumber
	});

	const data = await bankService.createBank(parsed);

	sendResponse({
		res,
		statusCode: 201,
		success: true,
		message: 'Bank created',
		data
	});
};

const updateBank = async (req: Request, res: Response) => {
	const id = getIdParam(req.params.id);
	const parsed = updateBankBodySchema.parse({
		bankName: req.body.bankName,
		branch: req.body.branch,
		accountNumber: req.body.accountNumber
	});

	const data = await bankService.updateBank(id, parsed);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Bank updated',
		data
	});
};

const deleteBank = async (req: Request, res: Response) => {
	const id = getIdParam(req.params.id);
	await bankService.deleteBank(id);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Bank deleted',
		data: null
	});
};

export const bankController = {
	getAllBanks,
	createBank,
	updateBank,
	deleteBank
};