import { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { sendResponse } from '../../common/utils/send-response.js';
import { goodsReceiveService } from './goods-receive.service.js';
import { createGoodsReceiveSchema } from './goods-receive.validator.js';

const createGoodsReceive = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Unauthorized');

  const payload = createGoodsReceiveSchema.parse(req.body);
  const data = await goodsReceiveService.createGoodsReceive(payload, userId);

  sendResponse({
    res,
    statusCode: 201,
    success: true,
    message: 'Goods received and stock updated successfully',
    data
  });
};

const getGoodsReceives = async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const searchTerm = typeof req.query.searchTerm === 'string' ? req.query.searchTerm : undefined;
  const supplierId = req.query.supplierId ? Number(req.query.supplierId) : undefined;
  const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined;

  const result = await goodsReceiveService.getGoodsReceives({
    page,
    limit,
    searchTerm,
    supplierId,
    locationId
  });

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: 'Goods Receive Notes fetched',
    data: result.data,
    meta: result.meta
  });
};

const getGoodsReceive = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const data = await goodsReceiveService.getGoodsReceiveById(id);

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: 'Goods Receive Note fetched',
    data
  });
};

export const goodsReceiveController = {
  createGoodsReceive,
  getGoodsReceives,
  getGoodsReceive
};
