import { Router } from "express";
import { authenticate, authorizeRoles } from "../../common/middlewares/auth.middleware.js";
import { Role } from "@prisma/client";
import { getNotifications, markNotificationsSeen } from "./notification.controller.js";

const router = Router();

router.get("/all", authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), getNotifications);
router.post("/seen", authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), markNotificationsSeen);

export const notificationRoutes = router;
