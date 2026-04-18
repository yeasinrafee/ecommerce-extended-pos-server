import { Request, Response } from 'express';
import { sendResponse } from '../../common/utils/send-response.js';
import { productCategoryService } from './product-category.service.js';
import { normalizeUploadedFiles, uploadMultipleFilesToCloudinary, deleteCloudinaryAsset } from '../../common/utils/file-upload.js';
import crypto from 'node:crypto';

const createCategory = async (req: Request, res: Response) => {
    const { name, parentId } = req.body;

    let newlyUploadedPublicId: string | null = null;
    let imageUrl: string | null | undefined = undefined;

    try {
        const files = normalizeUploadedFiles(req.files);
        if (files.length > 0) {
            const generatedId = crypto.randomUUID();
            const uploadedFiles = await uploadMultipleFilesToCloudinary(files, {
                projectFolder: 'categories',
                entityId: generatedId,
                fileNamePrefix: 'category'
            });

            const uploaded = uploadedFiles[0];
            imageUrl = uploaded?.secureUrl ?? null;
            newlyUploadedPublicId = uploaded?.publicId ?? null;
        }

        const created = await productCategoryService.createCategory({ name, image: imageUrl ?? null, parentId: parentId ?? null });

        sendResponse({
            res,
            statusCode: 201,
            success: true,
            message: 'Category created',
            data: created
        });
        return;
    } catch (err) {
        if (newlyUploadedPublicId) {
            try {
                await deleteCloudinaryAsset(newlyUploadedPublicId);
            } catch (cleanupErr) {
                console.warn('Failed to cleanup uploaded category image after create failure', { newlyUploadedPublicId, err: (cleanupErr as Error).message });
            }
        }

        throw err;
    }
};

const updateCategory = async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const payload = req.body || {};
    let newlyUploadedPublicId: string | null = null;

    try {
        const files = normalizeUploadedFiles(req.files);

        if (files.length > 0) {
            const uploadedFiles = await uploadMultipleFilesToCloudinary(files, {
                projectFolder: 'categories',
                entityId: id,
                fileNamePrefix: 'category'
            });

            const uploaded = uploadedFiles[0];
            payload.image = uploaded?.secureUrl ?? null;
            newlyUploadedPublicId = uploaded?.publicId ?? null;
        }

        const updated = await productCategoryService.updateCategory(id, payload, newlyUploadedPublicId);

        sendResponse({
            res,
            statusCode: 200,
            success: true,
            message: 'Category updated',
            data: updated
        });
        return;
    } catch (err) {
        if (newlyUploadedPublicId) {
            try {
                await deleteCloudinaryAsset(newlyUploadedPublicId);
            } catch (deleteErr) {
                console.warn('Failed to cleanup newly uploaded category asset after update failure', { newlyUploadedPublicId, err: (deleteErr as Error).message });
            }
        }

        throw err;
    }
};

const getCategories = async (req: Request, res: Response) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    const searchTerm = typeof req.query.searchTerm === 'string' ? req.query.searchTerm : undefined;

    const result = await productCategoryService.getCategories({ page, limit, searchTerm });

    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'Categories fetched',
        data: result.data,
        meta: {
            ...result.meta,
            timestamp: new Date().toISOString()
        }
    });
};

const getParentCategories = async (req: Request, res: Response) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    const searchTerm = typeof req.query.searchTerm === 'string' ? req.query.searchTerm : undefined;

    const result = await productCategoryService.getParentCategories({ page, limit, searchTerm });

    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'Categories fetched',
        data: result.data,
        meta: {
            ...result.meta,
            timestamp: new Date().toISOString()
        }
    });
};

const getCategory = async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const cat = await productCategoryService.getCategoryById(id);

    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'Category fetched',
        data: cat
    });
};

const getAllCategories = async (req: Request, res: Response) => {
    const cats = await productCategoryService.getAllCategories();

    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'All categories fetched',
        data: cats
    });
};

const deleteCategory = async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await productCategoryService.deleteCategory(id);

    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'Category deleted',
        data: null
    });
};

export const productCategoryController = {
    createCategory,
    updateCategory,
    getCategories,
    getParentCategories,
    getCategory,
    getAllCategories,
    deleteCategory
};
