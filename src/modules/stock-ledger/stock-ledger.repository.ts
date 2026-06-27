import { prisma } from '../../config/prisma.js';
import { Prisma } from '@prisma/client';

export class StockLedgerRepository {
  async createMovement(
    data: Prisma.StockMovementUncheckedCreateInput,
    tx?: Prisma.TransactionClient
  ) {
    const client = tx || prisma;
    return client.stockMovement.create({ data });
  }

  async getMovements(
    where: Prisma.StockMovementWhereInput,
    skip?: number,
    take?: number
  ) {
    return prisma.stockMovement.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true
          }
        },
        location: {
          select: {
            id: true,
            name: true,
            code: true
          }
        },
        performer: {
          select: {
            id: true,
            email: true
          }
        }
      }
    });
  }

  async countMovements(where: Prisma.StockMovementWhereInput) {
    return prisma.stockMovement.count({ where });
  }
}

export const stockLedgerRepository = new StockLedgerRepository();
