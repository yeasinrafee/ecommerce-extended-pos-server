import { z } from 'zod';

export const createStockTransferItemSchema = z.object({
  productId: z.string().trim().min(1, 'Product ID is required'),
  quantity: z.number().int().positive('Quantity must be a positive integer')
});

export const createStockTransferSchema = z.object({
  sourceLocationId: z.string().trim().min(1, 'Source Location ID is required'),
  destinationLocationId: z.string().trim().min(1, 'Destination Location ID is required'),
  notes: z.string().trim().optional().nullable(),
  items: z.array(createStockTransferItemSchema).min(1, 'At least one item is required')
}).refine(data => data.sourceLocationId !== data.destinationLocationId, {
  message: 'Source and destination locations must be different',
  path: ['destinationLocationId']
});

export const updateStockTransferSchema = z.object({
  sourceLocationId: z.string().trim().min(1).optional(),
  destinationLocationId: z.string().trim().min(1).optional(),
  notes: z.string().trim().optional().nullable(),
  items: z.array(createStockTransferItemSchema).min(1).optional()
});

export const receiveStockTransferItemSchema = z.object({
  productId: z.string().trim().min(1, 'Product ID is required'),
  receivedQuantity: z.number().int().nonnegative('Received quantity cannot be negative')
});

export const receiveStockTransferSchema = z.object({
  notes: z.string().trim().optional().nullable(),
  items: z.array(receiveStockTransferItemSchema).min(1, 'At least one item must be received')
});
