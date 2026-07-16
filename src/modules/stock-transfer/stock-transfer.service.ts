import { prisma } from '../../config/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import { StockTransferStatus, StockMovementType, Prisma } from '@prisma/client';
import { stockTransferRepository } from './stock-transfer.repository.js';
import { stockLedgerService } from '../stock-ledger/stock-ledger.service.js';

/**
 * Stock Transfer Status Flow:
 *
 *   DRAFT ──► IN_TRANSIT ──► RECEIVED
 *     │            │
 *     └────────────┴──► CANCELLED
 *
 * Stock movement rules:
 *   - IN_TRANSIT  : source stock DECREASES (TRANSFER_OUT). Validated before dispatch.
 *   - RECEIVED    : destination stock INCREASES by receivedQty (TRANSFER_IN).
 *                   If receivedQty < transferredQty, the shortfall is automatically
 *                   returned to source (TRANSFER_IN "short return"). Nothing is ever lost.
 *   - CANCELLED from IN_TRANSIT: full transferred qty is restored to source (TRANSFER_IN reversal).
 *   - CANCELLED from DRAFT: no stock change.
 */
export class StockTransferService {
  private async generateTransferNumber() {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await stockTransferRepository.count({});
    const nextNum = String(count + 1).padStart(4, '0');
    return `TR-${dateStr}-${nextNum}`;
  }

