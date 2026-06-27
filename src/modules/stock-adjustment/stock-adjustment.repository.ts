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

export class StockAdjustmentRepository {
  async findById(id: string) {
    return prisma.stockAdjustment.findFirst({
      where: { id, deletedAt: null },
      include: defaultInclude
    });
  }

  async findMany(params: {
    where: Prisma.StockAdjustmentWhereInput;
    skip?: number;
    take?: number;
    orderBy?: Prisma.StockAdjustmentOrderByWithRelationInput;
  }) {
    return prisma.stockAdjustment.findMany({
      where: params.where,
      skip: params.skip,
      take: params.take,
      orderBy: params.orderBy,
      include: {
        location: { select: { id: true, name: true } },
        creator: { select: { id: true, email: true } }
      }
    });
  }

  async count(where: Prisma.StockAdjustmentWhereInput) {
    return prisma.stockAdjustment.count({ where });
  }

  async update(id: string, data: Prisma.StockAdjustmentUpdateInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.stockAdjustment.update({
      where: { id },
      data,
      include: defaultInclude
    });
  }
}

export const stockAdjustmentRepository = new StockAdjustmentRepository();
