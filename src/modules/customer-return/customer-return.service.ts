import { prisma } from '../../config/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import { CustomerReturnStatus, StockMovementType, Prisma } from '@prisma/client';
import { customerReturnRepository } from './customer-return.repository.js';
import { stockLedgerService } from '../stock-ledger/stock-ledger.service.js';

/**
 * Customer Return Status Flow:
 *
 *   PENDING ──► REFUNDED   ← stock credited to location only here
 *      │
 *      └──► CANCELLED      ← no stock change, only allowed from PENDING
 *
 * Fields:
 *   - locationId  : where the returned goods go back into stock
 *   - items       : productId + quantity
 *   - notes       : optional
 *
 * No customer, posOrder, order, or refundPrice fields.
 */
export class CustomerReturnService {
  private async generateCRNumber() {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await customerReturnRepository.count({});
    const nextNum = String(count + 1).padStart(4, '0');
    return `CR-${dateStr}-${nextNum}`;
  }

  async getCustomerReturns(params: {
    page?: number;
    limit?: number;
    locationId?: string;
    status?: CustomerReturnStatus;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.CustomerReturnWhereInput = { deletedAt: null };

    if (params.locationId) where.locationId = params.locationId;
    if (params.status) where.status = params.status;

    const [data, total] = await Promise.all([
      customerReturnRepository.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      customerReturnRepository.count(where)
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
    };
  }

  async getCustomerReturnById(id: string) {
    const cr = await customerReturnRepository.findById(id);
    if (!cr) throw new AppError(404, 'Customer Return not found');
    return cr;
  }

  /**
   * Create a new customer return in PENDING status.
   * No stock is credited here.
   */
  async createCustomerReturn(payload: any, userId: string) {
    const returnNumber = await this.generateCRNumber();

    const location = await prisma.location.findFirst({ where: { id: payload.locationId, deletedAt: null } });
    if (!location) throw new AppError(404, 'Location not found');

    for (const item of payload.items) {
      const product = await prisma.product.findFirst({ where: { id: item.productId, deletedAt: null } });
      if (!product) throw new AppError(404, `Product not found: ${item.productId}`);
      if (item.quantity <= 0) throw new AppError(400, `Quantity must be positive for product: ${item.productId}`);
    }

    const itemsData = payload.items.map((item: any) => ({
      productId: item.productId,
      quantity: item.quantity
    }));

    return prisma.customerReturn.create({
      data: {
        returnNumber,
        locationId: payload.locationId,
        returnDate: new Date(),
        status: CustomerReturnStatus.PENDING,
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
   * Update a PENDING customer return.
   * Replaces all items if provided.
   */
  async updateCustomerReturn(id: string, payload: any, userId: string) {
    const cr = await this.getCustomerReturnById(id);

    if (cr.status !== CustomerReturnStatus.PENDING) {
      throw new AppError(400, `Cannot edit a Customer Return in ${cr.status} status. Only PENDING returns can be edited.`);
    }

    if (payload.locationId) {
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

        await tx.customerReturnItem.deleteMany({ where: { customerReturnId: id } });

        const itemsData = payload.items.map((item: any) => ({
          customerReturnId: id,
          productId: item.productId,
          quantity: item.quantity
        }));

        await tx.customerReturnItem.createMany({ data: itemsData });
      }

      const updateData: Prisma.CustomerReturnUpdateInput = {
        updater: userId ? { connect: { id: userId } } : undefined
      };

      if (payload.notes !== undefined) updateData.notes = payload.notes || null;
      if (payload.locationId) updateData.location = { connect: { id: payload.locationId } };

      return tx.customerReturn.update({
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
   * PENDING → REFUNDED
   * Credits all returned items back to stock at the specified location.
   */
  async refundCustomerReturn(id: string, userId: string) {
    const cr = await this.getCustomerReturnById(id);

    if (cr.status !== CustomerReturnStatus.PENDING) {
      throw new AppError(400, `Cannot refund a Customer Return in ${cr.status} status. Only PENDING returns can be refunded.`);
    }

    if (cr.items.length === 0) {
      throw new AppError(400, 'Cannot refund a customer return with no items.');
    }

    return prisma.$transaction(async (tx) => {
      for (const item of cr.items) {
        await stockLedgerService.adjustStock(tx, {
          productId: item.productId,
          locationId: cr.locationId,
          quantityChanged: item.quantity,
          movementType: StockMovementType.CUSTOMER_RETURN,
          referenceType: 'CustomerReturn',
          referenceId: cr.id,
          performedBy: userId,
          notes: `Customer return credited to stock at "${cr.location.name}". Ref: ${cr.returnNumber}`
        });
      }

      return tx.customerReturn.update({
        where: { id },
        data: {
          status: CustomerReturnStatus.REFUNDED,
          returnDate: new Date(),
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
   * PENDING → CANCELLED
   * No stock was credited, nothing to reverse.
   */
  async cancelCustomerReturn(id: string, userId: string) {
    const cr = await this.getCustomerReturnById(id);

    if (cr.status !== CustomerReturnStatus.PENDING) {
      throw new AppError(400, `Cannot cancel a Customer Return in ${cr.status} status. Only PENDING returns can be cancelled.`);
    }

    return customerReturnRepository.update(id, {
      status: CustomerReturnStatus.CANCELLED,
      updater: userId ? { connect: { id: userId } } : undefined
    });
  }

  async handleCustomerReturn(orderId: string, productId: string, quantity: number) {
    return prisma.$transaction(async (tx) => {
      let order = await tx.order.findUnique({
        where: { id: orderId },
        include: { orderItems: true }
      });

      if (order) {
        const orderItem = order.orderItems.find((item) => item.productId === productId);
        if (!orderItem) {
          throw new AppError(404, 'Product not found in this order');
        }

        if (quantity > orderItem.quantity) {
          throw new AppError(400, 'Return quantity cannot exceed order item quantity');
        }

        const location = await tx.location.findFirst({ where: { deletedAt: null } });
        if (!location) {
          throw new AppError(404, 'No location found in the system');
        }
        const locationId = location.id;

        const stock = await tx.stock.findUnique({
          where: {
            productId_locationId: { productId, locationId }
          }
        });

        if (stock) {
          await tx.stock.update({
            where: { id: stock.id },
            data: {
              quantity: {
                increment: quantity
              }
            }
          });
        } else {
          await tx.stock.create({
            data: {
              productId,
              locationId,
              quantity,
              reservedQuantity: 0
            }
          });
        }

        // Increment global Product.stock
        await tx.product.update({
          where: { id: productId },
          data: {
            stock: {
              increment: quantity
            }
          }
        });

        const totalCost = orderItem.Baseprice * quantity;

        await tx.order.update({
          where: { id: orderId },
          data: {
            totalProfit: {
              decrement: totalCost
            },
            orderStatus: 'RETURNED'
          }
        });

        return { success: true };
      } else {
        // If not found in Order, check PosOrder!
        const posOrder = await tx.posOrder.findUnique({
          where: { id: orderId },
          include: { posOrderItems: true }
        });

        if (!posOrder) {
          throw new AppError(404, 'Order or POS Order not found');
        }

        const posItem = posOrder.posOrderItems.find((item) => item.productId === productId);
        if (!posItem) {
          throw new AppError(404, 'Product not found in this POS Order');
        }

        if (quantity > posItem.quantity) {
          throw new AppError(400, 'Return quantity cannot exceed item quantity');
        }

        // Find store location
        const store = posOrder.storeId ? await tx.store.findUnique({ where: { id: posOrder.storeId } }) : null;
        const locationId = store?.locationId ?? (await tx.location.findFirst({ where: { deletedAt: null } }))?.id;

        if (!locationId) {
          throw new AppError(404, 'No location associated with this order/store');
        }

        const stock = await tx.stock.findUnique({
          where: {
            productId_locationId: { productId, locationId }
          }
        });

        if (stock) {
          await tx.stock.update({
            where: { id: stock.id },
            data: {
              quantity: {
                increment: quantity
              }
            }
          });
        } else {
          await tx.stock.create({
            data: {
              productId,
              locationId,
              quantity,
              reservedQuantity: 0
            }
          });
        }

        // Increment global Product.stock
        await tx.product.update({
          where: { id: productId },
          data: {
            stock: {
              increment: quantity
            }
          }
        });

        return { success: true };
      }
    });
  }
}

export const customerReturnService = new CustomerReturnService();
