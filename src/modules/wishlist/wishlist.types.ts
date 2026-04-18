export type WishlistQuery = {
    page?: number;
    limit?: number;
};

export type UpdateWishlistDto = {
    productId?: string;
    productIds?: string | string[];
    variationIds?: string[];
    addedToCart?: boolean;
};

export type AddToCartWishlistDto = {
    productIds: string | string[];
};
