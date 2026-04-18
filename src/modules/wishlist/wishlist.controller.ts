import { Request, Response } from 'express';
import { sendResponse } from '../../common/utils/send-response.js';
import { wishlistService } from './wishlist.service.js';
import { AppError } from '../../common/errors/app-error.js';

const getWishlistsPaginated = async (req: Request, res: Response) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    const result = await wishlistService.getWishlistItemsPaginated(req.user!.id, { page, limit });

    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'Wishlist items fetched',
        data: result.data,
        meta: {
            ...result.meta,
            timestamp: new Date().toISOString()
        }
    });
};

const getAllWishlists = async (req: Request, res: Response) => {
    const data = await wishlistService.getAllWishlistItems(req.user!.id);
    sendResponse({ res, statusCode: 200, success: true, message: 'All wishlist items fetched', data });
};

const getWishlist = async (req: Request, res: Response) => {
    const productId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const data = await wishlistService.getWishlistItem(req.user!.id, productId);
    sendResponse({ res, statusCode: 200, success: true, message: 'Wishlist item fetched', data });
};

const updateWishlist = async (req: Request, res: Response) => {
    let productIds = req.body?.productIds || req.body?.productId;
    const variationIds = req.body?.variationIds;
    if (!productIds && req.params.id) {
        productIds = [req.params.id];
    }
    
    if (!productIds) {
        throw new AppError(400, 'Product IDs are required', [{ message: 'Missing product ID(s)', code: 'MISSING_DATA' }]);
    }

    const data = await wishlistService.updateWishlist(req.user!.id, productIds, req.body.addedToCart, variationIds);
    sendResponse({ res, statusCode: 200, success: true, message: 'Wishlist updated', data });
};

const deleteWishlist = async (req: Request, res: Response) => {
    let productIds = req.body?.productIds || req.body?.productId;
    if (!productIds && req.params.id) {
        productIds = [req.params.id];
    }
    
    if (!productIds) {
        throw new AppError(400, 'Product IDs are required', [{ message: 'Missing product ID(s)', code: 'MISSING_DATA' }]);
    }

    await wishlistService.deleteWishlistItems(req.user!.id, productIds);
    sendResponse({ res, statusCode: 200, success: true, message: 'Wishlist items deleted', data: null });
};

const deleteWishlistByParamId = async (req: Request, res: Response) => {
    const productId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await wishlistService.deleteWishlistItems(req.user!.id, productId);
    sendResponse({ res, statusCode: 200, success: true, message: 'Wishlist item deleted', data: null });
};

const transferToCart = async (req: Request, res: Response) => {
    let productIds = req.body?.productIds || req.body?.productId;
    if (!productIds && req.params.id) {
        productIds = [req.params.id];
    }
    
    if (!productIds) {
        throw new AppError(400, 'Product IDs are required', [{ message: 'Missing product ID(s)', code: 'MISSING_DATA' }]);
    }

    const data = await wishlistService.transferToCart(req.user!.id, productIds);
    sendResponse({ res, statusCode: 200, success: true, message: 'Wishlist items transferred to cart', data });
};

export const wishlistController = {
    getWishlistsPaginated,
    getAllWishlists,
    getWishlist,
    updateWishlist,
    deleteWishlist,
    deleteWishlistByParamId,
    transferToCart
};
