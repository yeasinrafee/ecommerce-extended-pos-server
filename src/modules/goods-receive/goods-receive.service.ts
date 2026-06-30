import { prisma } from '../../config/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import { GoodsReceiveStatus, StockMovementType, Prisma } from '@prisma/client';
import { goodsReceiveRepository } from './goods-receive.repository.js';
import { stockLedgerService, resolveStockStatus } from '../stock-ledger/stock-ledger.service.js';

export class GoodsReceiveService {
  private async generateGRNNumber() {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await goodsReceiveRepository.count({});
    const nextNum = String(count + 1).padStart(4, '0');
    return `GRN-${dateStr}-${nextNum}`;
  }

  async getGoodsReceives(params: {
    page?: number;
    limit?: number;
    searchTerm?: string;
    supplierId?: number;
    locationId?: string;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.GoodsReceiveWhereInput = {
      deletedAt: null
    };

    if (params.supplierId) {
      where.supplierId = params.supplierId;
    }
    if (params.locationId) {
      where.locationId = params.locationId;
    }
    if (params.searchTerm) {
      where.OR = [
        { grnNumber: { contains: params.searchTerm, mode: 'insensitive' } },
        { billNumber: { contains: params.searchTerm, mode: 'insensitive' } },
        { notes: { contains: params.searchTerm, mode: 'insensitive' } }
      ];
    }

    const [data, total] = await Promise.all([
      goodsReceiveRepository.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      goodsReceiveRepository.count(where)
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

  async getGoodsReceiveById(id: string) {
    const grn = await goodsReceiveRepository.findById(id);
    if (!grn) {
      throw new AppError(404, 'Goods Receive Note not found', [
        { message: 'No Goods Receive Note exists with the provided ID', code: 'NOT_FOUND' }
      ]);
    }
    return grn;
  }

  async createGoodsReceive(payload: any, userId: string) {
    const grnNumber = await this.generateGRNNumber();

    // Verify supplier and location exist
    const supplier = await prisma.supplier.findFirst({ where: { id: payload.supplierId, deletedAt: null } });
    if (!supplier) {
      throw new AppError(404, 'Supplier not found');
    }

    const location = await prisma.location.findFirst({ where: { id: payload.locationId, deletedAt: null } });
    if (!location) {
      throw new AppError(404, 'Location not found');
    }

    // Verify linked PO if provided
    let linkedPO: any = null;
    if (payload.purchaseOrderId) {
      linkedPO = await prisma.purchaseOrder.findFirst({
        where: { id: payload.purchaseOrderId, deletedAt: null },
        include: { items: true }
      });
      if (!linkedPO) {
        throw new AppError(404, 'Linked Purchase Order not found');
      }
      if (linkedPO.status !== 'APPROVED') {
        throw new AppError(400, 'Cannot receive goods against a Purchase Order that is not APPROVED.');
      }
    }

    return prisma.$transaction(async (tx) => {
      // 1. Calculate totals and create GRN Note
      let grnTotalValue = 0;
      const grnItemsData = payload.items.map((item: any) => {
        const total = item.quantityAccepted * item.unitPrice;
        grnTotalValue += total;

        // If PO is linked, find quantityOrdered
        let quantityOrdered = 0;
        if (linkedPO) {
          const poItem = linkedPO.items.find((pi: any) => pi.productId === item.productId);
          if (poItem) {
            quantityOrdered = poItem.quantity;
          }
        }

        return {
          productId: item.productId,
          quantityOrdered,
          quantityReceived: item.quantityReceived,
          quantityAccepted: item.quantityAccepted,
          quantityRejected: item.quantityRejected,
          unitPrice: item.unitPrice,
          totalPrice: total,
          batchNumber: item.batchNumber ?? null,
          expiryDate: item.expiryDate ? new Date(item.expiryDate) : null
        };
      });

      const finalBillAmount = payload.billAmount ?? grnTotalValue;

      const grn = await tx.goodsReceive.create({
        data: {
          grnNumber,
          purchaseOrderId: payload.purchaseOrderId || null,
          supplierId: payload.supplierId,
          locationId: payload.locationId,
          receiveDate: new Date(),
          status: GoodsReceiveStatus.RECEIVED,
          billNumber: payload.billNumber ?? null,
          billAmount: finalBillAmount,
          notes: payload.notes ?? null,
          createdBy: userId,
          items: {
            create: grnItemsData
          }
        },
        include: {
          items: true
        }
      });

      // 2. Adjust stocks and record movements
      for (const item of grn.items) {
        await stockLedgerService.adjustStock(tx, {
          productId: item.productId,
          locationId: grn.locationId,
          quantityChanged: item.quantityAccepted,
          movementType: StockMovementType.PURCHASE,
          referenceType: 'GoodsReceive',
          referenceId: grn.id,
          performedBy: userId,
          notes: `Received from supplier invoice/challan ${grn.billNumber ?? 'N/A'}`
        });

        // Increment global Product.stock, clear defaultQuantity (marks as "stocked at least once"),
        // then auto-resolve stockStatus
        const updatedGrnProduct = await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: { increment: item.quantityAccepted },
            // Setting defaultQuantity to 0 signals that this product has gone through GRN
            // so the dashboard will never show "Pending" again — only IN_STOCK / LOW_STOCK / OUT_OF_STOCK
            defaultQuantity: 0
          },
          select: { stock: true }
        });
        const resolvedStatus = await resolveStockStatus(tx, item.productId, updatedGrnProduct.stock);
        await tx.product.update({
          where: { id: item.productId },
          data: { stockStatus: resolvedStatus }
        });

        // 3. Update PO received quantity if linked
        if (linkedPO) {
          const poItem = await tx.purchaseOrderItem.findFirst({
            where: { purchaseOrderId: linkedPO.id, productId: item.productId }
          });
          if (poItem) {
            await tx.purchaseOrderItem.update({
              where: { id: poItem.id },
              data: {
                receivedQuantity: poItem.receivedQuantity + item.quantityAccepted
              }
            });
          }
        }
      }

      // 4. Lock and update supplier balance
      await tx.$executeRaw(Prisma.sql`SELECT id FROM suppliers WHERE id = ${supplier.id} FOR UPDATE`);
      const currentSupplier = await tx.supplier.findFirstOrThrow({
        where: { id: supplier.id }
      });

      const newTotalPurchase = currentSupplier.totalPurchaseAmount + finalBillAmount;
      const newDue = currentSupplier.dueAmount + finalBillAmount;

      await tx.supplier.update({
        where: { id: supplier.id },
        data: {
          totalPurchaseAmount: newTotalPurchase,
          dueAmount: newDue
        }
      });

      return grn;
    });
  }
}

export const goodsReceiveService = new GoodsReceiveService();
