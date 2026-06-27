import { z } from 'zod';
import { LocationType, Status } from '@prisma/client';

export const createLocationSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  code: z.string().trim().min(2, 'Code must be at least 2 characters').toUpperCase(),
  type: z.nativeEnum(LocationType).default(LocationType.STORE),
  address: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  status: z.nativeEnum(Status).default(Status.ACTIVE)
});

export const updateLocationSchema = createLocationSchema.partial();

export const upsertLowStockConfigSchema = z.object({
  productId: z.string().trim().min(1, 'Product ID is required'),
  locationId: z.string().trim().optional().nullable(), // Null means global config
  minimumQuantity: z.number().int().nonnegative('Minimum quantity cannot be negative'),
  reorderQuantity: z.number().int().positive('Reorder quantity must be positive')
});
