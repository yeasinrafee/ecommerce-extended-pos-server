import { prisma } from '../../config/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import { PurchaseOrderStatus, Prisma } from '@prisma/client';
import { purchaseOrderRepository } from './purchase-order.repository.js';

export class PurchaseOrderService {
  private async generatePONumber() {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await purchaseOrderRepository.count({});
    const nextNum = String(count + 1).padStart(4, '0');
    return `PO-${dateStr}-${nextNum}`;
  }

  async getPurchaseOrders(params: {
    page?: number;
    limit?: number;
    searchTerm?: string;
    status?: PurchaseOrderStatus;
    supplierId?: number;
    locationId?: string;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseOrderWhereInput = {
      deletedAt: null
    };

    if (params.status) {
      where.status = params.status;
    }
    if (params.supplierId) {
      where.supplierId = params.supplierId;
    }
    if (params.locationId) {
      where.locationId = params.locationId;
    }
    if (params.searchTerm) {
      where.OR = [
        { poNumber: { contains: params.searchTerm, mode: 'insensitive' } },
        { notes: { contains: params.searchTerm, mode: 'insensitive' } },
        { supplier: { name: { contains: params.searchTerm, mode: 'insensitive' } } }
      ];
    }

    const [data, total] = await Promise.all([
      purchaseOrderRepository.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      purchaseOrderRepository.count(where)
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

  async getPurchaseOrderById(id: string) {
    const po = await purchaseOrderRepository.findById(id);
    if (!po) {
      throw new AppError(404, 'Purchase Order not found', [
        { message: 'No Purchase Order exists with the provided ID', code: 'NOT_FOUND' }
      ]);
    }
    return po;
  }

  async createPurchaseOrder(payload: any, userId: string) {
    const poNumber = await this.generatePONumber();

    // Verify supplier and location exist
    const supplier = await prisma.supplier.findFirst({ where: { id: payload.supplierId, deletedAt: null } });
    if (!supplier) {
      throw new AppError(404, 'Supplier not found');
    }

    const location = await prisma.location.findFirst({ where: { id: payload.locationId, deletedAt: null } });
    if (!location) {
      throw new AppError(404, 'Location not found');
    }

    return prisma.$transaction(async (tx) => {
      let totalAmount = 0;
      let totalTaxAmount = 0;
      let totalDiscountAmount = 0;

      const itemsData = payload.items.map((item: any) => {
        const itemTax = (item.unitPrice * item.quantity * item.taxPercent) / 100;
        const itemDiscount = (item.unitPrice * item.quantity * item.discountPercent) / 100;
        const itemTotal = (item.unitPrice * item.quantity) + itemTax - itemDiscount;

        totalAmount += (item.unitPrice * item.quantity);
        totalTaxAmount += itemTax;
        totalDiscountAmount += itemDiscount;

        return {
          productId: item.productId,
          quantity: item.quantity,
          receivedQuantity: 0,
          unitPrice: item.unitPrice,
          taxPercent: item.taxPercent,
          taxAmount: itemTax,
          discountPercent: item.discountPercent,
          discountAmount: itemDiscount,
          totalAmount: itemTotal
        };
      });

      const netAmount = totalAmount + totalTaxAmount - totalDiscountAmount;

      return tx.purchaseOrder.create({
        data: {
          poNumber,
          supplierId: payload.supplierId,
          locationId: payload.locationId,
          orderDate: new Date(payload.orderDate),
          expectedDate: payload.expectedDate ? new Date(payload.expectedDate) : null,
          status: PurchaseOrderStatus.DRAFT,
          totalAmount,
          taxAmount: totalTaxAmount,
          discountAmount: totalDiscountAmount,
          netAmount,
          notes: payload.notes ?? null,
          createdBy: userId,
          items: {
            create: itemsData
          }
        },
        include: {
          items: true
        }
      });
    });
  }

  async updatePurchaseOrder(id: string, payload: any, userId: string) {
    const po = await this.getPurchaseOrderById(id);

    if (po.status !== PurchaseOrderStatus.DRAFT && po.status !== PurchaseOrderStatus.PENDING) {
      throw new AppError(400, `Cannot update Purchase Order in ${po.status} status. Only DRAFT or PENDING can be updated.`, [
        { message: 'Invalid PO status for update', code: 'INVALID_STATUS' }
      ]);
    }

    return prisma.$transaction(async (tx) => {
      // If updating items, delete old and write new, recalculating totals
      let totalAmount = po.totalAmount;
      let totalTaxAmount = po.taxAmount;
      let totalDiscountAmount = po.discountAmount;
      let netAmount = po.netAmount;

      if (payload.items) {
        // Delete existing items
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });

        totalAmount = 0;
        totalTaxAmount = 0;
        totalDiscountAmount = 0;

        const itemsData = payload.items.map((item: any) => {
          const itemTax = (item.unitPrice * item.quantity * item.taxPercent) / 100;
          const itemDiscount = (item.unitPrice * item.quantity * item.discountPercent) / 100;
          const itemTotal = (item.unitPrice * item.quantity) + itemTax - itemDiscount;

          totalAmount += (item.unitPrice * item.quantity);
          totalTaxAmount += itemTax;
          totalDiscountAmount += itemDiscount;

          return {
            purchaseOrderId: id,
            productId: item.productId,
            quantity: item.quantity,
            receivedQuantity: 0,
            unitPrice: item.unitPrice,
            taxPercent: item.taxPercent,
            taxAmount: itemTax,
            discountPercent: item.discountPercent,
            discountAmount: itemDiscount,
            totalAmount: itemTotal
          };
        });

        netAmount = totalAmount + totalTaxAmount - totalDiscountAmount;

        await tx.purchaseOrderItem.createMany({
          data: itemsData
        });
      }

      const updateData: Prisma.PurchaseOrderUpdateInput = {
        updater: userId ? { connect: { id: userId } } : undefined,
        notes: payload.notes !== undefined ? payload.notes : po.notes,
        totalAmount,
        taxAmount: totalTaxAmount,
        discountAmount: totalDiscountAmount,
        netAmount
      };

      if (payload.supplierId) {
        updateData.supplier = { connect: { id: payload.supplierId } };
      }
      if (payload.locationId) {
        updateData.location = { connect: { id: payload.locationId } };
      }
      if (payload.orderDate) {
        updateData.orderDate = new Date(payload.orderDate);
      }
      if (payload.expectedDate !== undefined) {
        updateData.expectedDate = payload.expectedDate ? new Date(payload.expectedDate) : null;
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: updateData,
        include: {
          items: true
        }
      });
    });
  }

  async approvePurchaseOrder(id: string, userId: string) {
    const po = await this.getPurchaseOrderById(id);

    if (po.status !== PurchaseOrderStatus.DRAFT && po.status !== PurchaseOrderStatus.PENDING) {
      throw new AppError(400, `Cannot approve Purchase Order in ${po.status} status.`, [
        { message: 'Invalid PO status for approval', code: 'INVALID_STATUS' }
      ]);
    }

    return purchaseOrderRepository.update(id, {
      status: PurchaseOrderStatus.APPROVED,
      updater: userId ? { connect: { id: userId } } : undefined
    });
  }

  async cancelPurchaseOrder(id: string, userId: string) {
    const po = await this.getPurchaseOrderById(id);

    if (po.status === PurchaseOrderStatus.CANCELLED) {
      throw new AppError(400, 'Purchase Order is already CANCELLED.');
    }

    // Check if any items have already been received
    const hasReceived = po.items.some(item => item.receivedQuantity > 0);
    if (hasReceived) {
      throw new AppError(400, 'Cannot cancel Purchase Order because some items have already been received in a GRN.', [
        { message: 'GRN already exists', code: 'ITEMS_RECEIVED' }
      ]);
    }

    return purchaseOrderRepository.update(id, {
      status: PurchaseOrderStatus.CANCELLED,
      updater: userId ? { connect: { id: userId } } : undefined
    });
  }
}

export const purchaseOrderService = new PurchaseOrderService();
