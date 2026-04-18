import { prisma } from '../../config/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import { DiscountType } from '@prisma/client';
import type { CreateOrderDto } from './order.types.js';
import type { PrismaClient } from '@prisma/client';
import { emailQueue } from '../../common/services/email.service.js';
import { orderEmailTemplates } from './order.email-templates.js';
import { notificationService } from '../notification/notification.service.js';
import { orderEmailQueue } from './order-invoice-email.service.js';

const attachSelectedAttributes = (order: any) => ({
  ...order,
  orderItems: order.orderItems?.map((item: any) => ({
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
  })),
});

const toDateOnlyKey = (value: Date | null | undefined) => {
  if (!value) {
    return null;
  }

  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};

const isDateWithinInclusiveRange = (currentDate: Date, startDate: Date | null, endDate: Date | null) => {
  const currentKey = toDateOnlyKey(currentDate) as string;
  const startKey = toDateOnlyKey(startDate) ?? '0000-01-01';
  const endKey = toDateOnlyKey(endDate) ?? '9999-12-31';

  return currentKey >= startKey && currentKey <= endKey;
};

const calculateDiscountedPrice = (basePrice: number, discountType: DiscountType, discountValue: number) => {
  if (discountType === DiscountType.FLAT_DISCOUNT) {
    return Math.max(0, basePrice - discountValue);
  }

  if (discountType === DiscountType.PERCENTAGE_DISCOUNT) {
    return Math.max(0, basePrice - (basePrice * discountValue) / 100);
  }

  return basePrice;
};

const getActiveOfferForProduct = (product: any) => {
  const currentDate = new Date();

  return (product.offerProducts ?? [])
    .map((item: any) => item.offer)
    .find((offer: any) => {
      if (!offer || offer.status !== 'ACTIVE') {
        return false;
      }

      return isDateWithinInclusiveRange(currentDate, offer.discountStartDate, offer.discountEndDate);
    }) ?? null;
};

const resolveAppliedDiscount = (product: any) => {
  const activeOffer = getActiveOfferForProduct(product);

  if (activeOffer) {
    return {
      discountType: activeOffer.discountType || DiscountType.NONE,
      discountValue: activeOffer.discountValue || 0,
      source: 'offer' as const
    };
  }

  const hasActiveProductDiscount =
    product.discountType &&
    product.discountType !== DiscountType.NONE &&
    product.discountValue != null &&
    product.discountStartDate &&
    product.discountEndDate &&
    isDateWithinInclusiveRange(new Date(), product.discountStartDate, product.discountEndDate);

  if (hasActiveProductDiscount) {
    return {
      discountType: product.discountType as DiscountType,
      discountValue: product.discountValue as number,
      source: 'product' as const
    };
  }

  return {
    discountType: DiscountType.NONE,
    discountValue: 0,
    source: 'none' as const
  };
};

