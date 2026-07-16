import { prisma } from '../../config/prisma.js';
import { Prisma } from '@prisma/client';

const defaultInclude = {
  supplier: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  creator: { select: { id: true, email: true } },
  updater: { select: { id: true, email: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true } }
    }
  }
} as const;

export class SupplierReturnRepository {
  async findById(id: string) {
    return prisma.supplierReturn.findFirst({
      where: { id, deletedAt: null },
      include: defaultInclude
    });
  }

  async findMany(params: {
    where: Prisma.SupplierReturnWhereInput;
    skip?: number;
    take?: number;
    orderBy?: Prisma.SupplierReturnOrderByWithRelationInput;
  }) {
    return prisma.supplierReturn.findMany({
      where: params.where,
      skip: params.skip,
      take: params.take,
      orderBy: params.orderBy,
      include: {
        supplier: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        creator: { select: { id: true, email: true } },
        items: { select: { quantity: true, totalPrice: true } }
      }
    });
  }

  async count(where: Prisma.SupplierReturnWhereInput) {
    return prisma.supplierReturn.count({ where });
  }

  async update(id: string, data: Prisma.SupplierReturnUpdateInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.supplierReturn.update({
      where: { id },
      data,
      include: defaultInclude
    });
  }
}

export const supplierReturnRepository = new SupplierReturnRepository();
