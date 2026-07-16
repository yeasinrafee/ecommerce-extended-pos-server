import { z } from 'zod';
import { PurchaseOrderStatus } from '@prisma/client';

export const createPurchaseOrderItemSchema = z.object({
  productId: z.string().trim().min(1, 'Product ID is required'),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
  unitPrice: z.number().nonnegative('Unit price cannot be negative'),
  taxPercent: z.number().min(0).max(100).default(0),
  discountPercent: z.number().min(0).max(100).default(0)
});

export const createPurchaseOrderSchema = z.object({
  supplierId: z.number().int('Supplier ID must be an integer'),
  locationId: z.string().trim().min(1, 'Location ID is required'),
  orderDate: z.coerce.date(),
  expectedDate: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? null : val),
    z.coerce.date().nullable().optional()
  ),
  notes: z.string().trim().optional().nullable(),
  items: z.array(createPurchaseOrderItemSchema).min(1, 'At least one order item is required')
});

export const updatePurchaseOrderSchema = z.object({
  supplierId: z.number().int().optional(),
  locationId: z.string().trim().optional(),
  orderDate: z.coerce.date().optional(),
  expectedDate: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? null : val),
    z.coerce.date().nullable().optional()
  ),
  notes: z.string().trim().optional().nullable(),
  items: z.array(createPurchaseOrderItemSchema).optional()
});
