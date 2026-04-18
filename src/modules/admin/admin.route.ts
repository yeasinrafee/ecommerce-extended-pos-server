import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { adminController } from './admin.controller.js';
import { createUploadMiddleware } from '../../common/utils/file-upload.js';
import { Role } from "@prisma/client";
import { authenticate, authorizeRoles } from "../../common/middlewares/auth.middleware.js";

const router = Router();

const upload = createUploadMiddleware({ maxFileSizeInMB: 5, maxFileCount: 1 });

router.get('/profile', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(adminController.getProfile));
router.patch('/profile/update', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), upload.fields([{ name: 'image', maxCount: 1 }]), asyncHandler(adminController.updateProfile));

router.get('/get-all-paginated', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(adminController.getAdmins));
router.get('/get-all', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(adminController.getAllAdmins));
router.get('/get/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(adminController.getAdmin));
router.patch('/update/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), upload.fields([{ name: 'image', maxCount: 1 }]), asyncHandler(adminController.updateAdmin));
router.patch('/update-status', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(adminController.bulkUpdateStatus));
router.delete('/delete/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(adminController.deleteAdmin));

export const adminRoutes = router;
