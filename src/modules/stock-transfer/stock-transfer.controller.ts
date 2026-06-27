import { Request, Response } from 'express';
import { StockTransferStatus } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { sendResponse } from '../../common/utils/send-response.js';
import { stockTransferService } from './stock-transfer.service.js';
import {
  createStockTransferSchema,
  updateStockTransferSchema,
  receiveStockTransferSchema
} from './stock-transfer.validator.js';

const createTransfer = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const payload = createStockTransferSchema.parse(req.body);
  const data = await stockTransferService.createTransfer(payload, userId);

  sendResponse({ res, statusCode: 201, success: true, message: 'Stock Transfer created in DRAFT status', data });
};

const updateTransfer = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const id = req.params.id as string;
  const payload = updateStockTransferSchema.parse(req.body);
  const data = await stockTransferService.updateTransfer(id, payload, userId);

  sendResponse({ res, statusCode: 200, success: true, message: 'Stock Transfer updated successfully', data });
};

/**
 * PATCH /ship/:id
 * Transitions DRAFT → IN_TRANSIT
 * Validates and deducts stock from source location at this point.
 */
const shipTransfer = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const id = req.params.id as string;
  const data = await stockTransferService.shipTransfer(id, userId);

  sendResponse({ res, statusCode: 200, success: true, message: 'Stock Transfer marked IN_TRANSIT. Source stock deducted.', data });
};

/**
 * PATCH /receive/:id
 * Transitions IN_TRANSIT → RECEIVED
 * Credits stock to destination location based on actually received quantities.
 */
const receiveTransfer = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const id = req.params.id as string;
  const payload = receiveStockTransferSchema.parse(req.body);
  const data = await stockTransferService.receiveTransfer(id, payload, userId);

  sendResponse({ res, statusCode: 200, success: true, message: 'Stock Transfer received. Destination stock credited.', data });
};

const cancelTransfer = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const id = req.params.id as string;
  const data = await stockTransferService.cancelTransfer(id, userId);

  sendResponse({ res, statusCode: 200, success: true, message: 'Stock Transfer cancelled. Source stock restored if applicable.', data });
};

const getTransfers = async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const status = req.query.status as StockTransferStatus | undefined;
  const sourceLocationId = typeof req.query.sourceLocationId === 'string' ? req.query.sourceLocationId : undefined;
  const destinationLocationId = typeof req.query.destinationLocationId === 'string' ? req.query.destinationLocationId : undefined;
  const searchTerm = typeof req.query.searchTerm === 'string' ? req.query.searchTerm : undefined;

  const result = await stockTransferService.getTransfers({
    page, limit, status, sourceLocationId, destinationLocationId, searchTerm
  });

  sendResponse({ res, statusCode: 200, success: true, message: 'Stock Transfers fetched successfully', data: result.data, meta: result.meta });
};

const getTransfer = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const data = await stockTransferService.getTransferById(id);

  sendResponse({ res, statusCode: 200, success: true, message: 'Stock Transfer fetched successfully', data });
};

export const stockTransferController = {
  createTransfer,
  updateTransfer,
  shipTransfer,
  receiveTransfer,
  cancelTransfer,
  getTransfers,
  getTransfer
};
