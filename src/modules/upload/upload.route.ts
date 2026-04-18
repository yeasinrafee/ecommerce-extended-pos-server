import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { createUploadMiddleware } from '../../common/utils/file-upload.js';
import { uploadController } from './upload.controller.js';
import { Role } from '@prisma/client';
import {
	authenticate,
	authorizeRoles,
} from '../../common/middlewares/auth.middleware.js';

const router = Router();

const upload = createUploadMiddleware({ maxFileSizeInMB: 5, maxFileCount: 1 });

router.post(
	'/images',
	authenticate,
	authorizeRoles(Role.SUPER_ADMIN),
	upload.fields([{ name: 'image', maxCount: 1 }]),
	asyncHandler(uploadController.uploadImage),
);
router.post(
	'/delete',
	authenticate,
	authorizeRoles(Role.SUPER_ADMIN),
	asyncHandler(uploadController.deleteImage),
);

export const uploadRoutes = router;
