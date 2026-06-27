import { Request, Response } from 'express';
import { SupplierReturnStatus } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { sendResponse } from '../../common/utils/send-response.js';
import { supplierReturnService } from './supplier-return.service.js';
import { createSupplierReturnSchema, updateSupplierReturnSchema } from './supplier-return.validator.js';

const createSupplierReturn = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const payload = createSupplierReturnSchema.parse(req.body);
  const data = await supplierReturnService.createSupplierReturn(payload, userId);

  sendResponse({ res, statusCode: 201, success: true, message: 'Supplier Return created in DRAFT status', data });
};

const updateSupplierReturn = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const id = req.params.id as string;
  const payload = updateSupplierReturnSchema.parse(req.body);
  const data = await supplierReturnService.updateSupplierReturn(id, payload, userId);

  sendResponse({ res, statusCode: 200, success: true, message: 'Supplier Return updated successfully', data });
};

const completeSupplierReturn = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const id = req.params.id as string;
  const data = await supplierReturnService.completeSupplierReturn(id, userId);

  sendResponse({ res, statusCode: 200, success: true, message: 'Supplier Return completed. Stock deducted and supplier balance updated.', data });
};

const cancelSupplierReturn = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const id = req.params.id as string;
  const data = await supplierReturnService.cancelSupplierReturn(id, userId);

  sendResponse({ res, statusCode: 200, success: true, message: 'Supplier Return cancelled.', data });
};

const getSupplierReturns = async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const supplierId = req.query.supplierId ? Number(req.query.supplierId) : undefined;
  const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined;
  const status = req.query.status as SupplierReturnStatus | undefined;

  const result = await supplierReturnService.getSupplierReturns({ page, limit, supplierId, locationId, status });

  sendResponse({ res, statusCode: 200, success: true, message: 'Supplier Returns fetched', data: result.data, meta: result.meta });
};

const getSupplierReturn = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const data = await supplierReturnService.getSupplierReturnById(id);

  sendResponse({ res, statusCode: 200, success: true, message: 'Supplier Return fetched', data });
};

export const supplierReturnController = {
  createSupplierReturn,
  updateSupplierReturn,
  completeSupplierReturn,
  cancelSupplierReturn,
  getSupplierReturns,
  getSupplierReturn
};