  async getTransfers(params: {
    page?: number;
    limit?: number;
    status?: StockTransferStatus;
    sourceLocationId?: string;
    destinationLocationId?: string;
    searchTerm?: string;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.StockTransferWhereInput = { deletedAt: null };

    if (params.status) where.status = params.status;
    if (params.sourceLocationId) where.sourceLocationId = params.sourceLocationId;
    if (params.destinationLocationId) where.destinationLocationId = params.destinationLocationId;
    if (params.searchTerm) {
      where.OR = [
        { transferNumber: { contains: params.searchTerm, mode: 'insensitive' } },
        { notes: { contains: params.searchTerm, mode: 'insensitive' } }
      ];
    }

    const [data, total] = await Promise.all([
      stockTransferRepository.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      stockTransferRepository.count(where)
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
    };
  }

  async getTransferById(id: string) {
    const transfer = await stockTransferRepository.findById(id);
    if (!transfer) {
      throw new AppError(404, 'Stock Transfer not found', [
        { message: 'No Stock Transfer exists with the provided ID', code: 'NOT_FOUND' }
      ]);
    }
    return transfer;
  }

  async createTransfer(payload: any, userId: string) {
    const transferNumber = await this.generateTransferNumber();

    if (payload.sourceLocationId === payload.destinationLocationId) {
      throw new AppError(400, 'Source and destination locations must be different');
    }

    const source = await prisma.location.findFirst({ where: { id: payload.sourceLocationId, deletedAt: null } });
    if (!source) throw new AppError(404, 'Source location not found');

    const destination = await prisma.location.findFirst({ where: { id: payload.destinationLocationId, deletedAt: null } });
    if (!destination) throw new AppError(404, 'Destination location not found');

    for (const item of payload.items) {
      const product = await prisma.product.findFirst({ where: { id: item.productId, deletedAt: null } });
      if (!product) throw new AppError(404, `Product not found: ${item.productId}`);
      if (item.quantity <= 0) throw new AppError(400, `Quantity must be positive for product: ${item.productId}`);
    }

    return prisma.$transaction(async (tx) => {
      const itemsData = payload.items.map((item: any) => ({
        productId: item.productId,
        quantity: item.quantity,
        receivedQuantity: 0
      }));

      return tx.stockTransfer.create({
        data: {
          transferNumber,
          sourceLocationId: payload.sourceLocationId,
          destinationLocationId: payload.destinationLocationId,
          status: StockTransferStatus.DRAFT,
          notes: payload.notes || null,
          createdBy: userId,
          items: { create: itemsData }
        },
        include: {
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
          sourceLocation: { select: { id: true, name: true, code: true } },
          destinationLocation: { select: { id: true, name: true, code: true } },
          creator: { select: { id: true, email: true } }
        }
      });
    });
  }

  async updateTransfer(id: string, payload: any, userId: string) {
    const transfer = await this.getTransferById(id);

    if (transfer.status !== StockTransferStatus.DRAFT) {
      throw new AppError(400, `Cannot edit a Stock Transfer in ${transfer.status} status. Only DRAFT transfers can be edited.`);
    }

    const newSourceId = payload.sourceLocationId || transfer.sourceLocationId;
    const newDestId = payload.destinationLocationId || transfer.destinationLocationId;

    if (newSourceId === newDestId) {
      throw new AppError(400, 'Source and destination locations must be different');
    }

    if (payload.sourceLocationId) {
      const source = await prisma.location.findFirst({ where: { id: payload.sourceLocationId, deletedAt: null } });
      if (!source) throw new AppError(404, 'Source location not found');
    }

    if (payload.destinationLocationId) {
      const dest = await prisma.location.findFirst({ where: { id: payload.destinationLocationId, deletedAt: null } });
      if (!dest) throw new AppError(404, 'Destination location not found');
    }

    return prisma.$transaction(async (tx) => {
      if (payload.items && payload.items.length > 0) {
        await tx.stockTransferItem.deleteMany({ where: { stockTransferId: id } });

        const itemsData = payload.items.map((item: any) => ({
          stockTransferId: id,
          productId: item.productId,
          quantity: item.quantity,
          receivedQuantity: 0
        }));

        await tx.stockTransferItem.createMany({ data: itemsData });
      }

      const updateData: Prisma.StockTransferUpdateInput = {
        notes: payload.notes !== undefined ? (payload.notes || null) : transfer.notes,
        updater: userId ? { connect: { id: userId } } : undefined
      };

      if (payload.sourceLocationId) {
        updateData.sourceLocation = { connect: { id: payload.sourceLocationId } };
      }
      if (payload.destinationLocationId) {
        updateData.destinationLocation = { connect: { id: payload.destinationLocationId } };
      }

      return tx.stockTransfer.update({
        where: { id },
        data: updateData,
        include: {
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
          sourceLocation: { select: { id: true, name: true, code: true } },
          destinationLocation: { select: { id: true, name: true, code: true } },
          updater: { select: { id: true, email: true } }
        }
      });
    });
  }

  /**
   * DRAFT → IN_TRANSIT
   * Validates source stock for all items before touching the DB.
   * Deducts stock from source location atomically.
   */
  async shipTransfer(id: string, userId: string) {
    const transfer = await this.getTransferById(id);

    if (transfer.status !== StockTransferStatus.DRAFT) {
      throw new AppError(400, `Cannot mark transfer as IN_TRANSIT from ${transfer.status} status. Transfer must be in DRAFT status.`);
    }

    // Pre-flight stock check — validate ALL items first before touching anything
    for (const item of transfer.items) {
      const stock = await prisma.stock.findUnique({
        where: { productId_locationId: { productId: item.productId, locationId: transfer.sourceLocationId } }
      });
      const available = stock?.quantity ?? 0;
      if (available < item.quantity) {
        throw new AppError(400,
          `Insufficient stock for product "${item.product.name}" at source location "${transfer.sourceLocation.name}". Available: ${available}, Requested: ${item.quantity}`,
          [{ field: 'quantity', message: `Available: ${available}, Requested: ${item.quantity}`, code: 'INSUFFICIENT_STOCK' }]
        );
      }
    }

    return prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        await stockLedgerService.adjustStock(tx, {
          productId: item.productId,
          locationId: transfer.sourceLocationId,
          quantityChanged: -item.quantity,
          movementType: StockMovementType.TRANSFER_OUT,
          referenceType: 'StockTransfer',
          referenceId: transfer.id,
          performedBy: userId,
          notes: `Transfer out to ${transfer.destinationLocation.name} (${transfer.destinationLocation.code}) — Ref: ${transfer.transferNumber}`
        });
      }

      return tx.stockTransfer.update({
        where: { id },
        data: {
          status: StockTransferStatus.IN_TRANSIT,
          transferDate: new Date(),
          updater: userId ? { connect: { id: userId } } : undefined
        },
        include: {
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
          sourceLocation: { select: { id: true, name: true, code: true } },
          destinationLocation: { select: { id: true, name: true, code: true } }
        }
      });
    });
  }

  /**
   * IN_TRANSIT → RECEIVED
   *
   * PARTIAL RECEIVE HANDLING:
   *   Example: transferred 5, received 3
   *   → Destination (B) gets +3  via TRANSFER_IN
   *   → Source (A)      gets +2  via TRANSFER_IN ("short return")
   *
   *   This guarantees inventory is always balanced.
   *   The StockMovement ledger records both entries with their reasons.
   *
   * FULL RECEIVE:
   *   receivedQty === transferredQty → shortfall = 0, no return to source.
   */
  async receiveTransfer(id: string, payload: any, userId: string) {
    const transfer = await this.getTransferById(id);

    if (transfer.status !== StockTransferStatus.IN_TRANSIT) {
      throw new AppError(400, `Cannot receive a transfer in ${transfer.status} status. Transfer must be IN_TRANSIT.`);
    }

    // Validate ALL items before entering the transaction
    for (const item of payload.items) {
      const transferItem = transfer.items.find(ti => ti.productId === item.productId);
      if (!transferItem) {
        throw new AppError(400, `Product ID ${item.productId} is not part of this transfer.`);
      }
      if (item.receivedQuantity > transferItem.quantity) {
        throw new AppError(400,
          `Received quantity (${item.receivedQuantity}) cannot exceed transferred quantity (${transferItem.quantity}) for product "${transferItem.product.name}".`
        );
      }
    }

    return prisma.$transaction(async (tx) => {
      for (const item of payload.items) {
        const transferItem = transfer.items.find(ti => ti.productId === item.productId)!;

        const receivedQty   = item.receivedQuantity;
        const unreceivedQty = transferItem.quantity - receivedQty; // shortfall

        // 1. Record actual received qty on the transfer item
        await tx.stockTransferItem.update({
          where: { id: transferItem.id },
          data: { receivedQuantity: receivedQty }
        });

        // 2. Credit destination with what was actually received
        if (receivedQty > 0) {
          await stockLedgerService.adjustStock(tx, {
            productId: item.productId,
            locationId: transfer.destinationLocationId,
            quantityChanged: receivedQty,
            movementType: StockMovementType.TRANSFER_IN,
            referenceType: 'StockTransfer',
            referenceId: transfer.id,
            performedBy: userId,
            notes: `Transfer in from ${transfer.sourceLocation.name} (${transfer.sourceLocation.code}) — Ref: ${transfer.transferNumber}`
          });
        }

        // 3. PARTIAL RECEIVE: return unreceived qty back to source so nothing is lost
        if (unreceivedQty > 0) {
          await stockLedgerService.adjustStock(tx, {
            productId: item.productId,
            locationId: transfer.sourceLocationId,
            quantityChanged: unreceivedQty,
            movementType: StockMovementType.TRANSFER_IN,
            referenceType: 'StockTransfer',
            referenceId: transfer.id,
            performedBy: userId,
            notes: `Partial receive shortfall: ${unreceivedQty} unit(s) returned to source "${transfer.sourceLocation.name}" — Ref: ${transfer.transferNumber}`
          });
        }
      }

      return tx.stockTransfer.update({
        where: { id },
        data: {
          status: StockTransferStatus.RECEIVED,
          receivedDate: new Date(),
          notes: payload.notes !== undefined ? (payload.notes || null) : transfer.notes,
          updater: userId ? { connect: { id: userId } } : undefined
        },
        include: {
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
          sourceLocation: { select: { id: true, name: true, code: true } },
          destinationLocation: { select: { id: true, name: true, code: true } }
        }
      });
    });
  }

  /**
   * Cancel a transfer.
   * DRAFT     → no stock moved, just mark cancelled.
   * IN_TRANSIT → full transferred qty restored to source (TRANSFER_IN reversal).
   * RECEIVED  → cannot cancel, goods already settled.
   */
  async cancelTransfer(id: string, userId: string) {
    const transfer = await this.getTransferById(id);

    if (transfer.status === StockTransferStatus.RECEIVED) {
      throw new AppError(400, 'Cannot cancel a transfer that has already been RECEIVED.');
    }

    if (transfer.status === StockTransferStatus.CANCELLED) {
      throw new AppError(400, 'Transfer is already CANCELLED.');
    }

    return prisma.$transaction(async (tx) => {
      if (transfer.status === StockTransferStatus.IN_TRANSIT) {
        for (const item of transfer.items) {
          await stockLedgerService.adjustStock(tx, {
            productId: item.productId,
            locationId: transfer.sourceLocationId,
            quantityChanged: item.quantity,
            movementType: StockMovementType.TRANSFER_IN,
            referenceType: 'StockTransfer',
            referenceId: transfer.id,
            performedBy: userId,
            notes: `Cancelled transfer — full stock returned to "${transfer.sourceLocation.name}" (${transfer.sourceLocation.code}) — Ref: ${transfer.transferNumber}`
          });
        }
      }

      return tx.stockTransfer.update({
        where: { id },
        data: {
          status: StockTransferStatus.CANCELLED,
          updater: userId ? { connect: { id: userId } } : undefined
        },
        include: {
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
          sourceLocation: { select: { id: true, name: true, code: true } },
          destinationLocation: { select: { id: true, name: true, code: true } }
        }
      });
    });
  }
}

export const stockTransferService = new StockTransferService();
