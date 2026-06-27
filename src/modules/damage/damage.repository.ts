import { prisma } from '../../config/prisma.js';
import { Prisma } from '@prisma/client';

const defaultInclude = {
  location: { select: { id: true, name: true } },
  creator: { select: { id: true, email: true } },
  updater: { select: { id: true, email: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true } }
    }
  }
} as const;

export class DamageRepository {
  async findById(id: string) {
    return prisma.damage.findFirst({
      where: { id, deletedAt: null },
      include: defaultInclude
    });
  }

  async findMany(params: {
    where: Prisma.DamageWhereInput;
    skip?: number;
    take?: number;
    orderBy?: Prisma.DamageOrderByWithRelationInput;
  }) {
    return prisma.damage.findMany({
      where: params.where,
      skip: params.skip,
      take: params.take,
      orderBy: params.orderBy,
      include: {
        location: { select: { id: true, name: true } },
        creator: { select: { id: true, email: true } },
        items: { select: { quantity: true } }
      }
    });
  }

  async count(where: Prisma.DamageWhereInput) {
    return prisma.damage.count({ where });
  }

  async update(id: string, data: Prisma.DamageUpdateInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.damage.update({
      where: { id },
      data,
      include: defaultInclude
    });
  }
}

export const damageRepository = new DamageRepository();
