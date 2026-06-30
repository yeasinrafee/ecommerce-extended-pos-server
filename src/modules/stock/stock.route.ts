import { Router } from "express";
import { Role } from "@prisma/client";
import { asyncHandler } from "../../common/utils/async-handler.js";
import {
  authenticate,
  authorizeRoles,
} from "../../common/middlewares/auth.middleware.js";
import { stockController } from "./stock.controller.js";

const router = Router();

// Location routes
router.get(
  "/locations/get-all-paginated",
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(stockController.getLocations),
);
router.get(
  "/locations/get-all",
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(stockController.getAllLocations),
);
router.get(
  "/locations/get/:id",
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(stockController.getLocation),
);
router.post(
  "/locations/create",
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(stockController.createLocation),
);
router.patch(
  "/locations/update/:id",
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(stockController.updateLocation),
);
router.delete(
  "/locations/delete/:id",
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(stockController.deleteLocation),
);

// Stock routes
router.get(
  "/get-all-paginated",
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(stockController.getStocks),
);
router.get(
  "/get/:productId/:locationId",
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(stockController.getStock),
);

// Reorder & Low Stock Alerts
router.post(
  "/low-stock-configs",
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(stockController.upsertLowStockConfig),
);
router.get(
  "/low-stock-alerts",
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(stockController.getLowStockAlerts),
);
router.get(
  "/reorder-suggestions",
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(stockController.getReorderSuggestions),
);

// Reports
router.get(
  "/reports/activity",
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(stockController.getActivityReport),
);
router.get(
  "/reports/current",
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(stockController.getCurrentStockReport),
);
router.get(
  "/reports/movements",
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(stockController.getMovementReport),
);
router.get(
  "/reports/transfers",
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(stockController.getTransferReport),
);
router.get(
  "/reports/damages",
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(stockController.getDamageReport),
);
router.get(
  "/reports/adjustments",
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(stockController.getAdjustmentReport),
);
router.get(
  "/reports/inventory-dashboard",
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(stockController.getInventoryDashboardSummary),
);

export const stockRoutes = router;
