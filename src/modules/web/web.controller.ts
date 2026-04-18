import { Request, Response } from 'express';
import { sendResponse } from '../../common/utils/send-response.js';
import { webService } from './web.service.js';
import { normalizeUploadedFiles, uploadMultipleFilesToCloudinary, deleteCloudinaryAsset, getPublicIdFromUrl } from '../../common/utils/file-upload.js';
import crypto from 'node:crypto';
import { AppError } from '../../common/errors/app-error.js';

const parseJsonField = <T,>(value: unknown, fallback: T): T => {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value !== 'string') return value as T;
    try { return JSON.parse(value) as T; } catch { return fallback; }
};

const getPayloadArray = (req: Request) => {
    if (req.body.data) {
         const parsed = parseJsonField(req.body.data, null);
         if (parsed !== null) return Array.isArray(parsed) ? parsed : [parsed];
    }
    if (Array.isArray(req.body)) return req.body;
    if (Object.keys(req.body).length > 0 && !req.body.data) return [req.body];
    return [];
};

const extractIds = (req: Request) => {
    const ids = (req.body as any)?.ids;
    if ((!ids || ids.length === 0) && req.params.id) return Array.isArray(req.params.id) ? req.params.id : [req.params.id];
    return Array.isArray(ids) ? ids : (ids ? [ids] : []);
};

// --- Company Information ---
const getCompanyInformation = async (req: Request, res: Response) => {
    const info = await webService.getCompanyInformation();
    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'Company information fetched',
        data: info
    });
};

const createCompanyInformation = async (req: Request, res: Response) => {
    const payload = req.body || {};
    let newlyUploadedLogoPublicId: string | null = null;
    let newlyUploadedFooterLogoPublicId: string | null = null;
    let logoUrl: string | null | undefined = undefined;
    let footerLogoUrl: string | null | undefined = undefined;

    try {
        const files = normalizeUploadedFiles(req.files);
        if (files.length > 0) {
            const logoFile = (req.files as any)?.logo?.[0];
            const footerLogoFile = (req.files as any)?.footerLogo?.[0];

            if (logoFile) {
                const generatedId = crypto.randomUUID();
                const uploadedFiles = await uploadMultipleFilesToCloudinary([logoFile], {
                    projectFolder: 'company-information',
                    entityId: generatedId,
                    fileNamePrefix: 'logo'
                });
                const uploaded = uploadedFiles[0];
                logoUrl = uploaded?.secureUrl ?? null;
                newlyUploadedLogoPublicId = uploaded?.publicId ?? null;
            }

            if (footerLogoFile) {
                const generatedId = crypto.randomUUID();
                const uploadedFiles = await uploadMultipleFilesToCloudinary([footerLogoFile], {
                    projectFolder: 'company-information',
                    entityId: generatedId,
                    fileNamePrefix: 'footerLogo'
                });
                const uploaded = uploadedFiles[0];
                footerLogoUrl = uploaded?.secureUrl ?? null;
                newlyUploadedFooterLogoPublicId = uploaded?.publicId ?? null;
            }
        }

        if (logoUrl !== undefined) {
            payload.logo = logoUrl;
        }
        if (footerLogoUrl !== undefined) {
            payload.footerLogo = footerLogoUrl;
        }

        const data = await webService.createOrUpdateCompanyInformation(payload, newlyUploadedLogoPublicId, newlyUploadedFooterLogoPublicId);

        sendResponse({
            res,
            statusCode: 201,
            success: true,
            message: 'Company information created/updated',
            data
        });
    } catch (err) {
        if (newlyUploadedLogoPublicId) {
            try {
                await deleteCloudinaryAsset(newlyUploadedLogoPublicId);
            } catch (cleanupErr) {
                console.warn('Failed to cleanup uploaded logo image', { newlyUploadedLogoPublicId, err: (cleanupErr as Error).message });
            }
        }
        if (newlyUploadedFooterLogoPublicId) {
            try {
                await deleteCloudinaryAsset(newlyUploadedFooterLogoPublicId);
            } catch (cleanupErr) {
                console.warn('Failed to cleanup uploaded footer logo image', { newlyUploadedFooterLogoPublicId, err: (cleanupErr as Error).message });
            }
        }
        throw err;
    }
};

