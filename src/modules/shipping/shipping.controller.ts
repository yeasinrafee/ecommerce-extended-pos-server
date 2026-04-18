import { Request, Response } from 'express';
import { sendResponse } from '../../common/utils/send-response.js';
import { AppError } from '../../common/errors/app-error.js';
import { shippingService } from './shipping.service.js';
import type { CreateShippingDto } from './shipping.types.js';

const createShipping = async (req: Request, res: Response) => {
  const body = req.body || {};
  const { minimumFreeShippingAmount, tax, maximumWeight, maximumVolume, chargePerWeight, chargePerVolume, length, width, height, weightUnit, volumeUnit } = body;

  if (minimumFreeShippingAmount === undefined || tax === undefined) {
    throw new AppError(400, 'Missing required fields', [
      { message: 'minimumFreeShippingAmount and tax are required', code: 'MISSING_FIELDS' }
    ]);
  }

  const dto: CreateShippingDto = {
    minimumFreeShippingAmount: Number(minimumFreeShippingAmount),
    tax: Number(tax),
    maximumWeight: maximumWeight !== undefined && maximumWeight !== null ? Number(maximumWeight) : undefined,
    // Accept either explicit maximumVolume or dimensions (length,width,height in cm). Service will compute final volume.
    maximumVolume: maximumVolume !== undefined && maximumVolume !== null ? Number(maximumVolume) : undefined,
    length: length !== undefined && length !== null ? Number(length) : undefined,
    width: width !== undefined && width !== null ? Number(width) : undefined,
    height: height !== undefined && height !== null ? Number(height) : undefined,
    chargePerWeight: chargePerWeight !== undefined && chargePerWeight !== null ? Number(chargePerWeight) : undefined,
    chargePerVolume: chargePerVolume !== undefined && chargePerVolume !== null ? Number(chargePerVolume) : undefined,
    weightUnit: weightUnit !== undefined && weightUnit !== null ? Number(weightUnit) : undefined,
    volumeUnit: volumeUnit !== undefined && volumeUnit !== null ? Number(volumeUnit) : undefined
  };

  const created = await shippingService.createShipping(dto);

  sendResponse({ res, statusCode: 201, success: true, message: 'Shipping created', data: created });
};

const updateShipping = async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const payload = req.body || {};
  const numericFields = ['minimumFreeShippingAmount', 'tax', 'maximumWeight', 'maximumVolume', 'chargePerWeight', 'chargePerVolume', 'length', 'width', 'height', 'weightUnit', 'volumeUnit'];
  const castPayload: any = { ...payload };
  numericFields.forEach((f) => {
    if (f in castPayload) {
      castPayload[f] = castPayload[f] === null ? null : Number(castPayload[f]);
    }
  });

  const updated = await shippingService.updateShipping(id, castPayload);

  sendResponse({ res, statusCode: 200, success: true, message: 'Shipping updated', data: updated });
};

const getShipping = async (req: Request, res: Response) => {
  const s = await shippingService.getShipping();
  if (!s) {
    sendResponse({
      res,
      statusCode: 404,
      success: false,
      message: 'Shipping not found',
      data: null,
      errors: [{ message: 'Shipping record does not exist', code: 'NOT_FOUND' }]
    });
    return;
  }

  sendResponse({ res, statusCode: 200, success: true, message: 'Shipping fetched', data: s });
};

const getShippingById = async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const s = await shippingService.getShippingById(id);
  sendResponse({ res, statusCode: 200, success: true, message: 'Shipping fetched', data: s });
};

const deleteShipping = async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await shippingService.deleteShipping(id);

  sendResponse({ res, statusCode: 200, success: true, message: 'Shipping deleted', data: null });
};

const resetShipping = async (req: Request, res: Response) => {
  await shippingService.resetShipping();

  sendResponse({ res, statusCode: 200, success: true, message: 'Shipping reset', data: null });
};

export const shippingController = {
  createShipping,
  updateShipping,
  getShipping,
  getShippingById,
  deleteShipping
  ,resetShipping
};
