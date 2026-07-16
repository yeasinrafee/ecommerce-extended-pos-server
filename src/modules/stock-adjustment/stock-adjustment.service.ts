import { prisma } from '../../config/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import { StockAdjustmentStatus, StockMovementType, Prisma } from '@prisma/client';
import { stockAdjustmentRepository } from './stock-adjustment.repository.js';
import { stockLedgerService } from '../stock-ledger/stock-ledger.service.js';

/**
 * Stock Adjustment Status Flow:
 *
 *   DRAFT ──► COMPLETED   ← stock moves only here
 *     │
 *     └──► CANCELLED      ← no stock change, only allowed from DRAFT
 *
 * Rules:
 *   - Create always produces DRAFT. No stock is touched at create time.
 *   - DRAFT can be edited (items, reason, locationId).
 *   - complete() transitions DRAFT → COMPLETED and applies all stock changes atomically.
 *   - cancel() transitions DRAFT → CANCELLED. No stock was ever touched so nothing to reverse.
 *   - COMPLETED and CANCELLED are terminal — no further transitions.
 */
export class StockAdjustmentService {
  private async generateAdjustmentNumber() {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await stockAdjustmentRepository.count({});
    const nextNum = String(count + 1).padStart(4, '0');
    return `ADJ-${dateStr}-${nextNum}`;
  }

