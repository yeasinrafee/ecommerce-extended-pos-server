import { prisma } from '../../config/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import { Prisma, Status, PaymentMethod } from '@prisma/client';
import { supplierRepository } from './supplier.repository.js';
import { deleteCloudinaryAsset, getPublicIdFromUrl } from '../../common/utils/file-upload.js';

const getSupplierWhere = ({ searchTerm, status }: { searchTerm?: string; status?: Status }): Prisma.SupplierWhereInput => {
  const where: Prisma.SupplierWhereInput = {
    deletedAt: null
  };

  if (searchTerm) {
    where.OR = [
      { name: { contains: searchTerm, mode: 'insensitive' } },
      { companyName: { contains: searchTerm, mode: 'insensitive' } },
      { email: { contains: searchTerm, mode: 'insensitive' } },
      { phone: { contains: searchTerm, mode: 'insensitive' } },
      { address: { contains: searchTerm, mode: 'insensitive' } }
    ];
  }

  if (status) {
    where.status = status;
  }

  return where;
};

const ensureUniqueSupplierFields = async (
  payload: { email?: string | null; phone?: string | null },
  excludeId?: number
) => {
  if (payload.email) {
    const existingEmail = await supplierRepository.findFirst({
      email: payload.email,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {})
    });

    if (existingEmail) {
      throw new AppError(409, 'Email already in use', [
        { field: 'email', message: 'This email is already taken', code: 'EMAIL_ALREADY_EXISTS' }
      ]);
    }
  }

  if (payload.phone) {
    const existingPhone = await supplierRepository.findFirst({
      phone: payload.phone,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {})
    });

    if (existingPhone) {
      throw new AppError(409, 'Phone already in use', [
        { field: 'phone', message: 'This phone number is already taken', code: 'PHONE_ALREADY_EXISTS' }
      ]);
    }
  }
};

