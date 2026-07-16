import { z } from 'zod';
import { Status, PaymentMethod } from '@prisma/client';

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: z.string().trim().email('Invalid email address').optional().nullable(),
  phone: z.string().trim().min(5, 'Phone number must be at least 5 characters').optional().nullable(),
  address: z.string().trim().optional().nullable(),
  companyName: z.string().trim().optional().nullable(),
  image: z.string().trim().url('Invalid image URL').optional().nullable(),
  status: z.nativeEnum(Status).optional()
});

export const updateSupplierSchema = createSupplierSchema.partial();

export const supplierPaymentSchema = z.object({
  amount: z.number().positive('Payment amount must be greater than zero'),
  paymentMethod: z.nativeEnum(PaymentMethod),
  referenceNo: z.string().trim().optional().nullable(),
  note: z.string().trim().optional().nullable()
});

export const bulkUpdateSupplierStatusSchema = z.object({
  ids: z.array(z.number().int('ID must be an integer')).min(1, 'At least one supplier ID is required'),
  status: z.nativeEnum(Status)
});