  async getAdjustments(params: {
    page?: number;
    limit?: number;
    locationId?: string;
    status?: StockAdjustmentStatus;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.StockAdjustmentWhereInput = { deletedAt: null };

    if (params.locationId) where.locationId = params.locationId;
    if (params.status) where.status = params.status;

    const [data, total] = await Promise.all([
      stockAdjustmentRepository.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      stockAdjustmentRepository.count(where)
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
    };
  }

  async getAdjustmentById(id: string) {
    const adj = await stockAdjustmentRepository.findById(id);
    if (!adj) throw new AppError(404, 'Stock Adjustment not found');

    if (adj.status === StockAdjustmentStatus.DRAFT) {
      const itemsWithStock = await Promise.all(
        adj.items.map(async (item: any) => {
          const stock = await prisma.stock.findUnique({
            where: {
              productId_locationId: {
                productId: item.productId,
                locationId: adj.locationId
              }
            }
          });
          const previousQuantity = stock?.quantity ?? 0;
          return {
            ...item,
            previousQuantity,
            currentQuantity: previousQuantity + item.quantityChanged
          };
        })
      );
      return {
        ...adj,
        items: itemsWithStock
      };
    }

    return adj;
  }

  /**
   * Create a new adjustment in DRAFT status.
   * No stock is touched here — items are just recorded for review.
   */
  async createStockAdjustment(payload: any, userId: string) {
    const adjustmentNumber = await this.generateAdjustmentNumber();

    const location = await prisma.location.findFirst({ where: { id: payload.locationId, deletedAt: null } });
    if (!location) throw new AppError(404, 'Location not found');

    // Validate all products exist before creating
    for (const item of payload.items) {
      const product = await prisma.product.findFirst({ where: { id: item.productId, deletedAt: null } });
      if (!product) throw new AppError(404, `Product not found: ${item.productId}`);
      if (item.quantityChanged === 0) throw new AppError(400, `Quantity changed cannot be zero for product: ${item.productId}`);
    }

    // Build items with actual current stock quantities as snapshot/placeholder for DRAFT
    const itemsData = await Promise.all(
      payload.items.map(async (item: any) => {
        const stock = await prisma.stock.findUnique({
          where: { productId_locationId: { productId: item.productId, locationId: payload.locationId } }
        });
        const previousQuantity = stock?.quantity ?? 0;
        return {
          productId: item.productId,
          previousQuantity,
          quantityChanged: item.quantityChanged,
          currentQuantity: previousQuantity + item.quantityChanged,
          reason: item.reason ?? null
        };
      })
    );

    return prisma.stockAdjustment.create({
      data: {
        adjustmentNumber,
        locationId: payload.locationId,
        adjustmentDate: new Date(),
        status: StockAdjustmentStatus.DRAFT,
        reason: payload.reason ?? null,
        createdBy: userId,
        items: { create: itemsData }
      },
      include: {
        location: { select: { id: true, name: true } },
        creator: { select: { id: true, email: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } }
      }
    });
  }

  /**
   * Update a DRAFT adjustment.
   * Replaces all items if provided. Can also update reason and locationId.
   */
  async updateStockAdjustment(id: string, payload: any, userId: string) {
    const adj = await this.getAdjustmentById(id);

    if (adj.status !== StockAdjustmentStatus.DRAFT) {
      throw new AppError(400, `Cannot edit a Stock Adjustment in ${adj.status} status. Only DRAFT adjustments can be edited.`);
    }

    if (payload.locationId && payload.locationId !== adj.locationId) {
      const location = await prisma.location.findFirst({ where: { id: payload.locationId, deletedAt: null } });
      if (!location) throw new AppError(404, 'Location not found');
    }

    return prisma.$transaction(async (tx) => {
      if (payload.items && payload.items.length > 0) {
        // Validate products
        for (const item of payload.items) {
          const product = await tx.product.findFirst({ where: { id: item.productId, deletedAt: null } });
          if (!product) throw new AppError(404, `Product not found: ${item.productId}`);
          if (item.quantityChanged === 0) throw new AppError(400, `Quantity changed cannot be zero for product: ${item.productId}`);
        }

        // Replace all items
        await tx.stockAdjustmentItem.deleteMany({ where: { stockAdjustmentId: id } });

        const itemsData = await Promise.all(
          payload.items.map(async (item: any) => {
            const stock = await tx.stock.findUnique({
              where: {
                productId_locationId: {
                  productId: item.productId,
                  locationId: payload.locationId ?? adj.locationId
                }
              }
            });
            const previousQuantity = stock?.quantity ?? 0;
            return {
              stockAdjustmentId: id,
              productId: item.productId,
              previousQuantity,
              quantityChanged: item.quantityChanged,
              currentQuantity: previousQuantity + item.quantityChanged,
              reason: item.reason ?? null
            };
          })
        );

        await tx.stockAdjustmentItem.createMany({ data: itemsData });
      }

      const updateData: Prisma.StockAdjustmentUpdateInput = {
        updater: userId ? { connect: { id: userId } } : undefined
      };

      if (payload.reason !== undefined) updateData.reason = payload.reason ?? null;
      if (payload.locationId) updateData.location = { connect: { id: payload.locationId } };

      return tx.stockAdjustment.update({
        where: { id },
        data: updateData,
        include: {
          location: { select: { id: true, name: true } },
          creator: { select: { id: true, email: true } },
          updater: { select: { id: true, email: true } },
          items: { include: { product: { select: { id: true, name: true, sku: true } } } }
        }
      });
    });
  }

  /**
   * DRAFT → COMPLETED
   * This is the only point where stock quantities are actually changed.
   * Each item gets its previousQuantity snapshot, the stock is adjusted,
   * and the item is updated with the actual before/after values.
   */
  async completeStockAdjustment(id: string, userId: string) {
    const adj = await this.getAdjustmentById(id);

    if (adj.status !== StockAdjustmentStatus.DRAFT) {
      throw new AppError(400, `Cannot complete a Stock Adjustment in ${adj.status} status. Only DRAFT adjustments can be completed.`);
    }

    if (adj.items.length === 0) {
      throw new AppError(400, 'Cannot complete an adjustment with no items.');
    }

    // Pre-flight: validate no ADJUSTMENT_OUT would cause negative stock
    for (const item of adj.items) {
      if (item.quantityChanged < 0) {
        const stock = await prisma.stock.findUnique({
          where: { productId_locationId: { productId: item.productId, locationId: adj.locationId } }
        });
        const available = stock?.quantity ?? 0;
        if (available + item.quantityChanged < 0) {
          throw new AppError(400,
            `Insufficient stock for product "${item.product.name}" at "${adj.location.name}". Available: ${available}, Adjustment: ${item.quantityChanged}`,
            [{ field: 'quantityChanged', message: `Available: ${available}, Adjustment: ${item.quantityChanged}`, code: 'INSUFFICIENT_STOCK' }]
          );
        }
      }
    }

    return prisma.$transaction(async (tx) => {
      for (const item of adj.items) {
        const movementType = item.quantityChanged > 0
          ? StockMovementType.ADJUSTMENT_IN
          : StockMovementType.ADJUSTMENT_OUT;

        // Get actual current stock before adjusting (for accurate previousQuantity)
        const stockBefore = await tx.stock.findUnique({
          where: { productId_locationId: { productId: item.productId, locationId: adj.locationId } }
        });
        const previousQuantity = stockBefore?.quantity ?? 0;

        // Apply the stock change
        const currentQuantity = await stockLedgerService.adjustStock(tx, {
          productId: item.productId,
          locationId: adj.locationId,
          quantityChanged: item.quantityChanged,
          movementType,
          referenceType: 'StockAdjustment',
          referenceId: adj.id,
          performedBy: userId,
          notes: item.reason ?? adj.reason ?? 'Manual stock adjustment'
        });

        // Update the item with the real before/after snapshot
        await tx.stockAdjustmentItem.update({
          where: { id: item.id },
          data: { previousQuantity, currentQuantity }
        });
      }

      return tx.stockAdjustment.update({
        where: { id },
        data: {
          status: StockAdjustmentStatus.COMPLETED,
          adjustmentDate: new Date(),
          updater: userId ? { connect: { id: userId } } : undefined
        },
        include: {
          location: { select: { id: true, name: true } },
          creator: { select: { id: true, email: true } },
          updater: { select: { id: true, email: true } },
          items: { include: { product: { select: { id: true, name: true, sku: true } } } }
        }
      });
    });
  }

  /**
   * DRAFT → CANCELLED
   * No stock was moved at DRAFT stage, so nothing to reverse.
   */
  async cancelStockAdjustment(id: string, userId: string) {
    const adj = await this.getAdjustmentById(id);

    if (adj.status !== StockAdjustmentStatus.DRAFT) {
      throw new AppError(400, `Cannot cancel a Stock Adjustment in ${adj.status} status. Only DRAFT adjustments can be cancelled.`);
    }

    return stockAdjustmentRepository.update(id, {
      status: StockAdjustmentStatus.CANCELLED,
      updater: userId ? { connect: { id: userId } } : undefined
    });
  }
}

export const stockAdjustmentService = new StockAdjustmentService();
