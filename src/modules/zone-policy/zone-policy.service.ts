import { prisma } from '../../config/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import type { CreateZonePolicyDto, UpdateZonePolicyDto, ZonePolicyListQuery, ServiceListResult } from './zone-policy.types.js';
import type { Prisma } from '@prisma/client';

const getZonePolicies = async ({ page = 1, limit = 10, searchTerm }: ZonePolicyListQuery = {}): Promise<ServiceListResult<any>> => {
  const skip = (page - 1) * limit;
  const where: Prisma.ZonePolicyWhereInput = searchTerm ? { policyName: { contains: searchTerm, mode: 'insensitive' } } : {};

  const [data, total] = await Promise.all([
    prisma.zonePolicy.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: { zones: { include: { zone: true } } } }),
    prisma.zonePolicy.count({ where })
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

const getAllZonePolicies = async () => {
  return prisma.zonePolicy.findMany({ orderBy: { createdAt: 'desc' }, include: { zones: { include: { zone: true } } } });
};

const getZonePolicyById = async (id: string) => {
  const p = await prisma.zonePolicy.findUnique({ where: { id }, include: { zones: { include: { zone: true } } } });
  if (!p) {
    throw new AppError(404, 'ZonePolicy not found', [{ message: 'No zone policy exists with the provided id', code: 'NOT_FOUND' }]);
  }
  return p;
};

const createZonePolicy = async (dto: CreateZonePolicyDto) => {
  const created = await prisma.zonePolicy.create({
    data: {
      policyName: dto.policyName,
      deliveryTime: dto.deliveryTime,
      shippingCost: dto.shippingCost,
      status: dto.status ?? undefined,
      zones: dto.zoneIds && dto.zoneIds.length ? { create: dto.zoneIds.map((zoneId) => ({ zone: { connect: { id: zoneId } } })) } : undefined
    },
    include: { zones: { include: { zone: true } } }
  });

  return created;
};

const updateZonePolicy = async (id: string, payload: UpdateZonePolicyDto) => {
  const existing = await prisma.zonePolicy.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, 'ZonePolicy not found', [{ message: 'No zone policy exists with the provided id', code: 'NOT_FOUND' }]);
  }

  const { zoneIds, ...rest } = payload as any;

  const updated = await prisma.zonePolicy.update({ where: { id }, data: rest as any });

  if (Array.isArray(zoneIds)) {
    // remove existing relations and recreate
    await prisma.zonePoliciesOnZones.deleteMany({ where: { zonePolicyId: id } });
    if (zoneIds.length > 0) {
      const createData = zoneIds.map((zoneId: string) => ({ zonePolicyId: id, zoneId }));
      await prisma.zonePoliciesOnZones.createMany({ data: createData });
    }

    const refreshed = await prisma.zonePolicy.findUnique({ where: { id }, include: { zones: { include: { zone: true } } } });
    return refreshed;
  }

  return updated;
};

const deleteZonePolicy = async (id: string) => {
  const existing = await prisma.zonePolicy.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, 'ZonePolicy not found', [{ message: 'No zone policy exists with the provided id', code: 'NOT_FOUND' }]);
  }

  await prisma.zonePolicy.delete({ where: { id } });
  return true;
};

const bulkUpdateStatus = async (ids: string[], status: string) => {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new AppError(400, 'No ids provided', [{ message: 'Provide an array of zone policy ids', code: 'INVALID_PAYLOAD' }]);
  }

  const result = await prisma.zonePolicy.updateMany({ where: { id: { in: ids } }, data: { status: status as any } });
  return result.count;
};

export const zonePolicyService = {
  getZonePolicies,
  getAllZonePolicies,
  getZonePolicyById,
  createZonePolicy,
  updateZonePolicy,
  deleteZonePolicy,
  bulkUpdateStatus
};
