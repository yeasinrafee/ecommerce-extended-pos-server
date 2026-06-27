import { prisma } from '../../config/prisma.js';
import { Prisma } from '@prisma/client';

export class PurchaseOrderRepository {
  async findById(id: string) {
    return prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
      include: {
        supplier: {
          select: { id: true, name: true, companyName: true, email: true, phone: true }
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

  async findFirst(where: Prisma.PurchaseOrderWhereInput) {
    return prisma.purchaseOrder.findFirst({ where });
  }

  async findMany(params: {
    where: Prisma.PurchaseOrderWhereInput;
    skip?: number;
    take?: number;
    orderBy?: Prisma.PurchaseOrderOrderByWithRelationInput;
  }) {
    return prisma.purchaseOrder.findMany({
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
        }
      }
    });
  }

  async count(where: Prisma.PurchaseOrderWhereInput) {
    return prisma.purchaseOrder.count({ where });
  }

  async create(data: Prisma.PurchaseOrderCreateInput, tx?: Prisma.TransactionClient) {
    const client = tx || prisma;
    return client.purchaseOrder.create({ data });
  }

  async update(id: string, data: Prisma.PurchaseOrderUpdateInput, tx?: Prisma.TransactionClient) {
    const client = tx || prisma;
    return client.purchaseOrder.update({
      where: { id },
      data
    });
  }

  async delete(id: string) {
    return prisma.purchaseOrder.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }
}

export const purchaseOrderRepository = new PurchaseOrderRepository();
