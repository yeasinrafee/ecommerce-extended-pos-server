import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { posController } from './pos.controller.js';

const router = Router();

router.get('/get-products', asyncHandler(posController.getProducts));

export const posRoutes = router;