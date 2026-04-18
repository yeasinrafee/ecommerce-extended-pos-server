import { Request, Response } from 'express';
import { sendResponse } from '../../common/utils/send-response.js';
import { attributeService } from './attribute.service.js';

const createAttribute = async (req: Request, res: Response) => {
    const { name } = req.body;
    // values may be sent as array or string; normalize in service via DTO
    const values = req.body.values;

    const created = await attributeService.createAttribute({ name, values });

    sendResponse({
        res,
        statusCode: 201,
        success: true,
        message: 'Attribute created',
        data: created
    });
};

const updateAttribute = async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const payload = req.body;

    const updated = await attributeService.updateAttribute(id, payload);

    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'Attribute updated',
        data: updated
    });
};

const getAttributes = async (req: Request, res: Response) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    const searchTerm = typeof req.query.searchTerm === 'string' ? req.query.searchTerm : undefined;

    const result = await attributeService.getAttributes({ page, limit, searchTerm });

    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'Attributes fetched',
        data: result.data,
        meta: {
            ...result.meta,
            timestamp: new Date().toISOString()
        }
    });
};

const getAttribute = async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const a = await attributeService.getAttributeById(id);

    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'Attribute fetched',
        data: a
    });
};

const getAllAttributes = async (req: Request, res: Response) => {
    const attrs = await attributeService.getAllAttributes();

    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'All attributes fetched',
        data: attrs
    });
};

const deleteAttribute = async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await attributeService.deleteAttribute(id);

    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'Attribute deleted',
        data: null
    });
};

export const attributeController = {
    createAttribute,
    updateAttribute,
    getAttributes,
    getAttribute,
    getAllAttributes,
    deleteAttribute
};
