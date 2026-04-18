import { Request, Response } from 'express';
import { sendResponse } from '../../common/utils/send-response.js';
import { productTagService } from './product-tag.service.js';

const createTag = async (req: Request, res: Response) => {
    const { name } = req.body;
    const created = await productTagService.createTag({ name });

    sendResponse({
        res,
        statusCode: 201,
        success: true,
        message: 'Tag created',
        data: created
    });
};

const updateTag = async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const payload = req.body;

    const updated = await productTagService.updateTag(id, payload);

    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'Tag updated',
        data: updated
    });
};

const getTags = async (req: Request, res: Response) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    const searchTerm = typeof req.query.searchTerm === 'string' ? req.query.searchTerm : undefined;

    const result = await productTagService.getTags({ page, limit, searchTerm });

    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'Tags fetched',
        data: result.data,
        meta: {
            ...result.meta,
            timestamp: new Date().toISOString()
        }
    });
};

const getTag = async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const tag = await productTagService.getTagById(id);

    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'Tag fetched',
        data: tag
    });
};

const getAllTags = async (req: Request, res: Response) => {
    const tags = await productTagService.getAllTags();

    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'All tags fetched',
        data: tags
    });
};

const deleteTag = async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await productTagService.deleteTag(id);

    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'Tag deleted',
        data: null
    });
};

export const productTagController = {
    createTag,
    updateTag,
    getTags,
    getTag,
    getAllTags,
    deleteTag
};
