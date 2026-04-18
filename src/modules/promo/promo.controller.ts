import { Request, Response } from 'express';
import { sendResponse } from '../../common/utils/send-response.js';
import { promoService } from './promo.service.js';

const getPromos = async (req: Request, res: Response) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    const searchTerm = typeof req.query.searchTerm === 'string' ? req.query.searchTerm : undefined;

    const result = await promoService.getPromos({ page, limit, searchTerm });

    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'Promos fetched',
        data: result.data,
        meta: {
            ...result.meta,
            timestamp: new Date().toISOString()
        }
    });
};

const getAllPromos = async (req: Request, res: Response) => {
    const promos = await promoService.getAllPromos();
    sendResponse({ res, statusCode: 200, success: true, message: 'All promos fetched', data: promos });
};

const getPromo = async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const promo = await promoService.getPromoById(id);
    sendResponse({ res, statusCode: 200, success: true, message: 'Promo fetched', data: promo });
};

const getPromoByCode = async (req: Request, res: Response) => {
    const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
    const promo = await promoService.getPromoByCode(code);
    sendResponse({ res, statusCode: 200, success: true, message: 'Promo fetched', data: promo });
};

const createPromo = async (req: Request, res: Response) => {
    const data = await promoService.createPromo(req.body);
    sendResponse({ res, statusCode: 201, success: true, message: 'Promo created', data });
};

const updatePromo = async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const data = await promoService.updatePromo(id, req.body);
    sendResponse({ res, statusCode: 200, success: true, message: 'Promo updated', data });
};

const deletePromo = async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await promoService.deletePromo(id);
    sendResponse({ res, statusCode: 200, success: true, message: 'Promo deleted', data: null });
};

export const promoController = {
    getPromos,
    getAllPromos,
    getPromo,
    getPromoByCode,
    createPromo,
    updatePromo,
    deletePromo
};
