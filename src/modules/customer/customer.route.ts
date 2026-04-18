import { Router } from "express";
import { Role } from "@prisma/client";
import { asyncHandler } from "../../common/utils/async-handler.js";
import { authenticate, authorizeRoles } from "../../common/middlewares/auth.middleware.js";
import { createUploadMiddleware } from "../../common/utils/file-upload.js";
import { customerController } from "./customer.controller.js";

const router = Router();

const upload = createUploadMiddleware({ maxFileSizeInMB: 5, maxFileCount: 1 });

router.get("/", authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), asyncHandler(customerController.getCustomers));
router.patch(
	"/me",
	authenticate,
	authorizeRoles(Role.CUSTOMER),
	upload.fields([{ name: 'image', maxCount: 1 }]),
	asyncHandler(customerController.updateSelf)
);
router.get(
	"/me/addresses",
	authenticate,
	authorizeRoles(Role.CUSTOMER),
	asyncHandler(customerController.getMyAddresses)
);
router.delete(
	"/me/addresses/:id",
	authenticate,
	authorizeRoles(Role.CUSTOMER),
	asyncHandler(customerController.deleteMyAddress)
);
router.patch(
	"/bulk-status",
	authenticate,
	authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
	asyncHandler(customerController.bulkUpdateStatus)
);

export const customerRoutes = router;
