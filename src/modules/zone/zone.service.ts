import { prisma } from '../../config/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import { toUpperUnderscore } from '../../common/utils/format.js';
import type { CreateZoneDto, UpdateZoneDto, ZoneListQuery, ServiceListResult } from './zone.types.js';
import type { Prisma } from '@prisma/client';

const getZones = async ({ page = 1, limit = 10, searchTerm }: ZoneListQuery = {}): Promise<ServiceListResult<any>> => {
  const skip = (page - 1) * limit;
  const where: Prisma.ZoneWhereInput = searchTerm ? { name: { contains: toUpperUnderscore(searchTerm) } } : {};

  const [data, total] = await Promise.all([
    prisma.zone.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.zone.count({ where })
  ]);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    }
  };
};

const getAllZones = async () => {
  return prisma.zone.findMany({ orderBy: { createdAt: 'desc' } });
};

const getAvailableZones = async () => {
  // return zones which are NOT assigned to any ACTIVE zone policy
  return prisma.zone.findMany({
    where: {
      zonePolicies: {
        none: {
          zonePolicy: {
            status: 'ACTIVE'
          }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
};

const getZoneById = async (id: string) => {
  const z = await prisma.zone.findUnique({ where: { id } });
  if (!z) {
    throw new AppError(404, 'Zone not found', [{ message: 'No zone exists with the provided id', code: 'NOT_FOUND' }]);
  }
  return z;
};

const createZone = async (dto: CreateZoneDto) => {
  const formatted = toUpperUnderscore(dto.name);
  const existing = await prisma.zone.findUnique({ where: { name: formatted } });
  if (existing) {
    throw new AppError(400, 'Zone name already exists', [{ message: 'A zone with that name exists', code: 'NAME_CONFLICT' }]);
  }

  const created = await prisma.zone.create({ data: { name: formatted } });
  return created;
};

const findByName = async (name: string) => {
  const formatted = toUpperUnderscore(name);
  return prisma.zone.findUnique({ where: { name: formatted } });
};

const updateZone = async (id: string, payload: UpdateZoneDto) => {
  const existing = await prisma.zone.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, 'Zone not found', [{ message: 'No zone exists with the provided id', code: 'NOT_FOUND' }]);
  }

  if (payload.name) {
    const formatted = toUpperUnderscore(payload.name);
    const conflict = await prisma.zone.findUnique({ where: { name: formatted } });
    if (conflict && conflict.id !== id) {
      throw new AppError(400, 'Zone name already exists', [{ message: 'Another zone uses this name', code: 'NAME_CONFLICT' }]);
    }

    const updated = await prisma.zone.update({ where: { id }, data: { name: formatted } });
    return updated;
  }

  const updated = await prisma.zone.update({ where: { id }, data: payload as any });
  return updated;
};

const deleteZone = async (id: string) => {
  const existing = await prisma.zone.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, 'Zone not found', [{ message: 'No zone exists with the provided id', code: 'NOT_FOUND' }]);
  }

  await prisma.zone.delete({ where: { id } });
  return true;
};

export const zoneService = {
  getZones,
  getAllZones,
  getAvailableZones,
  getZoneById,
  findByName,
  createZone,
  updateZone,
  deleteZone
};
