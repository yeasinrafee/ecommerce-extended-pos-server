import { prisma } from '../../config/prisma.js';
import { Prisma } from '@prisma/client';

export class SupplierRepository {
  async findById(id: number) {
    return prisma.supplier.findFirst({
      where: { id, deletedAt: null }
    });
  }

  async findFirst(where: Prisma.SupplierWhereInput) {
    return prisma.supplier.findFirst({ where });
  }

  async findMany(params: {
    where: Prisma.SupplierWhereInput;
    skip?: number;
    take?: number;
    orderBy?: Prisma.SupplierOrderByWithRelationInput;
  }) {
    return prisma.supplier.findMany({
      where: params.where,
      skip: params.skip,
      take: params.take,
      orderBy: params.orderBy
    });
  }

  async count(where: Prisma.SupplierWhereInput) {
    return prisma.supplier.count({ where });
  }

  async create(data: Prisma.SupplierCreateInput) {
    return prisma.supplier.create({ data });
  }

  async update(id: number, data: Prisma.SupplierUpdateInput, tx?: Prisma.TransactionClient) {
    const client = tx || prisma;
    return client.supplier.update({
      where: { id },
      data
    });
  }

  async delete(id: number) {
    return prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  // Payments Repository Methods
  async createPayment(data: Prisma.SupplierPaymentUncheckedCreateInput, tx?: Prisma.TransactionClient) {
    const client = tx || prisma;
    return client.supplierPayment.create({ data });
  }

  async findPayments(supplierId: number, skip?: number, take?: number) {
    return prisma.supplierPayment.findMany({
      where: { supplierId, deletedAt: null },
      skip,
      take,
      orderBy: { paymentDate: 'desc' },
      include: {
        creator: {
          select: { id: true, email: true }
        }
      }
    });
  }

  async countPayments(supplierId: number) {
    return prisma.supplierPayment.count({
      where: { supplierId, deletedAt: null }
    });
  }

  // Purchases History Methods
  async findPurchases(supplierId: number, skip?: number, take?: number) {
    return prisma.purchaseOrder.findMany({
      where: { supplierId, deletedAt: null },
      skip,
      take,
      orderBy: { orderDate: 'desc' },
      include: {
        location: {
          select: { id: true, name: true }
        },
        creator: {
          select: { id: true, email: true }
        }
      }
    });
  }

  async countPurchases(supplierId: number) {
    return prisma.purchaseOrder.count({
      where: { supplierId, deletedAt: null }
    });
  }
}

export const supplierRepository = new SupplierRepository();