export const createOrderService = async (
  userId: string,
  data: CreateOrderDto
) => {
  const result = await prisma.$transaction(async (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$use' | '$extends'>) => {
    let customer = await tx.customer.findUnique({
      where: { userId },
    });

    if (!customer) {
      throw new AppError(404, 'Customer not found for this user');
    }

    let finalAddressId = data.addressId;
    let zoneId = '';

    if (finalAddressId) {
      const existingAddress = await tx.address.findFirst({
        where: { id: finalAddressId, customerId: customer.id, deletedAt: null },
      });
      if (!existingAddress) {
        throw new AppError(404, 'Provided address not found or does not belong to the customer');
      }
      zoneId = existingAddress.zoneId;
    } else if (data.address) {
      const newAddress = await tx.address.create({
        data: {
          customerId: customer.id,
          zoneId: data.address.zoneId,
          postCode: data.address.postCode,
          streetAddress: data.address.streetAddress,
          flatNumber: data.address.flatNumber,
        },
      });
      finalAddressId = newAddress.id;
      zoneId = data.address.zoneId;
    } else {
      throw new AppError(400, 'Either addressId or address must be provided');
    }

    if (data.promoId) {
      const promo = await tx.promo.findUnique({ where: { id: data.promoId } });
      if (!promo) {
        throw new AppError(400, 'Invalid promo code');
      }

      const currentDate = new Date();
      if (currentDate < promo.startDate || currentDate > promo.endDate) {
        throw new AppError(400, 'Promo code is expired or not yet active');
      }

      const pastUsages = await tx.order.count({
        where: { customerId: customer.id, promoId: data.promoId },
      });

      if (pastUsages >= promo.numberOfUses) {
        throw new AppError(400, 'Promo code usage limit exceeded for this customer');
      }
    }

    let baseAmount = 0;
    let totalWeight = 0;
    let totalVolume = 0;
    const orderItemsData = [];

    for (const item of data.products) {
      const product = await tx.product.findUnique({
        where: { id: item.productId },
        include: {
          productVariations: {
            where: {
              id: { in: item.variationIds || [] },
            },
          },
          offerProducts: {
            where: {
              deletedAt: null,
            },
            include: {
              offer: true,
            },
          },
        },
      });

      if (!product) {
        throw new AppError(404, `Product with id ${item.productId} not found`);
      }

      if (product.stock < item.quantity) {
        throw new AppError(400, `Not enough stock for product ${product.name}`);
      }

      const appliedDiscount = resolveAppliedDiscount(product);
      let basePriceToUse = product.Baseprice;
      let finalPriceToUse = calculateDiscountedPrice(product.Baseprice, appliedDiscount.discountType, appliedDiscount.discountValue);

      if (item.variationIds && item.variationIds.length > 0) {
        for (const variation of product.productVariations) {
          if (variation.basePrice > basePriceToUse) {
            basePriceToUse = variation.basePrice;
          }
          const variationFinalPrice = appliedDiscount.source === 'none'
            ? variation.finalPrice
            : calculateDiscountedPrice(variation.basePrice, appliedDiscount.discountType, appliedDiscount.discountValue);

          if (variationFinalPrice > finalPriceToUse) {
            finalPriceToUse = variationFinalPrice;
          }
        }
      }

      if (finalPriceToUse < 0) finalPriceToUse = 0;
      baseAmount += finalPriceToUse * item.quantity;

      if (product.weight) {
        totalWeight += product.weight * item.quantity;
      } else if (product.volume) {
        totalVolume += product.volume * item.quantity;
      }

      orderItemsData.push({
        productId: product.id,
        quantity: item.quantity,
        Baseprice: basePriceToUse,
        finalPrice: finalPriceToUse,
        discountType: appliedDiscount.discountType,
        discountValue: appliedDiscount.discountValue,
        variations: {
          create: (item.variationIds || []).map((vId) => ({
            productVariationId: vId,
          })),
        },
      });

      const updateResult = await tx.product.updateMany({
        where: {
          id: product.id,
          stock: {
            gte: item.quantity,
          },
        },
        data: {
          stock: {
            decrement: item.quantity,
          },
        },
      });

      if (updateResult.count === 0) {
        throw new AppError(400, `Concurrency Error: Product ${product.name} does not have enough stock.`);
      }
    }

    let orderDiscountValue = 0;
    let orderDiscountType: DiscountType = DiscountType.NONE;

    if (data.promoId) {
      const promo = await tx.promo.findUnique({ where: { id: data.promoId } });
      if (promo) {
        orderDiscountType = promo.discountType;
        if (promo.discountType === DiscountType.FLAT_DISCOUNT) {
          orderDiscountValue = promo.discountValue;
        } else if (promo.discountType === DiscountType.PERCENTAGE_DISCOUNT) {
          orderDiscountValue = (baseAmount * promo.discountValue) / 100;
        }
      }
    }

    const amountAfterPromo = Math.max(0, baseAmount - orderDiscountValue);
    const zonePolicyLink = await tx.zonePoliciesOnZones.findFirst({
      where: { zoneId },
      include: { zonePolicy: true },
    });

    if (!zonePolicyLink || !zonePolicyLink.zonePolicy) {
      throw new AppError(400, 'Shipping not available for the selected zone');
    }

    const baseShippingCharge = zonePolicyLink.zonePolicy.shippingCost;
    const deliveryTime = zonePolicyLink.zonePolicy.deliveryTime;

    const shippingSettings = await tx.shipping.findFirst();
    let extraShippingCharge = 0;
    let taxPercent = 0;
    let chargePerWeight = null;
    let chargePerVolume = null;
    let weightUnit = null;
    let volumeUnit = null;

    if (shippingSettings) {
      taxPercent = shippingSettings.tax || 0;
      chargePerWeight = shippingSettings.chargePerWeight;
      chargePerVolume = shippingSettings.chargePerVolume;
      weightUnit = shippingSettings.weightUnit;
      volumeUnit = shippingSettings.volumeUnit;

      if (totalWeight > 0 && chargePerWeight && weightUnit && weightUnit > 0) {
        extraShippingCharge += Math.ceil(totalWeight / weightUnit) * chargePerWeight;
      }
      if (totalVolume > 0 && chargePerVolume && volumeUnit && volumeUnit > 0) {
        extraShippingCharge += Math.ceil(totalVolume / volumeUnit) * chargePerVolume;
      }
    }

    const finalShippingCharge = baseShippingCharge + extraShippingCharge;
    const taxAmount = (amountAfterPromo * taxPercent) / 100;
    const finalAmount = amountAfterPromo + finalShippingCharge + taxAmount;

    const expectedDeliveryDate = new Date();
    expectedDeliveryDate.setDate(expectedDeliveryDate.getDate() + Math.ceil(deliveryTime || 0));

    let discountValueForOrder = 0;
    if (data.promoId) {
      const promoEntity = await tx.promo.findUnique({ where: { id: data.promoId } });
      if (promoEntity) {
        discountValueForOrder = promoEntity.discountValue;
      }
    }

    const order = await tx.order.create({
      data: {
        customerId: customer.id,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        customerPhone: data.customerPhone,
        addressId: finalAddressId,
        baseAmount,
        promoId: data.promoId || null,
        discountType: orderDiscountType,
        discountValue: discountValueForOrder,
        discountAmount: orderDiscountValue,
        finalAmount,
        baseShippingCharge: baseShippingCharge,
        extraShippingCharge: extraShippingCharge,
        finalShippingCharge: finalShippingCharge,
        tax: taxAmount,
        totalWeight,
        totalVolume,
        chargePerWeight,
        chargePerVolume,
        weightUnit,
        volumeUnit,
        deliveryTime,
        expectedDeliveryDate,
        orderItems: {
          create: orderItemsData,
        },
      },
      include: {
        customer: true,
        promo: true,
        address: {
          include: {
            zone: {
              include: {
                zonePolicies: {
                  include: { zonePolicy: true },
                },
              },
            },
          },
        },
        orderItems: {
          include: {
            product: true,
            variations: {
              include: {
                productVariation: {
                  include: {
                    attribute: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const zonePolicy = zonePolicyLink?.zonePolicy ?? null;

    return attachSelectedAttributes({ ...order, zonePolicy });
  });

  void orderEmailQueue
    .add(
      'sendOrderPlacedEmailWithInvoice',
      { orderId: result.id },
      { jobId: `order-placed-email-${result.id}` },
    )
    .catch((error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Failed to enqueue order placed invoice email', msg);
    });

  void notificationService.addNotification(
    'New Order Placed',
    `A new order has been placed by ${result.customerName}. Order ID: ${result.id}`
  );

  return result;
};

export const getAllOrdersService = async (
  page: number,
  limit: number,
  searchTerm?: string
) => {
  const skip = (page - 1) * limit;

  const where: any = {};

  if (searchTerm) {
    where.OR = [
      { id: { contains: searchTerm, mode: 'insensitive' } },
      { customerName: { contains: searchTerm, mode: 'insensitive' } },
      { customerEmail: { contains: searchTerm, mode: 'insensitive' } },
      { customerPhone: { contains: searchTerm, mode: 'insensitive' } },
    ];
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: true,
        promo: true,
        address: {
          include: {
            zone: true,
          },
        },
        orderItems: {
          include: {
            product: true,
            variations: {
              include: {
                productVariation: {
                  include: {
                    attribute: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    orders: orders.map(attachSelectedAttributes),
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getOrdersByCustomerService = async (userId: string) => {
  const customer = await prisma.customer.findUnique({
    where: { userId },
  });

  if (!customer) {
    throw new AppError(404, 'Customer not found');
  }

  const orders = await prisma.order.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: 'desc' },
    include: {
      promo: true,
      address: {
        include: { zone: true },
      },
      orderItems: {
        include: {
          product: true,
          variations: {
            include: {
              productVariation: {
                include: {
                  attribute: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return orders.map(attachSelectedAttributes);
};

export const getOrderByIdService = async (orderId: string, userId?: string, roles?: string[]) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      promo: true,
      address: {
        include: {
          zone: {
            include: {
              zonePolicies: {
                include: { zonePolicy: true },
              },
            },
          },
        },
      },
      orderItems: {
        include: {
          product: true,
          variations: {
            include: {
              productVariation: {
                include: {
                  attribute: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!order) {
    throw new AppError(404, 'Order not found');
  }

  if (userId && roles) {
    const isAdmin = roles.includes('ADMIN') || roles.includes('SUPER_ADMIN');
    if (!isAdmin) {
      const customer = await prisma.customer.findUnique({ where: { userId } });
      if (!customer || order.customerId !== customer.id) {
        throw new AppError(403, 'Unauthorized access to this order');
      }
    }
  }

  // compute a fallback expected delivery date from order.createdAt + zone policy deliveryTime (days)
  let expected = order.expectedDeliveryDate ?? null;
  const deliveryTimeDays = order.address?.zone?.zonePolicies?.[0]?.zonePolicy?.deliveryTime;
  if (!expected && deliveryTimeDays && order.createdAt) {
    const d = new Date(order.createdAt);
    d.setDate(d.getDate() + Math.ceil(deliveryTimeDays || 0));
    expected = d;
  }

  return attachSelectedAttributes({ ...order, expectedDeliveryDate: expected });
};

export const updateOrderStatusService = async (orderId: string, status: any) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: {
        include: {
          user: true
        }
      }
    },
  });

  if (!order) {
    throw new AppError(404, 'Order not found');
  }

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: { orderStatus: status },
  });

  // Background email processing using BullMQ via emailQueue.add
  await emailQueue.add('sendEmail', {
    to: order.customerEmail || order.customer.user.email,
    subject: `Order Status Update: ${status}`,
    html: orderEmailTemplates.statusUpdate(order, status),
  });

  return updatedOrder;
};

export const cancelOrderService = async (orderId: string, userId: string) => {
  const customer = await prisma.customer.findUnique({
    where: { userId },
  });

  if (!customer) {
    throw new AppError(404, 'Customer not found');
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: {
        include: {
          user: true,
        },
      },
    },
  });

  if (!order) {
    throw new AppError(404, 'Order not found');
  }

  if (order.customerId !== customer.id) {
    throw new AppError(403, 'You are not authorized to cancel this order');
  }

  if (order.orderStatus === 'CANCELLED') {
    throw new AppError(400, 'Order is already cancelled');
  }

  // Optional: Check if order is already shipped/delivered and prevent cancellation
  if (['SHIPPED', 'DELIVERED'].includes(order.orderStatus)) {
    throw new AppError(400, `Cannot cancel an order that is already ${order.orderStatus.toLowerCase()}`);
  }

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: { orderStatus: 'CANCELLED' },
  });

  // Background email for cancellation
  await emailQueue.add('sendEmail', {
    to: order.customerEmail || order.customer.user.email,
    subject: 'Order Cancelled',
    html: orderEmailTemplates.orderCancelled(order.customerName),
  });

  void notificationService.addNotification(
    'Order Cancelled',
    `Order #${order.id} has been cancelled by the customer ${order.customerName}.`
  );

  return updatedOrder;
};
