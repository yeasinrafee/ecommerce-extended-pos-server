import { z } from 'zod';

export const supplierReturnItemSchema = z.object({
  productId: z.string().trim().min(1, 'Product ID is required'),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
  unitPrice: z.number().nonnegative('Unit price cannot be negative')
});

export const createSupplierReturnSchema = z.object({
  supplierId: z.number().int('Supplier ID must be an integer'),
  locationId: z.string().trim().min(1, 'Location ID is required'),
  notes: z.string().trim().optional().nullable(),
  items: z.array(supplierReturnItemSchema).min(1, 'At least one item is required')
});

export const updateSupplierReturnSchema = z.object({
  supplierId: z.number().int().optional(),
  locationId: z.string().trim().min(1).optional(),
  notes: z.string().trim().optional().nullable(),
  items: z.array(supplierReturnItemSchema).min(1).optional()
});
