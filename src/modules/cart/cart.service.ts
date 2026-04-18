import { prisma } from '../../config/prisma.js';
import { AppError } from '../../common/errors/app-error.js';

const attachSelectedAttributes = (items: any[]) =>
    items.map((item: any) => ({
        ...item,
        selectedAttributes: item.variations
            ?.map((variation: any) => {
                const attribute = variation.productVariation?.attribute;

                if (!attribute) {
                    return null;
                }

                return {
                    attributeName: attribute.name,
                    attributeValue: variation.productVariation.attributeValue,
                };
            })
            .filter(Boolean) ?? [],
    }));

const getCustomerWishlistId = async (userId: string) => {
    const customer = await prisma.customer.findUnique({ where: { userId } });
    if (!customer) throw new AppError(404, 'Customer not found', [{ message: 'No customer profile for this user', code: 'NOT_FOUND' }]);
    
    const wishlist = await prisma.wishlist.findUnique({ where: { customerId: customer.id } });
    if (!wishlist) throw new AppError(404, 'Wishlist not found', [{ message: 'No wishlist for this customer', code: 'NOT_FOUND' }]);

    return wishlist.id;
};

const addToCart = async (userId: string, productIds: string | string[], variationIds?: string[]) => {
    const wishlistId = await getCustomerWishlistId(userId);
    const ids = Array.isArray(productIds) ? productIds : [productIds];

    return prisma.$transaction(async (tx) => {
        for (const productId of ids) {
            const item = await tx.wishlistItem.upsert({
                where: { wishlistId_productId: { wishlistId, productId } },
                create: { wishlistId, productId, addedToCart: true },
                update: { addedToCart: true }
            });

            if (variationIds && variationIds.length > 0) {
                // Remove existing variations to ensure sync
                await tx.wishlistItemVariation.deleteMany({
                    where: { wishlistItemId: item.id }
                });

                // Add new variations
                await tx.wishlistItemVariation.createMany({
                    data: variationIds.map(vId => ({
                        wishlistItemId: item.id,
                        productVariationId: vId
                    }))
                });
            }
        }
        return tx.wishlistItem.findMany({
            where: { wishlistId, productId: { in: ids }, addedToCart: true },
            include: { 
                product: true,
                variations: {
                    include: {
                        productVariation: {
                            include: {
                                attribute: true,
                            }
                        }
                    }
                }
            }
        }).then(attachSelectedAttributes);
    });
};

const getCartItems = async (userId: string) => {
    const wishlistId = await getCustomerWishlistId(userId);
    const items = await prisma.wishlistItem.findMany({
        where: { wishlistId, addedToCart: true },
        orderBy: { updatedAt: 'desc' },
        include: { 
            product: true,
            variations: {
                include: {
                    productVariation: {
                        include: {
                            attribute: true,
                        }
                    }
                }
            }
        }
    });

    return attachSelectedAttributes(items);
};

const updateCartItems = async (userId: string, productIds: string | string[], addedToCart: boolean) => {
    const wishlistId = await getCustomerWishlistId(userId);
    const ids = Array.isArray(productIds) ? productIds : [productIds];

    await prisma.wishlistItem.updateMany({
        where: { wishlistId, productId: { in: ids } },
        data: { addedToCart }
    });

    return prisma.wishlistItem.findMany({
        where: { wishlistId, productId: { in: ids } },
        include: { product: true }
    });
};

const removeItemsFromCart = async (userId: string, productIds: string | string[]) => {
    const wishlistId = await getCustomerWishlistId(userId);
    const ids = Array.isArray(productIds) ? productIds : [productIds];

    await prisma.wishlistItem.updateMany({
        where: { wishlistId, productId: { in: ids } },
        data: { addedToCart: false }
    });
    return true;
};

export const cartService = {
    addToCart,
    getCartItems,
    updateCartItems,
    removeItemsFromCart
};
