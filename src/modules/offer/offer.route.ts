import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { offerController } from './offer.controller.js';

const router = Router();

router.get('/get-all-paginated', asyncHandler(offerController.getOffers));
router.get('/get-all', asyncHandler(offerController.getAllOffers));
router.get('/get-one/:id', asyncHandler(offerController.getOffer));
router.post('/create', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(offerController.createOffer));
router.patch('/bulk-update-status', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(offerController.bulkUpdateStatus));
router.patch('/update/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(offerController.updateOffer));
router.delete('/delete/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(offerController.deleteOffer));

export const offerRoutes = router;
