import { z } from 'zod';
import { DamageReason } from '@prisma/client';

export const damageItemSchema = z.object({
  productId: z.string().trim().min(1, 'Product ID is required'),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
  reason: z.nativeEnum(DamageReason).default(DamageReason.DAMAGED)
});

export const createDamageSchema = z.object({
  locationId: z.string().trim().min(1, 'Location ID is required'),
  notes: z.string().trim().optional().nullable(),
  items: z.array(damageItemSchema).min(1, 'At least one item is required')
});

export const updateDamageSchema = z.object({
  locationId: z.string().trim().min(1).optional(),
  notes: z.string().trim().optional().nullable(),
  items: z.array(damageItemSchema).min(1).optional()
});
