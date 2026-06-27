import { prisma } from '../../config/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import { DamageStatus, DamageReason, StockMovementType, Prisma } from '@prisma/client';
import { damageRepository } from './damage.repository.js';
import { stockLedgerService } from '../stock-ledger/stock-ledger.service.js';

/**
 * Damage / Write-off Status Flow:
 *
 *   DRAFT ──► COMPLETED   ← stock deduction happens only here
 *     │
 *     └──► CANCELLED      ← no stock change, only allowed from DRAFT
 *
 * Rules:
 *   - Create always produces DRAFT. No stock is touched at create time.
 *   - DRAFT can be edited (items, notes, locationId).
 *   - complete() transitions DRAFT → COMPLETED and deducts stock atomically.
 *   - cancel() transitions DRAFT → CANCELLED. No stock was ever touched.
 *   - COMPLETED and CANCELLED are terminal — no further transitions.
 *
 * Movement types on complete():
 *   - DamageReason.EXPIRED  → StockMovementType.EXPIRED
 *   - All other reasons     → StockMovementType.DAMAGE
 */
export class DamageService {
  private async generateDamageNumber() {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await damageRepository.count({});
    const nextNum = String(count + 1).padStart(4, '0');
    return `DMG-${dateStr}-${nextNum}`;
  }

  async getDamages(params: {
    page?: number;
    limit?: number;
    locationId?: string;
    status?: DamageStatus;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.DamageWhereInput = { deletedAt: null };

    if (params.locationId) where.locationId = params.locationId;
    if (params.status) where.status = params.status;

    const [data, total] = await Promise.all([
      damageRepository.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      damageRepository.count(where)
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
    };
  }

  async getDamageById(id: string) {
    const dmg = await damageRepository.findById(id);
    if (!dmg) throw new AppError(404, 'Damage report not found');
    return dmg;
  }

  /**
   * Create a new damage report in DRAFT status.
   * No stock is touched here — items are recorded for review.
   */
  async createDamage(payload: any, userId: string) {
    const damageNumber = await this.generateDamageNumber();

    const location = await prisma.location.findFirst({ where: { id: payload.locationId, deletedAt: null } });
    if (!location) throw new AppError(404, 'Location not found');

    // Validate all products exist before creating
    for (const item of payload.items) {
      const product = await prisma.product.findFirst({ where: { id: item.productId, deletedAt: null } });
      if (!product) throw new AppError(404, `Product not found: ${item.productId}`);
      if (item.quantity <= 0) throw new AppError(400, `Quantity must be positive for product: ${item.productId}`);
    }

    const itemsData = payload.items.map((item: any) => ({
      productId: item.productId,
      quantity: item.quantity,
      reason: item.reason ?? DamageReason.DAMAGED
    }));

    return prisma.damage.create({
      data: {
        damageNumber,
        locationId: payload.locationId,
        damageDate: new Date(),
        status: DamageStatus.DRAFT,
        notes: payload.notes || null,
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
   * Update a DRAFT damage report.
   * Replaces all items if provided. Can also update notes and locationId.
   */
  async updateDamage(id: string, payload: any, userId: string) {
    const dmg = await this.getDamageById(id);

    if (dmg.status !== DamageStatus.DRAFT) {
      throw new AppError(400, `Cannot edit a Damage report in ${dmg.status} status. Only DRAFT reports can be edited.`);
    }

    if (payload.locationId && payload.locationId !== dmg.locationId) {
      const location = await prisma.location.findFirst({ where: { id: payload.locationId, deletedAt: null } });
      if (!location) throw new AppError(404, 'Location not found');
    }

    return prisma.$transaction(async (tx) => {
      if (payload.items && payload.items.length > 0) {
        for (const item of payload.items) {
          const product = await tx.product.findFirst({ where: { id: item.productId, deletedAt: null } });
          if (!product) throw new AppError(404, `Product not found: ${item.productId}`);
          if (item.quantity <= 0) throw new AppError(400, `Quantity must be positive for product: ${item.productId}`);
        }

        await tx.damageItem.deleteMany({ where: { damageId: id } });

        const itemsData = payload.items.map((item: any) => ({
          damageId: id,
          productId: item.productId,
          quantity: item.quantity,
          reason: item.reason ?? DamageReason.DAMAGED
        }));

        await tx.damageItem.createMany({ data: itemsData });
      }

      const updateData: Prisma.DamageUpdateInput = {
        updater: userId ? { connect: { id: userId } } : undefined
      };

      if (payload.notes !== undefined) updateData.notes = payload.notes || null;
      if (payload.locationId) updateData.location = { connect: { id: payload.locationId } };

      return tx.damage.update({
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
   * This is the only point where stock is actually deducted.
   * Pre-flight validates sufficient stock for all items before touching DB.
   */
  async completeDamage(id: string, userId: string) {
    const dmg = await this.getDamageById(id);

    if (dmg.status !== DamageStatus.DRAFT) {
      throw new AppError(400, `Cannot complete a Damage report in ${dmg.status} status. Only DRAFT reports can be completed.`);
    }

    if (dmg.items.length === 0) {
      throw new AppError(400, 'Cannot complete a damage report with no items.');
    }

    // Pre-flight: check all items have enough stock before touching anything
    for (const item of dmg.items) {
      const stock = await prisma.stock.findUnique({
        where: { productId_locationId: { productId: item.productId, locationId: dmg.locationId } }
      });
      const available = stock?.quantity ?? 0;
      if (available < item.quantity) {
        throw new AppError(400,
          `Insufficient stock for product "${item.product.name}" at "${dmg.location.name}". Available: ${available}, Write-off: ${item.quantity}`,
          [{ field: 'quantity', message: `Available: ${available}, Write-off: ${item.quantity}`, code: 'INSUFFICIENT_STOCK' }]
        );
      }
    }

    return prisma.$transaction(async (tx) => {
      for (const item of dmg.items) {
        const movementType = item.reason === DamageReason.EXPIRED
          ? StockMovementType.EXPIRED
          : StockMovementType.DAMAGE;

        await stockLedgerService.adjustStock(tx, {
          productId: item.productId,
          locationId: dmg.locationId,
          quantityChanged: -item.quantity,
          movementType,
          referenceType: 'Damage',
          referenceId: dmg.id,
          performedBy: userId,
          notes: `Write-off: ${item.reason}. Ref: ${dmg.damageNumber}`
        });
      }

      return tx.damage.update({
        where: { id },
        data: {
          status: DamageStatus.COMPLETED,
          damageDate: new Date(),
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
   * No stock was touched at DRAFT stage, nothing to reverse.
   */
  async cancelDamage(id: string, userId: string) {
    const dmg = await this.getDamageById(id);

    if (dmg.status !== DamageStatus.DRAFT) {
      throw new AppError(400, `Cannot cancel a Damage report in ${dmg.status} status. Only DRAFT reports can be cancelled.`);
    }

    return damageRepository.update(id, {
      status: DamageStatus.CANCELLED,
      updater: userId ? { connect: { id: userId } } : undefined
    });
  }
}

export const damageService = new DamageService();
