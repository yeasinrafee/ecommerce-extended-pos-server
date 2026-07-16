import { prisma } from '../../config/prisma.js';
import { Prisma } from '@prisma/client';

export class StockRepository {
  // Location methods
  async findLocationById(id: string) {
    return prisma.location.findFirst({
      where: { id, deletedAt: null }
    });
  }

  async findLocationByCode(code: string) {
    return prisma.location.findFirst({
      where: { code, deletedAt: null }
    });
  }

  async findManyLocations(where: Prisma.LocationWhereInput, skip?: number, take?: number) {
    return prisma.location.findMany({
      where,
      skip,
      take,
      orderBy: { name: 'asc' }
    });
  }

  async countLocations(where: Prisma.LocationWhereInput) {
    return prisma.location.count({ where });
  }

  async createLocation(data: Prisma.LocationCreateInput) {
    return prisma.location.create({ data });
  }

  async updateLocation(id: string, data: Prisma.LocationUpdateInput) {
    return prisma.location.update({
      where: { id },
      data
    });
  }

  async deleteLocation(id: string) {
    return prisma.location.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  // Stock methods
  async findStock(productId: string, locationId: string) {
    return prisma.stock.findUnique({
      where: {
        productId_locationId: { productId, locationId }
      },
      include: {
        product: { select: { id: true, name: true, sku: true, barcodeId: true } },
        location: { select: { id: true, name: true, code: true } }
      }
    });
  }

  async findManyStocks(params: {
    where: Prisma.StockWhereInput;
    skip?: number;
    take?: number;
    orderBy?: Prisma.StockOrderByWithRelationInput;
  }) {
    return prisma.stock.findMany({
      where: params.where,
      skip: params.skip,
      take: params.take,
      orderBy: params.orderBy,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcodeId: true,
            posPrice: true,
            Baseprice: true,
            finalPrice: true
          }
        },
        location: {
          select: { id: true, name: true, code: true, type: true }
        }
      }
    });
  }

  async countStocks(where: Prisma.StockWhereInput) {
    return prisma.stock.count({ where });
  }

  // Low Stock Config methods
  async findLowStockConfig(productId: string, locationId: string | null) {
    return prisma.lowStockConfig.findFirst({
      where: { productId, locationId, deletedAt: null }
    });
  }

  async createLowStockConfig(data: Prisma.LowStockConfigUncheckedCreateInput) {
    return prisma.lowStockConfig.create({ data });
  }

  async updateLowStockConfig(id: string, data: Prisma.LowStockConfigUncheckedUpdateInput) {
    return prisma.lowStockConfig.update({
      where: { id },
      data
    });
  }

  async findManyLowStockConfigs(where: Prisma.LowStockConfigWhereInput, skip?: number, take?: number) {
    return prisma.lowStockConfig.findMany({
      where,
      skip,
      take,
      include: {
        product: { select: { id: true, name: true, sku: true } },
        location: { select: { id: true, name: true } }
      }
    });
  }

  async countLowStockConfigs(where: Prisma.LowStockConfigWhereInput) {
    return prisma.lowStockConfig.count({ where });
  }
}

export const stockRepository = new StockRepository();