const updateCompanyInformation = async (req: Request, res: Response) => {
    const payload = req.body || {};
    let newlyUploadedLogoPublicId: string | null = null;
    let newlyUploadedFooterLogoPublicId: string | null = null;

    try {
        const files = normalizeUploadedFiles(req.files);
        if (files.length > 0) {
            const logoFile = (req.files as any)?.logo?.[0];
            const footerLogoFile = (req.files as any)?.footerLogo?.[0];

            if (logoFile) {
                const generatedId = crypto.randomUUID();
                const uploadedFiles = await uploadMultipleFilesToCloudinary([logoFile], {
                    projectFolder: 'company-information',
                    entityId: generatedId,
                    fileNamePrefix: 'logo'
                });
                const uploaded = uploadedFiles[0];
                payload.logo = uploaded?.secureUrl ?? null;
                newlyUploadedLogoPublicId = uploaded?.publicId ?? null;
            }

            if (footerLogoFile) {
                const generatedId = crypto.randomUUID();
                const uploadedFiles = await uploadMultipleFilesToCloudinary([footerLogoFile], {
                    projectFolder: 'company-information',
                    entityId: generatedId,
                    fileNamePrefix: 'footerLogo'
                });
                const uploaded = uploadedFiles[0];
                payload.footerLogo = uploaded?.secureUrl ?? null;
                newlyUploadedFooterLogoPublicId = uploaded?.publicId ?? null;
            }
        }

        const data = await webService.updateCompanyInformation(payload, newlyUploadedLogoPublicId, newlyUploadedFooterLogoPublicId);

        sendResponse({
            res,
            statusCode: 200,
            success: true,
            message: 'Company information updated',
            data
        });
    } catch (err) {
        if (newlyUploadedLogoPublicId) {
            try {
                await deleteCloudinaryAsset(newlyUploadedLogoPublicId);
            } catch (cleanupErr) {
                console.warn('Failed to cleanup uploaded logo image after update failure', { newlyUploadedLogoPublicId });
            }
        }
        if (newlyUploadedFooterLogoPublicId) {
            try {
                await deleteCloudinaryAsset(newlyUploadedFooterLogoPublicId);
            } catch (cleanupErr) {
                console.warn('Failed to cleanup uploaded footer logo image after update failure', { newlyUploadedFooterLogoPublicId });
            }
        }
        throw err;
    }
};

const deleteCompanyInformation = async (req: Request, res: Response) => {
    await webService.deleteCompanyInformation();
    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'Company information deleted',
        data: null
    });
};

// --- Company Policy ---
const getCompanyPolicy = async (req: Request, res: Response) => {
    const policy = await webService.getCompanyPolicy();
    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'Company policy fetched',
        data: policy
    });
};

const createCompanyPolicy = async (req: Request, res: Response) => {
    const payload = req.body || {};
    let newlyUploadedPublicId: string | null = null;
    let sizeChartUrl: string | null | undefined = undefined;

    try {
        const files = normalizeUploadedFiles(req.files);
        if (files.length > 0) {
            const generatedId = crypto.randomUUID();
            const uploadedFiles = await uploadMultipleFilesToCloudinary(files, {
                projectFolder: 'company-policy',
                entityId: generatedId,
                fileNamePrefix: 'size-chart'
            });

            const uploaded = uploadedFiles[0];
            sizeChartUrl = uploaded?.secureUrl ?? null;
            newlyUploadedPublicId = uploaded?.publicId ?? null;
        }

        if (sizeChartUrl !== undefined) {
            payload.sizeChart = sizeChartUrl;
        }

        const data = await webService.createOrUpdateCompanyPolicy(payload, newlyUploadedPublicId);

        sendResponse({
            res,
            statusCode: 201,
            success: true,
            message: 'Company policy created/updated',
            data
        });
    } catch (err) {
        if (newlyUploadedPublicId) {
            try {
                await deleteCloudinaryAsset(newlyUploadedPublicId);
            } catch (cleanupErr) {
                console.warn('Failed to cleanup uploaded size chart image', { newlyUploadedPublicId, err: (cleanupErr as Error).message });
            }
        }
        throw err;
    }
};

