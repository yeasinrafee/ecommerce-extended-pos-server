import { prisma } from '../../config/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import { SupplierReturnStatus, StockMovementType, Prisma } from '@prisma/client';
import { supplierReturnRepository } from './supplier-return.repository.js';
import { stockLedgerService } from '../stock-ledger/stock-ledger.service.js';

/**
 * Supplier Return Status Flow:
 *
 *   DRAFT ──► COMPLETED   ← stock deduction + supplier balance update happens only here
 *     │
 *     └──► CANCELLED      ← no stock change, only allowed from DRAFT
 *
 * Rules:
 *   - Create always produces DRAFT. No stock or supplier balance is touched at create time.
 *   - DRAFT can be edited (items, notes, supplierId, locationId).
 *   - complete() transitions DRAFT → COMPLETED:
 *       • deducts stock from location
 *       • reduces supplier.totalPurchaseAmount and supplier.dueAmount
 *   - cancel() transitions DRAFT → CANCELLED. Nothing is reversed (nothing was done).
 *   - COMPLETED and CANCELLED are terminal.
 */
export class SupplierReturnService {
  private async generateSRNumber() {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await supplierReturnRepository.count({});
    const nextNum = String(count + 1).padStart(4, '0');
    return `SR-${dateStr}-${nextNum}`;
  }

