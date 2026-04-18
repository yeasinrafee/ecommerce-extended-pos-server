import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler.js";
import { getDashboardAnalytics } from "./dashboard.controller.js";
import { authenticate, authorizeRoles } from "../../common/middlewares/auth.middleware.js";
import { Role } from "@prisma/client";

const router = Router();

router.get(
  "/analytics",
  authenticate,
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(getDashboardAnalytics)
);

export const dashboardRoutes = router;