const updateCompanyPolicy = async (req: Request, res: Response) => {
    const payload = req.body || {};
    let newlyUploadedPublicId: string | null = null;

    try {
        const files = normalizeUploadedFiles(req.files);
        if (files.length > 0) {
            const generatedId = crypto.randomUUID();
            const uploadedFiles = await uploadMultipleFilesToCloudinary(files, {
                projectFolder: 'company-policy',
                entityId: generatedId,
                fileNamePrefix: 'size-chart'
            });

            const uploaded = uploadedFiles[0];
            payload.sizeChart = uploaded?.secureUrl ?? null;
            newlyUploadedPublicId = uploaded?.publicId ?? null;
        }

        const data = await webService.updateCompanyPolicy(payload, newlyUploadedPublicId);

        sendResponse({
            res,
            statusCode: 200,
            success: true,
            message: 'Company policy updated',
            data
        });
    } catch (err) {
        if (newlyUploadedPublicId) {
            try {
                await deleteCloudinaryAsset(newlyUploadedPublicId);
            } catch (cleanupErr) {
                console.warn('Failed to cleanup uploaded size chart image after update failure', { newlyUploadedPublicId });
            }
        }
        throw err;
    }
};

const deleteCompanyPolicy = async (req: Request, res: Response) => {
    await webService.deleteCompanyPolicy();
    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'Company policy deleted',
        data: null
    });
};

// --- Faq ---
const getFaqs = async (req: Request, res: Response) => {
    const faqs = await webService.getFaqs();
    sendResponse({ res, statusCode: 200, success: true, message: 'Faqs fetched', data: faqs });
};

const getFaq = async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const faq = await webService.getFaq(id);
    sendResponse({ res, statusCode: 200, success: true, message: 'Faq fetched', data: faq });
};

const createFaq = async (req: Request, res: Response) => {
    const arr = getPayloadArray(req);
    if(!arr.length) throw new AppError(400, 'Payload missing', []);
    const data = await webService.createFaq(arr.length === 1 ? arr[0] : arr);
    sendResponse({ res, statusCode: 201, success: true, message: 'Faq created', data });
};

const updateFaq = async (req: Request, res: Response) => {
    const arr = getPayloadArray(req);
    if(!arr.length) throw new AppError(400, 'Payload missing', []);
    if(req.params.id && arr.length === 1 && !arr[0].id) arr[0].id = req.params.id;
    const data = await webService.updateFaq(arr.length === 1 ? arr[0] : arr);
    sendResponse({ res, statusCode: 200, success: true, message: 'Faq updated', data });
};

const deleteFaq = async (req: Request, res: Response) => {
    const ids = extractIds(req);
    if (!ids.length) throw new AppError(400, 'ID required', []);
    await webService.deleteFaq(ids);
    sendResponse({ res, statusCode: 200, success: true, message: 'Faq deleted', data: null });
};

// --- SocialMedia ---
const getSocialMediaLinks = async (req: Request, res: Response) => {
    const links = await webService.getSocialMediaLinks();
    sendResponse({ res, statusCode: 200, success: true, message: 'Social Media links fetched', data: links });
};

const getSocialMediaLink = async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const link = await webService.getSocialMediaLink(id);
    sendResponse({ res, statusCode: 200, success: true, message: 'Social Media link fetched', data: link });
};

const createSocialMediaLink = async (req: Request, res: Response) => {
    const arr = getPayloadArray(req);
    if(!arr.length) throw new AppError(400, 'Payload missing', []);
    const data = await webService.createSocialMediaLink(arr.length === 1 ? arr[0] : arr);
    sendResponse({ res, statusCode: 201, success: true, message: 'Social Media link created', data });
};

