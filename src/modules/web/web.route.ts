import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { webController } from './web.controller.js';
import { createUploadMiddleware } from '../../common/utils/file-upload.js';
import { authenticate, authorizeRoles } from '../../common/middlewares/auth.middleware.js';
import { Role } from '@prisma/client';

const router = Router();

const upload = createUploadMiddleware({ maxFileSizeInMB: 5, maxFileCount: 2 });


router.get('/company-information/get', asyncHandler(webController.getCompanyInformation));

router.post(
    '/company-information/create',
    authenticate,
    authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN),
    upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'footerLogo', maxCount: 1 }]),
    asyncHandler(webController.createCompanyInformation)
);

router.patch(
    '/company-information/update',
    authenticate,
    authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN),
    upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'footerLogo', maxCount: 1 }]),
    asyncHandler(webController.updateCompanyInformation)
);

router.delete(
    '/company-information/delete',
    authenticate,
    authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN),
    asyncHandler(webController.deleteCompanyInformation)
);


router.get('/company-policy/get', asyncHandler(webController.getCompanyPolicy));

router.post(
    '/company-policy/create',
    authenticate,
    authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN),
    upload.fields([{ name: 'sizeChart', maxCount: 1 }]),
    asyncHandler(webController.createCompanyPolicy)
);

router.patch(
    '/company-policy/update',
    authenticate,
    authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN),
    upload.fields([{ name: 'sizeChart', maxCount: 1 }]),
    asyncHandler(webController.updateCompanyPolicy)
);

router.delete(
    '/company-policy/delete',
    authenticate,
    authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN),
    asyncHandler(webController.deleteCompanyPolicy)
);


router.get('/faq/get-all', asyncHandler(webController.getFaqs));
router.get('/faq/get/:id', asyncHandler(webController.getFaq));
router.post('/faq/create', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(webController.createFaq));
router.patch('/faq/update/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(webController.updateFaq));
router.delete('/faq/delete/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(webController.deleteFaq));


router.get('/social-media/get-all', asyncHandler(webController.getSocialMediaLinks));
router.get('/social-media/get/:id', asyncHandler(webController.getSocialMediaLink));
router.post('/social-media/create', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(webController.createSocialMediaLink));
router.patch('/social-media/update', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(webController.updateSocialMediaLink));
router.patch('/social-media/update/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(webController.updateSocialMediaLink));
router.delete('/social-media/delete', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(webController.deleteSocialMediaLink));
router.delete('/social-media/delete/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(webController.deleteSocialMediaLink));


router.get('/slider/get-all', asyncHandler(webController.getSliders));
router.get('/slider/get/:id', asyncHandler(webController.getSlider));
router.post('/slider/create', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), upload.any(), asyncHandler(webController.createSlider));
router.patch('/slider/reorder', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(webController.updateSlider));
router.patch('/slider/update/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), upload.any(), asyncHandler(webController.updateSlider));
router.delete('/slider/delete/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(webController.deleteSlider));


router.get('/testimonial/get-all', asyncHandler(webController.getTestimonials));
router.get('/testimonial/get/:id', asyncHandler(webController.getTestimonial));
router.post('/testimonial/create', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), upload.any(), asyncHandler(webController.createTestimonial));
router.patch('/testimonial/update/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), upload.any(), asyncHandler(webController.updateTestimonial));
router.delete('/testimonial/delete/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.ADMIN), asyncHandler(webController.deleteTestimonial));

export const webRoutes = router;
