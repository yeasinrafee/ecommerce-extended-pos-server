import { prisma } from '../../config/prisma.js';
import { Prisma } from '@prisma/client';

export class StockTransferRepository {
  async findById(id: string) {
    return prisma.stockTransfer.findFirst({
      where: { id, deletedAt: null },
      include: {
        sourceLocation: { select: { id: true, name: true, code: true } },
        destinationLocation: { select: { id: true, name: true, code: true } },
        creator: { select: { id: true, email: true } },
        updater: { select: { id: true, email: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } }
          }
        }
      }
    });
  }

  async findMany(params: {
    where: Prisma.StockTransferWhereInput;
    skip?: number;
    take?: number;
    orderBy?: Prisma.StockTransferOrderByWithRelationInput;
  }) {
    return prisma.stockTransfer.findMany({
      where: params.where,
      skip: params.skip,
      take: params.take,
      orderBy: params.orderBy,
      include: {
        sourceLocation: { select: { id: true, name: true, code: true } },
        destinationLocation: { select: { id: true, name: true, code: true } },
        creator: { select: { id: true, email: true } }
      }
    });
  }

  async count(where: Prisma.StockTransferWhereInput) {
    return prisma.stockTransfer.count({ where });
  }

  async create(data: Prisma.StockTransferCreateInput, tx?: Prisma.TransactionClient) {
    const client = tx || prisma;
    return client.stockTransfer.create({ data });
  }

  async update(id: string, data: Prisma.StockTransferUpdateInput, tx?: Prisma.TransactionClient) {
    const client = tx || prisma;
    return client.stockTransfer.update({
      where: { id },
      data
    });
  }
}

export const stockTransferRepository = new StockTransferRepository();
