import { Prisma, StockMovementType } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { prisma } from '../../config/prisma.js';
import { stockLedgerRepository } from './stock-ledger.repository.js';

/**
 * Derives the correct stockStatus from the current stock quantity.
 * LOW_STOCK threshold defaults to 10 unless a lowStockConfig exists for the product.
 *
 * Rules:
 *   stock <= 0              → OUT_OF_STOCK
 *   0 < stock <= threshold  → LOW_STOCK
 *   stock > threshold       → IN_STOCK
 */
export const resolveStockStatus = async (
  tx: Prisma.TransactionClient,
  productId: string,
  currentStock: number
): Promise<'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'> => {
  if (currentStock <= 0) return 'OUT_OF_STOCK';

  // Look up a global (locationId = null) low stock config for this product
  const config = await tx.lowStockConfig.findFirst({
    where: { productId, locationId: null, deletedAt: null },
    select: { minimumQuantity: true }
  });

  const threshold = config?.minimumQuantity ?? 10;
  if (currentStock <= threshold) return 'LOW_STOCK';
  return 'IN_STOCK';
};

export class StockLedgerService {
  /**
   * Atomic stock adjustment that locks the record for update, validates that quantity won't go negative,
   * updates the stock, and records a stock movement ledger entry.
   * Must run inside a Prisma Transaction.
   */
  async adjustStock(
    tx: Prisma.TransactionClient,
    params: {
      productId: string;
      locationId: string;
      quantityChanged: number;
      movementType: StockMovementType;
      referenceType: string;
      referenceId: string;
      performedBy: string;
      notes?: string;
    }
  ) {
    const {
      productId,
      locationId,
      quantityChanged,
      movementType,
      referenceType,
      referenceId,
      performedBy,
      notes
    } = params;

    // 1. Ensure stock record exists
    let stock = await tx.stock.findUnique({
      where: {
        productId_locationId: { productId, locationId }
      }
    });

    if (!stock) {
      stock = await tx.stock.create({
        data: {
          productId,
          locationId,
          quantity: 0,
          reservedQuantity: 0
        }
      });
    }

    // 2. Lock the stock record for update to prevent concurrent race conditions
    await tx.$executeRaw(Prisma.sql`SELECT id FROM stocks WHERE id = ${stock.id} FOR UPDATE`);

    // 3. Re-read the row to get the locked current value
    const currentStock = await tx.stock.findUniqueOrThrow({
      where: { id: stock.id }
    });

    const previousQuantity = currentStock.quantity;
    const currentQuantity = previousQuantity + quantityChanged;

    // Prevent negative stock
    if (currentQuantity < 0) {
      throw new AppError(400, `Insufficient stock for product id ${productId} at location id ${locationId}. Available stock: ${previousQuantity}, Requested change: ${quantityChanged}`, [
        {
          field: 'quantity',
          message: `Insufficient stock. Current available: ${previousQuantity}`,
          code: 'INSUFFICIENT_STOCK'
        }
      ]);
    }

    // 4. Update the stock quantity
    await tx.stock.update({
      where: { id: currentStock.id },
      data: { quantity: currentQuantity }
    });

    // 5. Create stock movement record
    await stockLedgerRepository.createMovement(
      {
        productId,
        locationId,
        movementType,
        previousQuantity,
        quantityChanged,
        currentQuantity,
        referenceType,
        referenceId,
        performedBy,
        notes
      },
      tx
    );

    return currentQuantity;
  }

  /**
   * Adjusts the reserved quantity of stock in a location.
   * Reservation changes do not write a physical ledger movement but are critical for checking stock.
   */
  async adjustReservation(
    tx: Prisma.TransactionClient,
    productId: string,
    locationId: string,
    reservationChanged: number
  ) {
    let stock = await tx.stock.findUnique({
      where: {
        productId_locationId: { productId, locationId }
      }
    });

    if (!stock) {
      stock = await tx.stock.create({
        data: {
          productId,
          locationId,
          quantity: 0,
          reservedQuantity: 0
        }
      });
    }

    // Lock
    await tx.$executeRaw(Prisma.sql`SELECT id FROM stocks WHERE id = ${stock.id} FOR UPDATE`);

    const currentStock = await tx.stock.findUniqueOrThrow({
      where: { id: stock.id }
    });

    const newReserved = currentStock.reservedQuantity + reservationChanged;

    if (newReserved < 0) {
      throw new AppError(400, `Reserved quantity cannot be negative. Current: ${currentStock.reservedQuantity}, Requested: ${reservationChanged}`, [
        {
          field: 'reservedQuantity',
          message: 'Invalid reserved quantity change',
          code: 'INVALID_RESERVATION'
        }
      ]);
    }

    await tx.stock.update({
      where: { id: currentStock.id },
      data: { reservedQuantity: newReserved }
    });

    return newReserved;
  }
}

export const stockLedgerService = new StockLedgerService();