const updateSocialMediaLink = async (req: Request, res: Response) => {
    const arr = getPayloadArray(req);
    if(!arr.length) throw new AppError(400, 'Payload missing', []);
    if(req.params.id && arr.length === 1 && !arr[0].id) arr[0].id = req.params.id;
    const data = await webService.updateSocialMediaLink(arr.length === 1 ? arr[0] : arr);
    sendResponse({ res, statusCode: 200, success: true, message: 'Social Media link updated', data });
};

const deleteSocialMediaLink = async (req: Request, res: Response) => {
    const ids = extractIds(req);
    if (!ids.length) throw new AppError(400, 'ID required', []);
    await webService.deleteSocialMediaLink(ids);
    sendResponse({ res, statusCode: 200, success: true, message: 'Social Media link deleted', data: null });
};

// --- Slider & Testimonial Utilities ---
const processFilesAndPayload = async (req: Request, folderStr: string, isCreate: boolean, isMandatoryImage: boolean, existingRecords?: any[]) => {
    const files = normalizeUploadedFiles(req.files);
    let uploadedFiles: any[] = [];
    if (files.length > 0) {
        uploadedFiles = await uploadMultipleFilesToCloudinary(files, { projectFolder: folderStr, entityId: crypto.randomUUID(), fileNamePrefix: folderStr });
    }
    let arr = getPayloadArray(req);
    
    const urls = uploadedFiles.map(u => u.secureUrl);
    const oldImagesToDelete: string[] = [];
    
    if (isCreate && arr.length === 0 && urls.length > 0) {
        arr = urls.map(url => ({ image: url }));
    } else {
        let fileIdx = 0;
        for (const item of arr) {
            let newImageUrl = null;
            if (typeof item.fileIndex === 'number' && uploadedFiles[item.fileIndex]) {
                newImageUrl = uploadedFiles[item.fileIndex].secureUrl;
            } else if (files.length === 1 && arr.length === 1) {
                newImageUrl = uploadedFiles[0].secureUrl;
            } else if (isCreate && fileIdx < urls.length) {
                newImageUrl = urls[fileIdx];
                fileIdx++;
            }

            if (newImageUrl) {
                item.image = newImageUrl;
                if (!isCreate && existingRecords) {
                    const existing = existingRecords.find(r => r.id === item.id);
                    if (existing && existing.image) {
                        const pid = getPublicIdFromUrl(existing.image);
                        if (pid) oldImagesToDelete.push(pid);
                    }
                }
            }

            if (isMandatoryImage && !item.image && isCreate) {
                throw new AppError(400, 'Image is required', [{ message: 'Missing image', code: 'MISSING_IMAGE' }]);
            }
        }
    }
    
    if (arr.length === 0 && !isCreate) throw new AppError(400, 'Payload required', []);
    
    return { arr, uploadedIds: uploadedFiles.map(u => u.publicId), oldImagesToDelete };
};

// --- Slider ---
const getSliders = async (req: Request, res: Response) => {
    const items = await webService.getSliders();
    sendResponse({ res, statusCode: 200, success: true, message: 'Sliders fetched', data: items });
};

const getSlider = async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const item = await webService.getSlider(id);
    sendResponse({ res, statusCode: 200, success: true, message: 'Slider fetched', data: item });
};

const createSlider = async (req: Request, res: Response) => {
    let newIds: string[] = [];
    try {
        const { arr, uploadedIds } = await processFilesAndPayload(req, 'sliders', true, true);
        newIds = uploadedIds;
        const data = await webService.createSlider(arr.length === 1 ? arr[0] : arr);
        sendResponse({ res, statusCode: 201, success: true, message: 'Slider created', data });
    } catch(err) {
        for (const pid of newIds) await deleteCloudinaryAsset(pid).catch(() => {});
        throw err;
    }
};

