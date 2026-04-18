import { Request, Response } from 'express';
import { sendResponse } from '../../common/utils/send-response.js';
import { AppError } from '../../common/errors/app-error.js';
import { zoneService } from './zone.service.js';
import { fromUpperUnderscore } from '../../common/utils/format.js';
import type { CreateZoneDto } from './zone.types.js';

const createZone = async (req: Request, res: Response) => {
  const { name } = req.body || {};
  if (!name) {
    throw new AppError(400, 'Missing required field', [{ message: 'name is required', code: 'MISSING_FIELDS' }]);
  }

  const existing = await zoneService.findByName(name);
  if (existing) {
    throw new AppError(400, 'Zone name already exists', [{ message: 'A zone with that name exists', code: 'NAME_CONFLICT' }]);
  }

  const created = await zoneService.createZone({ name } as CreateZoneDto);
  const result = { ...created, name: fromUpperUnderscore(created.name) };

  sendResponse({ res, statusCode: 201, success: true, message: 'Zone created', data: result });
};

const updateZone = async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const payload = req.body || {};
  if (payload.name) {
    const conflict = await zoneService.findByName(payload.name);
    if (conflict && conflict.id !== id) {
      throw new AppError(400, 'Zone name already exists', [{ message: 'Another zone uses this name', code: 'NAME_CONFLICT' }]);
    }
  }

  const updated = await zoneService.updateZone(id, payload);
  const result = { ...updated, name: fromUpperUnderscore(updated.name) };

  sendResponse({ res, statusCode: 200, success: true, message: 'Zone updated', data: result });
};

const getZones = async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const searchTerm = typeof req.query.searchTerm === 'string' ? req.query.searchTerm : undefined;

  const result = await zoneService.getZones({ page, limit, searchTerm });
  const data = result.data.map((z: any) => ({ ...z, name: fromUpperUnderscore(z.name) }));

  sendResponse({ res, statusCode: 200, success: true, message: 'Zones fetched', data, meta: { ...result.meta, timestamp: new Date().toISOString() } });
};

const getAllZones = async (req: Request, res: Response) => {
  const zs = await zoneService.getAllZones();
  const data = zs.map((z: any) => ({ ...z, name: fromUpperUnderscore(z.name) }));

  sendResponse({ res, statusCode: 200, success: true, message: 'All zones fetched', data });
};

const getAvailableZones = async (req: Request, res: Response) => {
  const zs = await zoneService.getAvailableZones();
  const data = zs.map((z: any) => ({ ...z, name: fromUpperUnderscore(z.name) }));

  sendResponse({ res, statusCode: 200, success: true, message: 'Available zones fetched', data });
};

const getZone = async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const z = await zoneService.getZoneById(id);
  const result = { ...z, name: fromUpperUnderscore(z.name) };

  sendResponse({ res, statusCode: 200, success: true, message: 'Zone fetched', data: result });
};

const deleteZone = async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await zoneService.deleteZone(id);

  sendResponse({ res, statusCode: 200, success: true, message: 'Zone deleted', data: null });
};

export const zoneController = {
  createZone,
  updateZone,
  getZones,
  getAllZones,
  getAvailableZones,
  getZone,
  deleteZone
};
