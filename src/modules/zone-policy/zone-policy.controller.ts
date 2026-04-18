import { Request, Response } from 'express';
import { sendResponse } from '../../common/utils/send-response.js';
import { AppError } from '../../common/errors/app-error.js';
import { zonePolicyService } from './zone-policy.service.js';
import type { CreateZonePolicyDto } from './zone-policy.types.js';

const createZonePolicy = async (req: Request, res: Response) => {
  const body = req.body || {};
  const { policyName, deliveryTime, shippingCost, status } = body;

  if (!policyName || deliveryTime === undefined || shippingCost === undefined) {
    throw new AppError(400, 'Missing required fields', [{ message: 'policyName, deliveryTime and shippingCost are required', code: 'MISSING_FIELDS' }]);
  }

  const zoneIds = Array.isArray(body.zoneIds) ? body.zoneIds.map(String) : undefined;

  const dto: CreateZonePolicyDto = {
    policyName: String(policyName),
    deliveryTime: Number(deliveryTime),
    shippingCost: Number(shippingCost),
    status: status === undefined ? undefined : String(status) as any,
    zoneIds
  };

  const created = await zonePolicyService.createZonePolicy(dto);

  sendResponse({ res, statusCode: 201, success: true, message: 'ZonePolicy created', data: created });
};

const updateZonePolicy = async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const payload = req.body || {};
  const numericFields = ['deliveryTime', 'shippingCost'];
  const castPayload: any = { ...payload };
  numericFields.forEach((f) => {
    if (f in castPayload) {
      castPayload[f] = castPayload[f] === null ? null : Number(castPayload[f]);
    }
  });

  // ensure zoneIds is an array of strings if provided
  if ('zoneIds' in payload) {
    castPayload.zoneIds = Array.isArray(payload.zoneIds) ? payload.zoneIds.map(String) : [];
  }

  const updated = await zonePolicyService.updateZonePolicy(id, castPayload);

  sendResponse({ res, statusCode: 200, success: true, message: 'ZonePolicy updated', data: updated });
};

const getZonePolicies = async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const searchTerm = typeof req.query.searchTerm === 'string' ? req.query.searchTerm : undefined;

  const result = await zonePolicyService.getZonePolicies({ page, limit, searchTerm });

  sendResponse({ res, statusCode: 200, success: true, message: 'Zone policies fetched', data: result.data, meta: { ...result.meta, timestamp: new Date().toISOString() } });
};

const getAllZonePolicies = async (req: Request, res: Response) => {
  const data = await zonePolicyService.getAllZonePolicies();
  sendResponse({ res, statusCode: 200, success: true, message: 'All zone policies fetched', data });
};

const getZonePolicyById = async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const p = await zonePolicyService.getZonePolicyById(id);
  sendResponse({ res, statusCode: 200, success: true, message: 'ZonePolicy fetched', data: p });
};

const deleteZonePolicy = async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await zonePolicyService.deleteZonePolicy(id);
  sendResponse({ res, statusCode: 200, success: true, message: 'ZonePolicy deleted', data: null });
};

const bulkUpdateStatus = async (req: Request, res: Response) => {
  const body = req.body || {};
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
  const status = typeof body.status === 'string' ? body.status : undefined;

  if (!status) {
    throw new AppError(400, 'Missing required field', [{ message: 'status is required', code: 'MISSING_FIELDS' }]);
  }

  const updated = await zonePolicyService.bulkUpdateStatus(ids, status);

  sendResponse({ res, statusCode: 200, success: true, message: 'Zone policies updated', data: { updated } });
};

export const zonePolicyController = {
  createZonePolicy,
  updateZonePolicy,
  getZonePolicies,
  getAllZonePolicies,
  getZonePolicyById,
  bulkUpdateStatus,
  deleteZonePolicy
};
