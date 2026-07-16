import { Request, Response } from 'express';
import { StockAdjustmentStatus } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { sendResponse } from '../../common/utils/send-response.js';
import { stockAdjustmentService } from './stock-adjustment.service.js';
import {
  createStockAdjustmentSchema,
  updateStockAdjustmentSchema
} from './stock-adjustment.validator.js';

const createStockAdjustment = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const payload = createStockAdjustmentSchema.parse(req.body);
  const data = await stockAdjustmentService.createStockAdjustment(payload, userId);

  sendResponse({ res, statusCode: 201, success: true, message: 'Stock Adjustment created in DRAFT status', data });
};

const updateStockAdjustment = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const id = req.params.id as string;
  const payload = updateStockAdjustmentSchema.parse(req.body);
  const data = await stockAdjustmentService.updateStockAdjustment(id, payload, userId);

  sendResponse({ res, statusCode: 200, success: true, message: 'Stock Adjustment updated successfully', data });
};

const completeStockAdjustment = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const id = req.params.id as string;
  const data = await stockAdjustmentService.completeStockAdjustment(id, userId);

  sendResponse({ res, statusCode: 200, success: true, message: 'Stock Adjustment completed. Stock quantities updated.', data });
};

const cancelStockAdjustment = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const id = req.params.id as string;
  const data = await stockAdjustmentService.cancelStockAdjustment(id, userId);

  sendResponse({ res, statusCode: 200, success: true, message: 'Stock Adjustment cancelled.', data });
};

const getAdjustments = async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined;
  const status = req.query.status as StockAdjustmentStatus | undefined;

  const result = await stockAdjustmentService.getAdjustments({ page, limit, locationId, status });

  sendResponse({ res, statusCode: 200, success: true, message: 'Stock Adjustments fetched', data: result.data, meta: result.meta });
};

const getAdjustment = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const data = await stockAdjustmentService.getAdjustmentById(id);

  sendResponse({ res, statusCode: 200, success: true, message: 'Stock Adjustment fetched', data });
};

export const stockAdjustmentController = {
  createStockAdjustment,
  updateStockAdjustment,
  completeStockAdjustment,
  cancelStockAdjustment,
  getAdjustments,
  getAdjustment
};
