import { z } from 'zod';
import { StockAdjustmentStatus } from '@prisma/client';

export const adjustmentItemSchema = z.object({
  productId: z.string().trim().min(1, 'Product ID is required'),
  quantityChanged: z.number().int().refine(val => val !== 0, {
    message: 'Quantity changed cannot be zero'
  }),
  reason: z.string().trim().optional().nullable()
});

export const createStockAdjustmentSchema = z.object({
  locationId: z.string().trim().min(1, 'Location ID is required'),
  reason: z.string().trim().optional().nullable(),
  items: z.array(adjustmentItemSchema).min(1, 'At least one item is required')
});

export const updateStockAdjustmentSchema = z.object({
  locationId: z.string().trim().min(1).optional(),
  reason: z.string().trim().optional().nullable(),
  items: z.array(adjustmentItemSchema).min(1).optional()
});
