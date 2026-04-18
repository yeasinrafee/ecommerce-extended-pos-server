import { DiscountType } from '@prisma/client';

export interface CreateOrderAddress {
  zoneId: string;
  postCode: string;
  flatNumber?: string;
  streetAddress: string;
}

export interface CreateOrderItem {
  productId: string;
  quantity: number;
  variationIds?: string[];
}

export interface CreateOrderDto {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  addressId?: string;
  address?: CreateOrderAddress;
  promoId?: string;
  products: CreateOrderItem[];
}
