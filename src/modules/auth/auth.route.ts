import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler.js";
import { authController } from "./auth.controller.js";
import { createUploadMiddleware } from "../../common/utils/file-upload.js";
import { Role } from "@prisma/client";
import {
  authenticate,
  authorizeRoles,
} from "../../common/middlewares/auth.middleware.js";

const router = Router();
const upload = createUploadMiddleware({
  maxFileSizeInMB: 5,
  maxFileCount: 1,
});

router.post(
  "/admin/create",
  authenticate,
  authorizeRoles(Role.SUPER_ADMIN),
  upload.fields([{ name: "image", maxCount: 1 }]),
  asyncHandler(authController.createAdmin),
);

router.post("/register", asyncHandler(authController.registerCustomer));

router.get('/customer/me', authenticate, authorizeRoles(Role.CUSTOMER), asyncHandler(authController.getCustomerMe));

router.post("/login", asyncHandler(authController.login));

router.post("/refresh", asyncHandler(authController.refreshToken));

router.post("/otp/verify", asyncHandler(authController.verifyOtp));
router.post("/otp/send", asyncHandler(authController.sendOtp));

router.post("/forgot-password/send-otp", asyncHandler(authController.forgotPasswordSendOtp));
router.post("/forgot-password/verify-otp", asyncHandler(authController.forgotPasswordVerifyOtp));
router.post("/forgot-password/reset", asyncHandler(authController.resetPassword));

router.post("/logout", asyncHandler(authController.logout));

export const authRoutes = router;
