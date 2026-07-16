import { Request, Response } from 'express';
import { DamageStatus } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { sendResponse } from '../../common/utils/send-response.js';
import { damageService } from './damage.service.js';
import { createDamageSchema, updateDamageSchema } from './damage.validator.js';

const createDamage = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const payload = createDamageSchema.parse(req.body);
  const data = await damageService.createDamage(payload, userId);

  sendResponse({ res, statusCode: 201, success: true, message: 'Damage report created in DRAFT status', data });
};

const updateDamage = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const id = req.params.id as string;
  const payload = updateDamageSchema.parse(req.body);
  const data = await damageService.updateDamage(id, payload, userId);

  sendResponse({ res, statusCode: 200, success: true, message: 'Damage report updated successfully', data });
};

const completeDamage = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const id = req.params.id as string;
  const data = await damageService.completeDamage(id, userId);

  sendResponse({ res, statusCode: 200, success: true, message: 'Damage report completed. Stock quantities written off.', data });
};

const cancelDamage = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const id = req.params.id as string;
  const data = await damageService.cancelDamage(id, userId);

  sendResponse({ res, statusCode: 200, success: true, message: 'Damage report cancelled.', data });
};

const getDamages = async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined;
  const status = req.query.status as DamageStatus | undefined;

  const result = await damageService.getDamages({ page, limit, locationId, status });

  sendResponse({ res, statusCode: 200, success: true, message: 'Damage reports fetched', data: result.data, meta: result.meta });
};

const getDamage = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const data = await damageService.getDamageById(id);

  sendResponse({ res, statusCode: 200, success: true, message: 'Damage report fetched', data });
};

export const damageController = {
  createDamage,
  updateDamage,
  completeDamage,
  cancelDamage,
  getDamages,
  getDamage
};
