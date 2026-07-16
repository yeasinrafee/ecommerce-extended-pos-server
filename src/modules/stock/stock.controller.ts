import { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { sendResponse } from "../../common/utils/send-response.js";
import { stockService } from "./stock.service.js";
import {
  createLocationSchema,
  updateLocationSchema,
  upsertLowStockConfigSchema,
} from "./stock.validator.js";
import {
  DamageReason,
  StockMovementType,
  StockTransferStatus,
} from "@prisma/client";

// Location Controller Handlers
const createLocation = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const payload = createLocationSchema.parse(req.body);

  const data = await stockService.createLocation(payload, userId);

  sendResponse({
    res,
    statusCode: 201,
    success: true,
    message: "Location created successfully",
    data,
  });
};

const updateLocation = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const id = req.params.id as string;
  const payload = updateLocationSchema.parse(req.body);

  const data = await stockService.updateLocation(id, payload, userId);

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: "Location updated successfully",
    data,
  });
};

const deleteLocation = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await stockService.deleteLocation(id);

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: "Location deleted successfully",
    data: null,
  });
};

const getLocations = async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const searchTerm =
    typeof req.query.searchTerm === "string" ? req.query.searchTerm : undefined;

  const result = await stockService.getLocations({ page, limit, searchTerm });

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: "Locations fetched successfully",
    data: result.data,
    meta: result.meta,
  });
};

const getAllLocations = async (_req: Request, res: Response) => {
  const data = await stockService.getAllLocations();

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: "All locations fetched successfully",
    data,
  });
};

const getLocation = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const data = await stockService.getLocationById(id);

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: "Location fetched successfully",
    data,
  });
};

// Stock levels Handlers
const getStocks = async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const productId =
    typeof req.query.productId === "string" ? req.query.productId : undefined;
  const locationId =
    typeof req.query.locationId === "string" ? req.query.locationId : undefined;
  const searchTerm =
    typeof req.query.searchTerm === "string" ? req.query.searchTerm : undefined;

  const result = await stockService.getStocks({
    page,
    limit,
    productId,
    locationId,
    searchTerm,
  });

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: "Stocks fetched successfully",
    data: result.data,
    meta: result.meta,
  });
};

const getStock = async (req: Request, res: Response) => {
  const productId = req.params.productId as string;
  const locationId = req.params.locationId as string;
  if (!productId || !locationId) {
    throw new AppError(400, "productId and locationId are required");
  }

  const data = await stockService.getStockByProductAndLocation(
    productId,
    locationId,
  );

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: "Stock details fetched successfully",
    data,
  });
};

// Low Stock Alert Configurations
const upsertLowStockConfig = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, "Unauthorized");

  const payload = upsertLowStockConfigSchema.parse(req.body);
  const data = await stockService.upsertLowStockConfig(payload, userId);

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: "Low stock safety threshold configured successfully",
    data,
  });
};

const getLowStockAlerts = async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const locationId =
    typeof req.query.locationId === "string" ? req.query.locationId : undefined;

  const result = await stockService.getLowStockAlerts({
    page,
    limit,
    locationId,
  });

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: "Low stock active alerts fetched successfully",
    data: result.data,
    meta: result.meta,
  });
};

const getReorderSuggestions = async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const locationId =
    typeof req.query.locationId === "string" ? req.query.locationId : undefined;

  const result = await stockService.getReorderSuggestions({
    page,
    limit,
    locationId,
  });

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: "Reorder suggestions fetched successfully",
    data: result.data,
    meta: result.meta,
  });
};

// Reports Controllers
const getActivityReport = async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
  const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;
  const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined;
  const productId = typeof req.query.productId === 'string' ? req.query.productId : undefined;
  const movementType = typeof req.query.movementType === 'string' ? req.query.movementType : undefined;
  const searchTerm = typeof req.query.searchTerm === 'string' ? req.query.searchTerm : undefined;

  const result = await stockService.getActivityReport({
    startDate, endDate, locationId, productId, movementType, searchTerm, page, limit,
  });

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: 'Activity report generated',
    data: result.data,
    meta: { ...result.meta, ...result.summary } as any,
  });
};

const getCurrentStockReport = async (req: Request, res: Response) => {
  const locationId =
    typeof req.query.locationId === "string" ? req.query.locationId : undefined;
  const data = await stockService.getCurrentStockReport(locationId);

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: "Current stock report generated",
    data,
  });
};

const getMovementReport = async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const startDate =
    typeof req.query.startDate === "string" ? req.query.startDate : undefined;
  const endDate =
    typeof req.query.endDate === "string" ? req.query.endDate : undefined;
  const locationId =
    typeof req.query.locationId === "string" ? req.query.locationId : undefined;
  const productId =
    typeof req.query.productId === "string" ? req.query.productId : undefined;
  const movementType = req.query.movementType as StockMovementType | undefined;

  const result = await stockService.getMovementReport({
    startDate,
    endDate,
    locationId,
    productId,
    movementType,
    page,
    limit,
  });

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: "Stock movements report generated",
    data: result.data,
    meta: result.meta,
  });
};

const getTransferReport = async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const startDate =
    typeof req.query.startDate === "string" ? req.query.startDate : undefined;
  const endDate =
    typeof req.query.endDate === "string" ? req.query.endDate : undefined;
  const sourceLocationId =
    typeof req.query.sourceLocationId === "string"
      ? req.query.sourceLocationId
      : undefined;
  const destinationLocationId =
    typeof req.query.destinationLocationId === "string"
      ? req.query.destinationLocationId
      : undefined;
  const status = req.query.status as StockTransferStatus | undefined;

  const result = await stockService.getTransferReport({
    startDate,
    endDate,
    sourceLocationId,
    destinationLocationId,
    status,
    page,
    limit,
  });

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: "Stock transfers report generated",
    data: result.data,
    meta: result.meta,
  });
};

const getDamageReport = async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const startDate =
    typeof req.query.startDate === "string" ? req.query.startDate : undefined;
  const endDate =
    typeof req.query.endDate === "string" ? req.query.endDate : undefined;
  const locationId =
    typeof req.query.locationId === "string" ? req.query.locationId : undefined;
  const reason = req.query.reason as DamageReason | undefined;

  const result = await stockService.getDamageReport({
    startDate,
    endDate,
    locationId,
    reason,
    page,
    limit,
  });

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: "Damages report generated",
    data: result.data,
    meta: result.meta,
  });
};

const getAdjustmentReport = async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);
  const startDate =
    typeof req.query.startDate === "string" ? req.query.startDate : undefined;
  const endDate =
    typeof req.query.endDate === "string" ? req.query.endDate : undefined;
  const locationId =
    typeof req.query.locationId === "string" ? req.query.locationId : undefined;
  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;

  const result = await stockService.getAdjustmentReport({
    startDate,
    endDate,
    locationId,
    status,
    page,
    limit,
  });

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: "Stock adjustments report generated",
    data: result.data,
    meta: result.meta,
  });
};

const getInventoryDashboardSummary = async (_req: Request, res: Response) => {
  const data = await stockService.getInventoryDashboardSummary();

  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: "Inventory dashboard summary fetched successfully",
    data,
  });
};

export const stockController = {
  createLocation,
  updateLocation,
  deleteLocation,
  getLocations,
  getAllLocations,
  getLocation,
  getStocks,
  getStock,
  upsertLowStockConfig,
  getLowStockAlerts,
  getReorderSuggestions,
  getCurrentStockReport,
  getMovementReport,
  getTransferReport,
  getDamageReport,
  getAdjustmentReport,
  getInventoryDashboardSummary,
  getActivityReport,
};
