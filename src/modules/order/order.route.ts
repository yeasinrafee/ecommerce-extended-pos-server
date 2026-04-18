import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler.js";
import { orderController } from "./order.controller.js";
import {
  authenticate,
  authorizeRoles,
} from "../../common/middlewares/auth.middleware.js";
import { Role } from "@prisma/client";

const router = Router();

router.post(
  "/create",
  authenticate,
  authorizeRoles(Role.CUSTOMER),
  asyncHandler(orderController.createOrder),
);
router.get(
  "/my-orders",
  authenticate,
  authorizeRoles(Role.CUSTOMER),
  asyncHandler(orderController.getOrdersByCustomer),
);
router.get(
  "/all",
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(orderController.getAllOrders),
);
router.get("/:id", authenticate, asyncHandler(orderController.getOrderById));
router.patch(
  "/:id/status",
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(orderController.updateOrderStatus),
);
router.patch(
  "/:id/cancel",
  authenticate,
  authorizeRoles(Role.CUSTOMER),
  asyncHandler(orderController.cancelOrder),
);

export const orderRoutes = router;
