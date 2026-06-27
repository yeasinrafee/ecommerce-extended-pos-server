import { z } from 'zod';

export const createGoodsReceiveItemSchema = z.object({
  productId: z.string().trim().min(1, 'Product ID is required'),
  quantityReceived: z.number().int().positive('Quantity received must be a positive integer'),
  quantityAccepted: z.number().int().nonnegative('Quantity accepted cannot be negative'),
  quantityRejected: z.number().int().nonnegative('Quantity rejected cannot be negative').default(0),
  unitPrice: z.number().nonnegative('Unit price cannot be negative'),
  batchNumber: z.string().trim().optional().nullable(),
  expiryDate: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? null : val),
    z.coerce.date().nullable().optional()
  )
}).refine(data => data.quantityAccepted + data.quantityRejected === data.quantityReceived, {
  message: 'Accepted and rejected quantity sum must equal received quantity',
  path: ['quantityAccepted']
});

export const createGoodsReceiveSchema = z.object({
  purchaseOrderId: z.string().trim().optional().nullable(),
  supplierId: z.number().int('Supplier ID must be an integer'),
  locationId: z.string().trim().min(1, 'Location ID is required'),
  billNumber: z.string().trim().optional().nullable(),
  billAmount: z.number().nonnegative().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  items: z.array(createGoodsReceiveItemSchema).min(1, 'At least one receive item is required')
});
