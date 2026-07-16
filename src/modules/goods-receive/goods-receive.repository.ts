import { prisma } from '../../config/prisma.js';
import { Prisma } from '@prisma/client';

export class GoodsReceiveRepository {
  async findById(id: string) {
    return prisma.goodsReceive.findFirst({
      where: { id, deletedAt: null },
      include: {
        supplier: {
          select: { id: true, name: true, companyName: true }
        },
        location: {
          select: { id: true, name: true, code: true }
        },
        creator: {
          select: { id: true, email: true }
        },
        updater: {
          select: { id: true, email: true }
        },
        purchaseOrder: {
          select: { id: true, poNumber: true }
        },
        items: {
          include: {
            product: {
              select: { id: true, name: true, sku: true, barcodeId: true }
            }
          }
        }
      }
    });
  }

  async findMany(params: {
    where: Prisma.GoodsReceiveWhereInput;
    skip?: number;
    take?: number;
    orderBy?: Prisma.GoodsReceiveOrderByWithRelationInput;
  }) {
    return prisma.goodsReceive.findMany({
      where: params.where,
      skip: params.skip,
      take: params.take,
      orderBy: params.orderBy,
      include: {
        supplier: {
          select: { id: true, name: true, companyName: true }
        },
        location: {
          select: { id: true, name: true, code: true }
        },
        creator: {
          select: { id: true, email: true }
        },
        purchaseOrder: {
          select: { id: true, poNumber: true }
        }
      }
    });
  }

  async count(where: Prisma.GoodsReceiveWhereInput) {
    return prisma.goodsReceive.count({ where });
  }

  async create(data: Prisma.GoodsReceiveCreateInput, tx?: Prisma.TransactionClient) {
    const client = tx || prisma;
    return client.goodsReceive.create({ data });
  }

  async update(id: string, data: Prisma.GoodsReceiveUpdateInput, tx?: Prisma.TransactionClient) {
    const client = tx || prisma;
    return client.goodsReceive.update({
      where: { id },
      data
    });
  }
}

export const goodsReceiveRepository = new GoodsReceiveRepository();
