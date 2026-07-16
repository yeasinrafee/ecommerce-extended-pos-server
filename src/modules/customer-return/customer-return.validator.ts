import { z } from 'zod';

export const customerReturnItemSchema = z.object({
  productId: z.string().trim().min(1, 'Product ID is required'),
  quantity: z.number().int().positive('Quantity must be a positive integer')
});

export const createCustomerReturnSchema = z.object({
  locationId: z.string().trim().min(1, 'Location ID is required'),
  notes: z.string().trim().optional().nullable(),
  items: z.array(customerReturnItemSchema).min(1, 'At least one item is required')
});

export const updateCustomerReturnSchema = z.object({
  locationId: z.string().trim().min(1).optional(),
  notes: z.string().trim().optional().nullable(),
  items: z.array(customerReturnItemSchema).min(1).optional()
});