export class SupplierService {
  async getSuppliers({ page = 1, limit = 10, searchTerm, status }: { page?: number; limit?: number; searchTerm?: string; status?: Status } = {}) {
    const skip = (page - 1) * limit;
    const where = getSupplierWhere({ searchTerm, status });

    const [data, total] = await Promise.all([
      supplierRepository.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      supplierRepository.count(where)
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
  }

  async getAllSuppliers() {
    return supplierRepository.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getSupplierById(id: number) {
    const supplier = await supplierRepository.findById(id);
    if (!supplier) {
      throw new AppError(404, 'Supplier not found', [
        { message: 'No supplier exists with the provided id', code: 'NOT_FOUND' }
      ]);
    }
    return supplier;
  }

  async createSupplier(payload: any, userId?: string) {
    await ensureUniqueSupplierFields(payload);

    return supplierRepository.create({
      name: payload.name,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      address: payload.address ?? null,
      companyName: payload.companyName ?? null,
      image: payload.image ?? null,
      status: payload.status ?? Status.ACTIVE,
      creator: userId ? { connect: { id: userId } } : undefined
    });
  }

  async updateSupplier(id: number, payload: any, newUploadedPublicId?: string | null, userId?: string) {
    const existing = await this.getSupplierById(id);
    await ensureUniqueSupplierFields(payload, id);

    const previousPublicId = getPublicIdFromUrl(existing.image) ?? null;

    const data: Prisma.SupplierUpdateInput = {
      updater: userId ? { connect: { id: userId } } : undefined
    };

    if (payload.name !== undefined) data.name = payload.name;
    if (payload.email !== undefined) data.email = payload.email;
    if (payload.phone !== undefined) data.phone = payload.phone;
    if (payload.address !== undefined) data.address = payload.address;
    if (payload.companyName !== undefined) data.companyName = payload.companyName;
    if (payload.image !== undefined) data.image = payload.image;
    if (payload.status !== undefined) data.status = payload.status;

    const updated = await supplierRepository.update(id, data);

    if (previousPublicId) {
      const hasNewImage = newUploadedPublicId !== undefined && newUploadedPublicId !== null;
      const explicitlyRemovedImage = payload.image === null;

      if ((hasNewImage || explicitlyRemovedImage) && previousPublicId !== newUploadedPublicId) {
        try {
          await deleteCloudinaryAsset(previousPublicId);
        } catch (_err) {}
      }
    }

    return updated;
  }

  async deleteSupplier(id: number) {
    const existing = await this.getSupplierById(id);
    const previousPublicId = getPublicIdFromUrl(existing.image) ?? null;

    await supplierRepository.delete(id);

    if (previousPublicId) {
      try {
        await deleteCloudinaryAsset(previousPublicId);
      } catch (_err) {}
    }

    return true;
  }

  async bulkUpdateStatus(ids: number[], status?: Status) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new AppError(400, 'No ids provided', [
        { message: 'Provide an array of supplier ids', code: 'INVALID_PAYLOAD' }
      ]);
    }

    if (!status) {
      throw new AppError(400, 'Status is required', [
        { message: 'Provide a status value', code: 'INVALID_PAYLOAD' }
      ]);
    }

    const result = await prisma.supplier.updateMany({
      where: { id: { in: ids } },
      data: { status }
    });

    return result.count;
  }

  // Purchases History
  async getSupplierPurchases(supplierId: number, { page = 1, limit = 10 }: { page?: number; limit?: number }) {
    await this.getSupplierById(supplierId);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      supplierRepository.findPurchases(supplierId, skip, limit),
      supplierRepository.countPurchases(supplierId)
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
  }

  // Payments History
  async getSupplierPayments(supplierId: number, { page = 1, limit = 10 }: { page?: number; limit?: number }) {
    await this.getSupplierById(supplierId);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      supplierRepository.findPayments(supplierId, skip, limit),
      supplierRepository.countPayments(supplierId)
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
  }

  // Record a payment to supplier (updates supplier balances)
  async createSupplierPayment(
    supplierId: number,
    payload: { amount: number; paymentMethod: PaymentMethod; referenceNo?: string | null; note?: string | null },
    userId: string
  ) {
    return prisma.$transaction(async (tx) => {
      // 1. Lock the supplier row to prevent concurrent balance updates
      const supplier = await tx.supplier.findFirst({
        where: { id: supplierId, deletedAt: null }
      });

      if (!supplier) {
        throw new AppError(404, 'Supplier not found', [
          { message: 'No supplier exists with the provided id', code: 'NOT_FOUND' }
        ]);
      }

      await tx.$executeRaw(Prisma.sql`SELECT id FROM suppliers WHERE id = ${supplier.id} FOR UPDATE`);

      const reloadedSupplier = await tx.supplier.findFirstOrThrow({
        where: { id: supplierId }
      });

      const newPaidAmount = reloadedSupplier.paidAmount + payload.amount;
      const newDueAmount = Math.max(0, reloadedSupplier.totalPurchaseAmount - newPaidAmount);

      // 2. Create the payment record
      const payment = await supplierRepository.createPayment(
        {
          supplierId,
          amount: payload.amount,
          paymentMethod: payload.paymentMethod,
          referenceNo: payload.referenceNo,
          note: payload.note,
          createdBy: userId
        },
        tx
      );

      // 3. Update supplier's paid and due tracking balances
      await supplierRepository.update(
        supplierId,
        {
          paidAmount: newPaidAmount,
          dueAmount: newDueAmount
        },
        tx
      );

      return payment;
    });
  }

  // Dues tracking list
  async getDueSuppliers({ page = 1, limit = 10 }: { page?: number; limit?: number } = {}) {
    const skip = (page - 1) * limit;
    const where: Prisma.SupplierWhereInput = {
      dueAmount: { gt: 0 },
      deletedAt: null
    };

    const [data, total] = await Promise.all([
      supplierRepository.findMany({
        where,
        skip,
        take: limit,
        orderBy: { dueAmount: 'desc' }
      }),
      supplierRepository.count(where)
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
  }
}

export const supplierService = new SupplierService();