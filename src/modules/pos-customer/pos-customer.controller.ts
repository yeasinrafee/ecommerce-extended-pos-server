import type { Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error.js';
import { sendResponse } from '../../common/utils/send-response.js';
import { posCustomerService } from './pos-customer.service.js';

const createCustomerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(1, 'Phone is required'),
});

const updateCustomerSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
});

const getCustomers = async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.max(1, Number(req.query.limit ?? 20));
  const searchTerm =
    typeof req.query.searchTerm === 'string'
      ? req.query.searchTerm.trim() || undefined
      : undefined;

  const result = await posCustomerService.getCustomers({
    page,
    limit,
    searchTerm,
  });

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: 'POS customers fetched',
    data: result.data,
    meta: result.meta,
  });
};

const getCustomer = async (req: Request, res: Response) => {
  const id = String(req.params.id ?? '').trim();
  if (!id) {
    throw new AppError(400, 'Customer ID is required', [
      {
        field: 'id',
        message: 'Customer ID path param is required',
        code: 'INVALID_ID',
      },
    ]);
  }

  const customer = await posCustomerService.getCustomerById(id);

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: 'POS customer fetched',
    data: customer,
  });
};

const getCustomerOrders = async (req: Request, res: Response) => {
  const id = String(req.params.id ?? '').trim();
  if (!id) {
    throw new AppError(400, 'Customer ID is required', [
      {
        field: 'id',
        message: 'Customer ID path param is required',
        code: 'INVALID_ID',
      },
    ]);
  }

  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.max(1, Number(req.query.limit ?? 10));

  const result = await posCustomerService.getCustomerOrders(id, {
    page,
    limit,
  });

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: 'Customer orders fetched',
    data: result.data,
    meta: result.meta,
  });
};

const createCustomer = async (req: Request, res: Response) => {
  const parsed = createCustomerSchema.parse(req.body);

  const customer = await posCustomerService.createCustomer({
    name: parsed.name,
    phone: parsed.phone,
  });

  sendResponse({
    res,
    statusCode: 201,
    success: true,
    message: 'POS customer created',
    data: customer,
  });
};

const updateCustomer = async (req: Request, res: Response) => {
  const id = String(req.params.id ?? '').trim();
  if (!id) {
    throw new AppError(400, 'Customer ID is required', [
      {
        field: 'id',
        message: 'Customer ID path param is required',
        code: 'INVALID_ID',
      },
    ]);
  }

  const parsed = updateCustomerSchema.parse(req.body);

  const customer = await posCustomerService.updateCustomer(id, {
    name: parsed.name,
  });

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: 'POS customer updated',
    data: customer,
  });
};

const deleteCustomer = async (req: Request, res: Response) => {
  const id = String(req.params.id ?? '').trim();
  if (!id) {
    throw new AppError(400, 'Customer ID is required', [
      {
        field: 'id',
        message: 'Customer ID path param is required',
        code: 'INVALID_ID',
      },
    ]);
  }

  await posCustomerService.deleteCustomer(id);

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: 'POS customer deleted',
    data: null,
  });
};

export const posCustomerController = {
  getCustomers,
  getCustomer,
  getCustomerOrders,
  createCustomer,
  updateCustomer,
  deleteCustomer,
};
