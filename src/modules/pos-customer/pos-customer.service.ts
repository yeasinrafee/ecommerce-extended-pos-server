import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { prisma } from '../../config/prisma.js';
import type {
  CreatePosCustomerInput,
  UpdatePosCustomerInput,
  PosCustomerListQuery,
} from './pos-customer.types.js';

const getCustomers = async (query: PosCustomerListQuery) => {
  const { page = 1, limit = 20, searchTerm } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.PosCustomerWhereInput = {
    isDeleted: false,
  };

  if (searchTerm) {
    where.OR = [
      { name: { contains: searchTerm, mode: 'insensitive' } },
      { phone: { contains: searchTerm, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.posCustomer.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { posOrders: true },
        },
      },
    }),
    prisma.posCustomer.count({ where }),
  ]);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getCustomerById = async (id: string) => {
  const customer = await prisma.posCustomer.findFirst({
    where: { id, isDeleted: false },
    include: {
      _count: {
        select: { posOrders: true },
      },
    },
  });

  if (!customer) {
    throw new AppError(404, 'POS customer not found', [
      {
        field: 'id',
        message: 'No POS customer found with this id',
        code: 'POS_CUSTOMER_NOT_FOUND',
      },
    ]);
  }

  return customer;
};

const getCustomerOrders = async (
  id: string,
  query: { page?: number; limit?: number } = {},
) => {
  // First verify customer exists
  const customer = await prisma.posCustomer.findFirst({
    where: { id, isDeleted: false },
  });

  if (!customer) {
    throw new AppError(404, 'POS customer not found', [
      {
        field: 'id',
        message: 'No POS customer found with this id',
        code: 'POS_CUSTOMER_NOT_FOUND',
      },
    ]);
  }

  const page = Math.max(1, query.page ?? 1);
  const limit = Math.max(1, query.limit ?? 10);
  const skip = (page - 1) * limit;

  const where: Prisma.PosOrderWhereInput = {
    posCustomerId: id,
    deletedAt: null,
  };

  const [orders, total] = await Promise.all([
    prisma.posOrder.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        invoiceNumber: true,
        customerName: true,
        customerPhone: true,
        finalAmount: true,
        paidAmount: true,
        paymentStatus: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            admins: {
              select: { name: true },
              take: 1,
            },
          },
        },
        posOrderItems: {
          where: { deletedAt: null },
          select: {
            id: true,
            quantity: true,
            Baseprice: true,
            finalPrice: true,
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                image: true,
              },
            },
            variations: {
              where: { deletedAt: null },
              select: {
                productVariation: {
                  select: {
                    id: true,
                    attributeValue: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.posOrder.count({ where }),
  ]);

  return {
    data: orders.map((order) => ({
      id: order.id,
      invoiceNumber: order.invoiceNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      totalQuantity: order.posOrderItems.reduce(
        (sum, item) => sum + item.quantity,
        0,
      ),
      totalAmount: order.finalAmount,
      paidAmount: order.paidAmount,
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt,
      processedBy: {
        userId: order.user.id,
        adminName: order.user.admins[0]?.name ?? null,
      },
      items: order.posOrderItems.map((item) => ({
        id: item.id,
        productName: item.product.name,
        productSku: item.product.sku,
        productImage: item.product.image,
        quantity: item.quantity,
        unitPrice: Number(item.finalPrice),
        lineTotal: Number((item.finalPrice * item.quantity).toFixed(2)),
        variations: item.variations.map((v) => ({
          attributeValue: v.productVariation.attributeValue,
        })),
      })),
    })),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

const createCustomer = async (input: CreatePosCustomerInput) => {
  const { name, phone } = input;

  if (!phone || !phone.trim()) {
    throw new AppError(400, 'Phone number is required', [
      {
        field: 'phone',
        message: 'Phone number is required',
        code: 'PHONE_REQUIRED',
      },
    ]);
  }

  // Check if phone already exists
  const existing = await prisma.posCustomer.findFirst({
    where: { phone: phone.trim(), isDeleted: false },
  });

  if (existing) {
    throw new AppError(409, 'Phone number already exists', [
      {
        field: 'phone',
        message: 'A POS customer with this phone number already exists',
        code: 'PHONE_ALREADY_EXISTS',
      },
    ]);
  }

  const customer = await prisma.posCustomer.create({
    data: {
      name: name.trim(),
      phone: phone.trim(),
    },
  });

  return customer;
};

const updateCustomer = async (id: string, input: UpdatePosCustomerInput) => {
  const customer = await prisma.posCustomer.findFirst({
    where: { id, isDeleted: false },
  });

  if (!customer) {
    throw new AppError(404, 'POS customer not found', [
      {
        field: 'id',
        message: 'No POS customer found with this id',
        code: 'POS_CUSTOMER_NOT_FOUND',
      },
    ]);
  }

  const updated = await prisma.posCustomer.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    },
  });

  return updated;
};

const deleteCustomer = async (id: string) => {
  const customer = await prisma.posCustomer.findFirst({
    where: { id, isDeleted: false },
  });

  if (!customer) {
    throw new AppError(404, 'POS customer not found', [
      {
        field: 'id',
        message: 'No POS customer found with this id',
        code: 'POS_CUSTOMER_NOT_FOUND',
      },
    ]);
  }

  // Soft delete
  await prisma.posCustomer.update({
    where: { id },
    data: { isDeleted: true },
  });

  return { success: true };
};

/**
 * Find or create a POS customer by phone number.
 * Used internally during POS order creation.
 * If phone exists (active), return that customer.
 * If phone doesn't exist, create a new one with the provided name/phone.
 */
const findOrCreateByPhone = async (
  tx: Prisma.TransactionClient,
  phone: string,
  name?: string,
) => {
  const trimmedPhone = phone.trim();
  if (!trimmedPhone) return null;

  // Try to find existing active customer
  const existing = await tx.posCustomer.findFirst({
    where: { phone: trimmedPhone, isDeleted: false },
  });

  if (existing) return existing;

  // Create new customer
  const newCustomer = await tx.posCustomer.create({
    data: {
      name: name?.trim() || 'Walk-in Customer',
      phone: trimmedPhone,
    },
  });

  return newCustomer;
};

export const posCustomerService = {
  getCustomers,
  getCustomerById,
  getCustomerOrders,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  findOrCreateByPhone,
};