const updateSlider = async (req: Request, res: Response) => {
    let newIds: string[] = [];
    try {
        let initialArr = getPayloadArray(req);
        if(req.params.id && initialArr.length === 1 && !initialArr[0].id) initialArr[0].id = req.params.id;
        const existing = initialArr.length ? await webService.getSlidersByIds(initialArr.map(i => i.id).filter(Boolean)) : [];
        const { arr, uploadedIds, oldImagesToDelete } = await processFilesAndPayload(req, 'sliders', false, false, existing);
        newIds = uploadedIds;
        const data = await webService.updateSlider(arr.length === 1 ? arr[0] : arr);
        for (const pid of oldImagesToDelete) await deleteCloudinaryAsset(pid).catch(() => {});
        
        sendResponse({ res, statusCode: 200, success: true, message: 'Slider updated', data });
    } catch(err) {
        for (const pid of newIds) await deleteCloudinaryAsset(pid).catch(() => {});
        throw err;
    }
};

const deleteSlider = async (req: Request, res: Response) => {
    const ids = extractIds(req);
    if (!ids.length) throw new AppError(400, 'ID required', []);
    await webService.deleteSlider(ids);
    sendResponse({ res, statusCode: 200, success: true, message: 'Slider deleted', data: null });
};

// --- Testimonial ---
const getTestimonials = async (req: Request, res: Response) => {
    const items = await webService.getTestimonials();
    sendResponse({ res, statusCode: 200, success: true, message: 'Testimonials fetched', data: items });
};

const getTestimonial = async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const item = await webService.getTestimonial(id);
    sendResponse({ res, statusCode: 200, success: true, message: 'Testimonial fetched', data: item });
};

const createTestimonial = async (req: Request, res: Response) => {
    let newIds: string[] = [];
    try {
        const { arr, uploadedIds } = await processFilesAndPayload(req, 'testimonials', true, false);
        newIds = uploadedIds;
        arr.forEach(a => { if(a.rating !== undefined) a.rating = Number(a.rating); });
        const data = await webService.createTestimonial(arr.length === 1 ? arr[0] : arr);
        sendResponse({ res, statusCode: 201, success: true, message: 'Testimonial created', data });
    } catch(err) {
        for (const pid of newIds) await deleteCloudinaryAsset(pid).catch(() => {});
        throw err;
    }
};

const updateTestimonial = async (req: Request, res: Response) => {
    let newIds: string[] = [];
    try {
        let initialArr = getPayloadArray(req);
        if(req.params.id && initialArr.length === 1 && !initialArr[0].id) initialArr[0].id = req.params.id;
        const existing = initialArr.length ? await webService.getTestimonialsByIds(initialArr.map(i => i.id).filter(Boolean)) : [];
        const { arr, uploadedIds, oldImagesToDelete } = await processFilesAndPayload(req, 'testimonials', false, false, existing);
        newIds = uploadedIds;
        
        arr.forEach(a => { if(a.rating !== undefined) a.rating = Number(a.rating); });
        const data = await webService.updateTestimonial(arr.length === 1 ? arr[0] : arr);
        for (const pid of oldImagesToDelete) await deleteCloudinaryAsset(pid).catch(() => {});
        
        sendResponse({ res, statusCode: 200, success: true, message: 'Testimonial updated', data });
    } catch(err) {
        for (const pid of newIds) await deleteCloudinaryAsset(pid).catch(() => {});
        throw err;
    }
};

const deleteTestimonial = async (req: Request, res: Response) => {
    const ids = extractIds(req);
    if (!ids.length) throw new AppError(400, 'ID required', []);
    await webService.deleteTestimonial(ids);
    sendResponse({ res, statusCode: 200, success: true, message: 'Testimonial deleted', data: null });
};

export const webController = {
    getCompanyInformation,
    createCompanyInformation,
    updateCompanyInformation,
    deleteCompanyInformation,
    getCompanyPolicy,
    createCompanyPolicy,
    updateCompanyPolicy,
    deleteCompanyPolicy,
    getFaqs, getFaq, createFaq, updateFaq, deleteFaq,
    getSocialMediaLinks, getSocialMediaLink, createSocialMediaLink, updateSocialMediaLink, deleteSocialMediaLink,
    getSliders, getSlider, createSlider, updateSlider, deleteSlider,
    getTestimonials, getTestimonial, createTestimonial, updateTestimonial, deleteTestimonial
};