  async getSupplierReturns(params: {
    page?: number;
    limit?: number;
    supplierId?: number;
    locationId?: string;
    status?: SupplierReturnStatus;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.SupplierReturnWhereInput = { deletedAt: null };

    if (params.supplierId) where.supplierId = params.supplierId;
    if (params.locationId) where.locationId = params.locationId;
    if (params.status) where.status = params.status;

    const [data, total] = await Promise.all([
      supplierReturnRepository.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      supplierReturnRepository.count(where)
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
    };
  }

  async getSupplierReturnById(id: string) {
    const sr = await supplierReturnRepository.findById(id);
    if (!sr) throw new AppError(404, 'Supplier Return not found');
    return sr;
  }

  /**
   * Create a new supplier return in DRAFT status.
   * No stock or supplier balance is touched here.
   */
  async createSupplierReturn(payload: any, userId: string) {
    const returnNumber = await this.generateSRNumber();

    const supplier = await prisma.supplier.findFirst({ where: { id: payload.supplierId, deletedAt: null } });
    if (!supplier) throw new AppError(404, 'Supplier not found');

    const location = await prisma.location.findFirst({ where: { id: payload.locationId, deletedAt: null } });
    if (!location) throw new AppError(404, 'Location not found');

    // Validate products exist
    for (const item of payload.items) {
      const product = await prisma.product.findFirst({ where: { id: item.productId, deletedAt: null } });
      if (!product) throw new AppError(404, `Product not found: ${item.productId}`);
      if (item.quantity <= 0) throw new AppError(400, `Quantity must be positive for product: ${item.productId}`);
    }

    let totalAmount = 0;
    const itemsData = payload.items.map((item: any) => {
      const itemTotal = item.quantity * item.unitPrice;
      totalAmount += itemTotal;
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: itemTotal
      };
    });

    return prisma.supplierReturn.create({
      data: {
        returnNumber,
        supplierId: payload.supplierId,
        locationId: payload.locationId,
        returnDate: new Date(),
        status: SupplierReturnStatus.DRAFT,
        totalAmount,
        notes: payload.notes || null,
        createdBy: userId,
        items: { create: itemsData }
      },
      include: {
        supplier: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        creator: { select: { id: true, email: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } }
      }
    });
  }

  /**
   * Update a DRAFT supplier return.
   * Replaces all items if provided.
   */
  async updateSupplierReturn(id: string, payload: any, userId: string) {
    const sr = await this.getSupplierReturnById(id);

    if (sr.status !== SupplierReturnStatus.DRAFT) {
      throw new AppError(400, `Cannot edit a Supplier Return in ${sr.status} status. Only DRAFT returns can be edited.`);
    }

    if (payload.supplierId) {
      const supplier = await prisma.supplier.findFirst({ where: { id: payload.supplierId, deletedAt: null } });
      if (!supplier) throw new AppError(404, 'Supplier not found');
    }

    if (payload.locationId) {
      const location = await prisma.location.findFirst({ where: { id: payload.locationId, deletedAt: null } });
      if (!location) throw new AppError(404, 'Location not found');
    }

    return prisma.$transaction(async (tx) => {
      let totalAmount = sr.totalAmount;

      if (payload.items && payload.items.length > 0) {
        for (const item of payload.items) {
          const product = await tx.product.findFirst({ where: { id: item.productId, deletedAt: null } });
          if (!product) throw new AppError(404, `Product not found: ${item.productId}`);
          if (item.quantity <= 0) throw new AppError(400, `Quantity must be positive for product: ${item.productId}`);
        }

        await tx.supplierReturnItem.deleteMany({ where: { supplierReturnId: id } });

        totalAmount = 0;
        const itemsData = payload.items.map((item: any) => {
          const itemTotal = item.quantity * item.unitPrice;
          totalAmount += itemTotal;
          return {
            supplierReturnId: id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: itemTotal
          };
        });

        await tx.supplierReturnItem.createMany({ data: itemsData });
      }

      const updateData: Prisma.SupplierReturnUpdateInput = {
        totalAmount,
        updater: userId ? { connect: { id: userId } } : undefined
      };

      if (payload.notes !== undefined) updateData.notes = payload.notes || null;
      if (payload.supplierId) updateData.supplier = { connect: { id: payload.supplierId } };
      if (payload.locationId) updateData.location = { connect: { id: payload.locationId } };

      return tx.supplierReturn.update({
        where: { id },
        data: updateData,
        include: {
          supplier: { select: { id: true, name: true } },
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
   * Deducts stock from location and reduces supplier balance.
   */
  async completeSupplierReturn(id: string, userId: string) {
    const sr = await this.getSupplierReturnById(id);

    if (sr.status !== SupplierReturnStatus.DRAFT) {
      throw new AppError(400, `Cannot complete a Supplier Return in ${sr.status} status. Only DRAFT returns can be completed.`);
    }

    if (sr.items.length === 0) {
      throw new AppError(400, 'Cannot complete a supplier return with no items.');
    }

    // Pre-flight: check all items have enough stock before touching anything
    for (const item of sr.items) {
      const stock = await prisma.stock.findUnique({
        where: { productId_locationId: { productId: item.productId, locationId: sr.locationId } }
      });
      const available = stock?.quantity ?? 0;
      if (available < item.quantity) {
        throw new AppError(400,
          `Insufficient stock for product "${item.product.name}" at "${sr.location.name}". Available: ${available}, Return qty: ${item.quantity}`,
          [{ field: 'quantity', message: `Available: ${available}, Return qty: ${item.quantity}`, code: 'INSUFFICIENT_STOCK' }]
        );
      }
    }

    return prisma.$transaction(async (tx) => {
      // 1. Deduct stock for each item
      for (const item of sr.items) {
        await stockLedgerService.adjustStock(tx, {
          productId: item.productId,
          locationId: sr.locationId,
          quantityChanged: -item.quantity,
          movementType: StockMovementType.SUPPLIER_RETURN,
          referenceType: 'SupplierReturn',
          referenceId: sr.id,
          performedBy: userId,
          notes: `Returned to supplier "${sr.supplier.name}". Ref: ${sr.returnNumber}`
        });
      }

      // 2. Reduce supplier balance (with row lock)
      await tx.$executeRaw(Prisma.sql`SELECT id FROM suppliers WHERE id = ${sr.supplierId} FOR UPDATE`);
      const reloadedSupplier = await tx.supplier.findFirstOrThrow({ where: { id: sr.supplierId } });

      await tx.supplier.update({
        where: { id: sr.supplierId },
        data: {
          totalPurchaseAmount: Math.max(0, reloadedSupplier.totalPurchaseAmount - sr.totalAmount),
          dueAmount: Math.max(0, reloadedSupplier.dueAmount - sr.totalAmount)
        }
      });

      // 3. Mark as COMPLETED
      return tx.supplierReturn.update({
        where: { id },
        data: {
          status: SupplierReturnStatus.COMPLETED,
          returnDate: new Date(),
          updater: userId ? { connect: { id: userId } } : undefined
        },
        include: {
          supplier: { select: { id: true, name: true } },
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
   * No stock or balance was touched, nothing to reverse.
   */
  async cancelSupplierReturn(id: string, userId: string) {
    const sr = await this.getSupplierReturnById(id);

    if (sr.status !== SupplierReturnStatus.DRAFT) {
      throw new AppError(400, `Cannot cancel a Supplier Return in ${sr.status} status. Only DRAFT returns can be cancelled.`);
    }

    return supplierReturnRepository.update(id, {
      status: SupplierReturnStatus.CANCELLED,
      updater: userId ? { connect: { id: userId } } : undefined
    });
  }
}

export const supplierReturnService = new SupplierReturnService();
