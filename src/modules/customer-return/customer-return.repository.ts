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

export class CustomerReturnRepository {
  async findById(id: string) {
    return prisma.customerReturn.findFirst({
      where: { id, deletedAt: null },
      include: defaultInclude
    });
  }

  async findMany(params: {
    where: Prisma.CustomerReturnWhereInput;
    skip?: number;
    take?: number;
    orderBy?: Prisma.CustomerReturnOrderByWithRelationInput;
  }) {
    return prisma.customerReturn.findMany({
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

  async count(where: Prisma.CustomerReturnWhereInput) {
    return prisma.customerReturn.count({ where });
  }

  async update(id: string, data: Prisma.CustomerReturnUpdateInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.customerReturn.update({
      where: { id },
      data,
      include: defaultInclude
    });
  }
}

export const customerReturnRepository = new CustomerReturnRepository();
