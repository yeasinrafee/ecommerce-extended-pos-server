import { Request, Response } from 'express';
import { PurchaseOrderStatus } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { sendResponse } from '../../common/utils/send-response.js';
import { purchaseOrderService } from './purchase-order.service.js';
import { createPurchaseOrderSchema, updatePurchaseOrderSchema } from './purchase-order.validator.js';

const createPurchaseOrder = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const payload = createPurchaseOrderSchema.parse(req.body);
  const data = await purchaseOrderService.createPurchaseOrder(payload, userId);

  sendResponse({
    res,
    statusCode: 201,
    success: true,
    message: 'Purchase Order created in DRAFT status',
    data
  });
};

const updatePurchaseOrder = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const id = req.params.id as string;
  const payload = updatePurchaseOrderSchema.parse(req.body);
  const data = await purchaseOrderService.updatePurchaseOrder(id, payload, userId);

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: 'Purchase Order updated',
    data
  });
};

const approvePurchaseOrder = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const id = req.params.id as string;
  const data = await purchaseOrderService.approvePurchaseOrder(id, userId);

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: 'Purchase Order approved',
    data
  });
};

const cancelPurchaseOrder = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const id = req.params.id as string;
  const data = await purchaseOrderService.cancelPurchaseOrder(id, userId);

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: 'Purchase Order cancelled',
    data
  });
};

const getPurchaseOrders = async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const searchTerm = typeof req.query.searchTerm === 'string' ? req.query.searchTerm : undefined;
  const status = req.query.status as PurchaseOrderStatus | undefined;
  const supplierId = req.query.supplierId ? Number(req.query.supplierId) : undefined;
  const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined;

  const result = await purchaseOrderService.getPurchaseOrders({
    page,
    limit,
    searchTerm,
    status,
    supplierId,
    locationId
  });

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: 'Purchase Orders fetched',
    data: result.data,
    meta: result.meta
  });
};

const getPurchaseOrder = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const data = await purchaseOrderService.getPurchaseOrderById(id);

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: 'Purchase Order fetched',
    data
  });
};

export const purchaseOrderController = {
  createPurchaseOrder,
  updatePurchaseOrder,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrder
};
