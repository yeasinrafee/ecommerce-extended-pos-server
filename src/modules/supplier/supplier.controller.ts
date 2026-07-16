import crypto from 'node:crypto';
import { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { sendResponse } from '../../common/utils/send-response.js';
import { supplierService } from './supplier.service.js';
import { Status } from '@prisma/client';
import { normalizeUploadedFiles, uploadMultipleFilesToCloudinary, deleteCloudinaryAsset } from '../../common/utils/file-upload.js';
import {
  createSupplierSchema,
  updateSupplierSchema,
  supplierPaymentSchema,
  bulkUpdateSupplierStatusSchema
} from './supplier.validator.js';

const parseSupplierId = (value: string | string[] | undefined) => {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);

  if (!Number.isInteger(parsed)) {
    throw new AppError(400, 'Invalid supplier id', [
      { message: 'Supplier id must be a valid number', code: 'INVALID_ID' }
    ]);
  }

  return parsed;
};

const createSupplier = async (req: Request, res: Response) => {
  const payload = createSupplierSchema.parse(req.body || {});
  let newlyUploadedPublicId: string | null = null;
  const userId = req.user?.id;

  try {
    const files = normalizeUploadedFiles(req.files);
    if (files.length > 0) {
      const uploadedFiles = await uploadMultipleFilesToCloudinary(files, {
        projectFolder: 'suppliers',
        entityId: crypto.randomUUID(),
        fileNamePrefix: 'supplier'
      });

      const uploaded = uploadedFiles[0];
      payload.image = uploaded?.secureUrl ?? null;
      newlyUploadedPublicId = uploaded?.publicId ?? null;
    }

    const created = await supplierService.createSupplier(payload, userId);

    sendResponse({
      res,
      statusCode: 201,
      success: true,
      message: 'Supplier created',
      data: created
    });
  } catch (err) {
    if (newlyUploadedPublicId) {
      try {
        await deleteCloudinaryAsset(newlyUploadedPublicId);
      } catch (_deleteErr) {}
    }
    throw err;
  }
};

const updateSupplier = async (req: Request, res: Response) => {
  const id = parseSupplierId(req.params.id);
  const payload = updateSupplierSchema.parse(req.body || {});
  let newlyUploadedPublicId: string | null = null;
  const userId = req.user?.id;

  try {
    const files = normalizeUploadedFiles(req.files);
    if (files.length > 0) {
      const uploadedFiles = await uploadMultipleFilesToCloudinary(files, {
        projectFolder: 'suppliers',
        entityId: String(id),
        fileNamePrefix: 'supplier'
      });

      const uploaded = uploadedFiles[0];
      payload.image = uploaded?.secureUrl ?? null;
      newlyUploadedPublicId = uploaded?.publicId ?? null;
    }

    const updated = await supplierService.updateSupplier(id, payload, newlyUploadedPublicId, userId);

    sendResponse({
      res,
      statusCode: 200,
      success: true,
      message: 'Supplier updated',
      data: updated
    });
  } catch (err) {
    if (newlyUploadedPublicId) {
      try {
        await deleteCloudinaryAsset(newlyUploadedPublicId);
      } catch (_deleteErr) {}
    }
    throw err;
  }
};

const getSuppliers = async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const searchTerm = typeof req.query.searchTerm === 'string' ? req.query.searchTerm : undefined;
  const status = req.query.status as Status | undefined;

  const result = await supplierService.getSuppliers({ page, limit, searchTerm, status });

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: 'Suppliers fetched',
    data: result.data,
    meta: result.meta
  });
};

const getAllSuppliers = async (_req: Request, res: Response) => {
  const suppliers = await supplierService.getAllSuppliers();

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: 'All suppliers fetched',
    data: suppliers
  });
};

const getSupplier = async (req: Request, res: Response) => {
  const id = parseSupplierId(req.params.id);
  const supplier = await supplierService.getSupplierById(id);

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: 'Supplier fetched',
    data: supplier
  });
};

const deleteSupplier = async (req: Request, res: Response) => {
  const id = parseSupplierId(req.params.id);
  await supplierService.deleteSupplier(id);

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: 'Supplier deleted',
    data: null
  });
};

const bulkUpdateStatus = async (req: Request, res: Response) => {
  const parsed = bulkUpdateSupplierStatusSchema.parse(req.body);
  const count = await supplierService.bulkUpdateStatus(parsed.ids, parsed.status);

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: 'Statuses updated',
    data: { updated: count }
  });
};

const getSupplierPurchases = async (req: Request, res: Response) => {
  const supplierId = parseSupplierId(req.params.id);
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);

  const result = await supplierService.getSupplierPurchases(supplierId, { page, limit });

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: 'Supplier purchases fetched',
    data: result.data,
    meta: result.meta
  });
};

const getSupplierPayments = async (req: Request, res: Response) => {
  const supplierId = parseSupplierId(req.params.id);
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);

  const result = await supplierService.getSupplierPayments(supplierId, { page, limit });

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: 'Supplier payments fetched',
    data: result.data,
    meta: result.meta
  });
};

const createSupplierPayment = async (req: Request, res: Response) => {
  const supplierId = parseSupplierId(req.params.id);
  const payload = supplierPaymentSchema.parse(req.body);
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError(401, 'Authentication required');
  }

  const payment = await supplierService.createSupplierPayment(supplierId, payload, userId);

  sendResponse({
    res,
    statusCode: 201,
    success: true,
    message: 'Payment recorded successfully',
    data: payment
  });
};

const getDueSuppliers = async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);

  const result = await supplierService.getDueSuppliers({ page, limit });

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: 'Due suppliers fetched',
    data: result.data,
    meta: result.meta
  });
};

export const supplierController = {
  createSupplier,
  updateSupplier,
  getSuppliers,
  getAllSuppliers,
  getSupplier,
  deleteSupplier,
  bulkUpdateStatus,
  getSupplierPurchases,
  getSupplierPayments,
  createSupplierPayment,
  getDueSuppliers
};