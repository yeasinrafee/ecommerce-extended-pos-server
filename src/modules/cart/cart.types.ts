export interface AddToCartDto {
    productId?: string;
    productIds?: string[];
    variationIds?: string[];
}

export interface UpdateCartDto {
    productId?: string;
    productIds?: string[];
    variationIds?: string[];
    addedToCart: boolean;
}

export interface RemoveFromCartDto {
    productId?: string;
    productIds?: string[];
}
