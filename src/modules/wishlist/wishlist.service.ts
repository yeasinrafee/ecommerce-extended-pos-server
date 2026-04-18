import { prisma } from '../../config/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import type { WishlistQuery, UpdateWishlistDto } from './wishlist.types.js';

const getCustomerWishlistId = async (userId: string) => {
    const customer = await prisma.customer.findUnique({ where: { userId } });
    if (!customer) throw new AppError(404, 'Customer not found', [{ message: 'No customer profile for this user', code: 'NOT_FOUND' }]);
    
    const wishlist = await prisma.wishlist.findUnique({ where: { customerId: customer.id } });
    if (!wishlist) throw new AppError(404, 'Wishlist not found', [{ message: 'No wishlist for this customer', code: 'NOT_FOUND' }]);

    return wishlist.id;
}

const getWishlistItemsPaginated = async (userId: string, { page = 1, limit = 10 }: WishlistQuery) => {
    const wishlistId = await getCustomerWishlistId(userId);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
        prisma.wishlistItem.findMany({
            where: { wishlistId, addedToCart: false },
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: { 
                product: true,
                variations: {
                    include: {
                        productVariation: true
                    }
                }
            }
        }),
        prisma.wishlistItem.count({ where: { wishlistId, addedToCart: false } })
    ]);

    return {
        data,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit))
        }
    };
};

const getAllWishlistItems = async (userId: string) => {
    const wishlistId = await getCustomerWishlistId(userId);
    return prisma.wishlistItem.findMany({
        where: { wishlistId, addedToCart: false },
        orderBy: { createdAt: 'desc' },
        include: { 
            product: true,
            variations: {
                include: {
                    productVariation: true
                }
            }
        }
    });
};

const getWishlistItem = async (userId: string, productId: string) => {
    const wishlistId = await getCustomerWishlistId(userId);
    const item = await prisma.wishlistItem.findFirst({
        where: { wishlistId, productId, addedToCart: false },
        include: { 
            product: true,
            variations: {
                include: {
                    productVariation: true
                }
            }
        }
    });

    if (!item) {
        throw new AppError(404, 'Wishlist item not found', [{ message: 'Product is not in the wishlist', code: 'NOT_FOUND' }]);
    }
    return item;
};

const updateWishlist = async (userId: string, productIds: string | string[], addedToCart?: boolean, variationIds?: string[]) => {
    const wishlistId = await getCustomerWishlistId(userId);
    const ids = Array.isArray(productIds) ? productIds : [productIds];
    
    return prisma.$transaction(async (tx) => {
        for (const productId of ids) {
            const item = await tx.wishlistItem.upsert({
                where: { wishlistId_productId: { wishlistId, productId } },
                create: { wishlistId, productId, addedToCart: addedToCart ?? false },
                update: { addedToCart: addedToCart ?? false }
            });

            if (variationIds && variationIds.length > 0) {
                // Ensure variations are synced
                await tx.wishlistItemVariation.deleteMany({
                    where: { wishlistItemId: item.id }
                });

                await tx.wishlistItemVariation.createMany({
                    data: variationIds.map(vId => ({
                        wishlistItemId: item.id,
                        productVariationId: vId
                    }))
                });
            }
        }
        return tx.wishlistItem.findMany({
            where: { wishlistId, productId: { in: ids } },
            include: { 
                product: true,
                variations: {
                    include: {
                        productVariation: true
                    }
                }
            }
        });
    });
};

const deleteWishlistItems = async (userId: string, productIds: string | string[]) => {
    const wishlistId = await getCustomerWishlistId(userId);
    const ids = Array.isArray(productIds) ? productIds : [productIds];

    await prisma.wishlistItem.deleteMany({
        where: { wishlistId, productId: { in: ids } }
    });
    return true;
};

const transferToCart = async (userId: string, productIds: string | string[]) => {
    const wishlistId = await getCustomerWishlistId(userId);
    const ids = Array.isArray(productIds) ? productIds : [productIds];

    await prisma.wishlistItem.updateMany({
        where: { wishlistId, productId: { in: ids } },
        data: { addedToCart: true }
    });

    return prisma.wishlistItem.findMany({
        where: { wishlistId, productId: { in: ids } },
        include: { product: true }
    });
};

export const wishlistService = {
    getWishlistItemsPaginated,
    getAllWishlistItems,
    getWishlistItem,
    updateWishlist,
    deleteWishlistItems,
    transferToCart
};
