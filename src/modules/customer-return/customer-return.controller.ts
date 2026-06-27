import { Request, Response } from 'express';
import { CustomerReturnStatus } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { sendResponse } from '../../common/utils/send-response.js';
import { customerReturnService } from './customer-return.service.js';
import { createCustomerReturnSchema, updateCustomerReturnSchema } from './customer-return.validator.js';

const createCustomerReturn = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const payload = createCustomerReturnSchema.parse(req.body);
  const data = await customerReturnService.createCustomerReturn(payload, userId);

  sendResponse({ res, statusCode: 201, success: true, message: 'Customer Return created in PENDING status', data });
};

const updateCustomerReturn = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const id = req.params.id as string;
  const payload = updateCustomerReturnSchema.parse(req.body);
  const data = await customerReturnService.updateCustomerReturn(id, payload, userId);

  sendResponse({ res, statusCode: 200, success: true, message: 'Customer Return updated successfully', data });
};

const refundCustomerReturn = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const id = req.params.id as string;
  const data = await customerReturnService.refundCustomerReturn(id, userId);

  sendResponse({ res, statusCode: 200, success: true, message: 'Customer Return refunded. Stock credited to location.', data });
};

const cancelCustomerReturn = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const id = req.params.id as string;
  const data = await customerReturnService.cancelCustomerReturn(id, userId);

  sendResponse({ res, statusCode: 200, success: true, message: 'Customer Return cancelled.', data });
};

const getCustomerReturns = async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined;
  const status = req.query.status as CustomerReturnStatus | undefined;

  const result = await customerReturnService.getCustomerReturns({ page, limit, locationId, status });

  sendResponse({ res, statusCode: 200, success: true, message: 'Customer Returns fetched', data: result.data, meta: result.meta });
};

const getCustomerReturn = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const data = await customerReturnService.getCustomerReturnById(id);

  sendResponse({ res, statusCode: 200, success: true, message: 'Customer Return fetched', data });
};

export const customerReturnController = {
  createCustomerReturn,
  updateCustomerReturn,
  refundCustomerReturn,
  cancelCustomerReturn,
  getCustomerReturns,
  getCustomerReturn
};
