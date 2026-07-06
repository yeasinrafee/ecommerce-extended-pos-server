import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/app-error.js";
import { Prisma, LocationType, Status } from "@prisma/client";
import { stockRepository } from "./stock.repository.js";

export class StockService {
  // Location CRUD
  async getLocations(
    params: { page?: number; limit?: number; searchTerm?: string } = {},
  ) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.LocationWhereInput = { deletedAt: null };

    if (params.searchTerm) {
      where.OR = [
        { name: { contains: params.searchTerm, mode: "insensitive" } },
        { code: { contains: params.searchTerm, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      stockRepository.findManyLocations(where, skip, limit),
      stockRepository.countLocations(where),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getAllLocations() {
    return prisma.location.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
    });
  }

  async getLocationById(id: string) {
    const location = await stockRepository.findLocationById(id);
    if (!location) {
      throw new AppError(404, "Location not found");
    }
    return location;
  }

  async createLocation(payload: any, userId?: string) {
    const existing = await stockRepository.findLocationByCode(payload.code);
    if (existing) {
      throw new AppError(
        409,
        `Location code ${payload.code} is already in use`,
      );
    }

    return stockRepository.createLocation({
      name: payload.name,
      code: payload.code.toUpperCase(),
      type: payload.type,
      address: payload.address ?? null,
      phone: payload.phone ?? null,
      status: payload.status ?? Status.ACTIVE,
      creator: userId ? { connect: { id: userId } } : undefined,
    });
  }

  async updateLocation(id: string, payload: any, userId?: string) {
    const location = await this.getLocationById(id);

    if (payload.code && payload.code.toUpperCase() !== location.code) {
      const existing = await stockRepository.findLocationByCode(payload.code);
      if (existing) {
        throw new AppError(
          409,
          `Location code ${payload.code} is already in use`,
        );
      }
    }

    return stockRepository.updateLocation(id, {
      name: payload.name,
      code: payload.code ? payload.code.toUpperCase() : undefined,
      type: payload.type,
      address: payload.address,
      phone: payload.phone,
      status: payload.status,
      updater: userId ? { connect: { id: userId } } : undefined,
    });
  }

  async deleteLocation(id: string) {
    await this.getLocationById(id);

    // Prevent deletion of location if it holds stock > 0
    const activeStock = await prisma.stock.findFirst({
      where: { locationId: id, quantity: { gt: 0 }, deletedAt: null },
    });

    if (activeStock) {
      throw new AppError(
        400,
        "Cannot delete location because it still has active physical stock.",
      );
    }

    await stockRepository.deleteLocation(id);
    return true;
  }

  // Stock Queries
  async getStocks(params: {
    page?: number;
    limit?: number;
    productId?: string;
    locationId?: string;
    searchTerm?: string;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.StockWhereInput = { deletedAt: null };

    if (params.locationId) {
      where.locationId = params.locationId;
    }
    if (params.productId) {
      where.productId = params.productId;
    }
    if (params.searchTerm) {
      where.OR = [
        {
          product: {
            name: { contains: params.searchTerm, mode: "insensitive" },
          },
        },
        {
          product: {
            sku: { contains: params.searchTerm, mode: "insensitive" },
          },
        },
        {
          location: {
            name: { contains: params.searchTerm, mode: "insensitive" },
          },
        },
      ];
    }

    const [data, total] = await Promise.all([
      stockRepository.findManyStocks({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: "desc" },
      }),
      stockRepository.countStocks(where),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getStockByProductAndLocation(productId: string, locationId: string) {
    const stock = await stockRepository.findStock(productId, locationId);
    if (!stock) {
      // Return a virtual empty stock mapping Odoo behavior
      const product = await prisma.product.findFirst({
        where: { id: productId },
      });
      const location = await prisma.location.findFirst({
        where: { id: locationId },
      });
      if (!product || !location) {
        throw new AppError(404, "Product or Location not found");
      }
      return {
        productId,
        locationId,
        quantity: 0,
        reservedQuantity: 0,
        product,
        location,
      };
    }
    return stock;
  }

  // Reorder & Low Stock Configuration
  async upsertLowStockConfig(payload: any, userId: string) {
    const product = await prisma.product.findFirst({
      where: { id: payload.productId, deletedAt: null },
    });
    if (!product) throw new AppError(404, "Product not found");

    if (payload.locationId) {
      const location = await prisma.location.findFirst({
        where: { id: payload.locationId, deletedAt: null },
      });
      if (!location) throw new AppError(404, "Location not found");
    }

    const targetLocationId = payload.locationId ?? null;

    const existing = await prisma.lowStockConfig.findUnique({
      where: {
        productId_locationId: {
          productId: payload.productId,
          locationId: targetLocationId,
        },
      },
    });

    if (existing) {
      return prisma.lowStockConfig.update({
        where: { id: existing.id },
        data: {
          minimumQuantity: payload.minimumQuantity,
          reorderQuantity: payload.reorderQuantity,
          updatedBy: userId,
        },
      });
    } else {
      return prisma.lowStockConfig.create({
        data: {
          productId: payload.productId,
          locationId: targetLocationId,
          minimumQuantity: payload.minimumQuantity,
          reorderQuantity: payload.reorderQuantity,
          createdBy: userId,
        },
      });
    }
  }

  // Get alerts list
  async getLowStockAlerts(
    params: { page?: number; limit?: number; locationId?: string } = {},
  ) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;

    const whereStock: Prisma.StockWhereInput = { deletedAt: null };
    if (params.locationId) {
      whereStock.locationId = params.locationId;
    }

    const allStocks = await prisma.stock.findMany({
      where: whereStock,
      include: {
        product: {
          include: {
            lowStockConfigs: { where: { deletedAt: null } },
          },
        },
        location: true,
      },
    });

    // Filter stocks below threshold
    const lowStockItems = allStocks.filter((stock) => {
      let config = stock.product.lowStockConfigs.find(
        (c) => c.locationId === stock.locationId,
      );
      if (!config) {
        config = stock.product.lowStockConfigs.find(
          (c) => c.locationId === null,
        );
      }
      const limitQty = config ? config.minimumQuantity : 10; // Default safety threshold
      return stock.quantity <= limitQty;
    });

    // Pagination in-memory
    const total = lowStockItems.length;
    const paginated = lowStockItems
      .slice((page - 1) * limit, page * limit)
      .map((stock) => {
        let config = stock.product.lowStockConfigs.find(
          (c) => c.locationId === stock.locationId,
        );
        if (!config) {
          config = stock.product.lowStockConfigs.find(
            (c) => c.locationId === null,
          );
        }
        return {
          productId: stock.productId,
          productName: stock.product.name,
          sku: stock.product.sku,
          locationId: stock.locationId,
          locationName: stock.location.name,
          currentQuantity: stock.quantity,
          minimumQuantity: config ? config.minimumQuantity : 10,
          reorderQuantity: config ? config.reorderQuantity : 50,
        };
      });

    return {
      data: paginated,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  // Reorder Suggestions
  async getReorderSuggestions(
    params: { page?: number; limit?: number; locationId?: string } = {},
  ) {
    const alerts = await this.getLowStockAlerts(params);
    const suggestions = alerts.data.map((alert) => ({
      productId: alert.productId,
      productName: alert.productName,
      sku: alert.sku,
      locationId: alert.locationId,
      locationName: alert.locationName,
      currentQuantity: alert.currentQuantity,
      reorderThreshold: alert.minimumQuantity,
      suggestedReorderQuantity: alert.reorderQuantity,
    }));

    return {
      data: suggestions,
      meta: alerts.meta,
    };
  }

  // 13. Reports Services
  async getCurrentStockReport(locationId?: string) {
    const where: Prisma.StockWhereInput = { deletedAt: null };
    if (locationId) where.locationId = locationId;

    const stocks = await prisma.stock.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            Baseprice: true,
            finalPrice: true,
          },
        },
        location: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy: { product: { name: "asc" } },
    });

    const totalUniqueProducts = new Set(stocks.map((s) => s.productId)).size;
    const totalPhysicalQuantity = stocks.reduce(
      (acc, s) => acc + s.quantity,
      0,
    );
    const totalReservedQuantity = stocks.reduce(
      (acc, s) => acc + s.reservedQuantity,
      0,
    );
    const totalValueCost = stocks.reduce(
      (acc, s) => acc + s.quantity * Number(s.product.Baseprice),
      0,
    );
    const totalValueRetail = stocks.reduce(
      (acc, s) => acc + s.quantity * Number(s.product.finalPrice),
      0,
    );

    // Location breakdown
    const locationMap = new Map<
      string,
      {
        name: string;
        code: string;
        productSet: Set<string>;
        quantity: number;
        reservedQty: number;
        costValuation: number;
        retailValuation: number;
      }
    >();

    // Product breakdown
    const productMap = new Map<
      string,
      {
        productId: string;
        productName: string;
        sku: string | null;
        totalQty: number;
        totalReserved: number;
        costValuation: number;
        retailValuation: number;
        locationCount: number;
      }
    >();

    for (const s of stocks) {
      // Location
      if (!locationMap.has(s.locationId)) {
        locationMap.set(s.locationId, {
          name: s.location.name,
          code: s.location.code,
          productSet: new Set(),
          quantity: 0,
          reservedQty: 0,
          costValuation: 0,
          retailValuation: 0,
        });
      }
      const loc = locationMap.get(s.locationId)!;
      loc.productSet.add(s.productId);
      loc.quantity += s.quantity;
      loc.reservedQty += s.reservedQuantity;
      loc.costValuation += s.quantity * Number(s.product.Baseprice);
      loc.retailValuation += s.quantity * Number(s.product.finalPrice);

      // Product
      if (!productMap.has(s.productId)) {
        productMap.set(s.productId, {
          productId: s.productId,
          productName: s.product.name,
          sku: s.product.sku,
          totalQty: 0,
          totalReserved: 0,
          costValuation: 0,
          retailValuation: 0,
          locationCount: 0,
        });
      }
      const prod = productMap.get(s.productId)!;
      prod.totalQty += s.quantity;
      prod.totalReserved += s.reservedQuantity;
      prod.costValuation += s.quantity * Number(s.product.Baseprice);
      prod.retailValuation += s.quantity * Number(s.product.finalPrice);
      prod.locationCount += 1;
    }

    return {
      summary: {
        totalUniqueProducts,
        totalPhysicalQuantity,
        totalReservedQuantity,
        totalValueCost: +totalValueCost.toFixed(2),
        totalValueRetail: +totalValueRetail.toFixed(2),
      },
      locationBreakdown: [...locationMap.values()].map((l) => ({
        name: l.name,
        code: l.code,
        distinctProducts: l.productSet.size,
        quantity: l.quantity,
        reservedQty: l.reservedQty,
        costValuation: +l.costValuation.toFixed(2),
        retailValuation: +l.retailValuation.toFixed(2),
      })),
      productBreakdown: [...productMap.values()].map((p) => ({
        productId: p.productId,
        productName: p.productName,
        sku: p.sku,
        totalQty: p.totalQty,
        totalReserved: p.totalReserved,
        costValuation: +p.costValuation.toFixed(2),
        retailValuation: +p.retailValuation.toFixed(2),
        locationCount: p.locationCount,
      })),
    };
  }

  /**
   * Detailed Activity Report — every stock movement event, richly labelled.
   * Groups results chronologically. Used for the "Activity Log" report tab.
   */
  async getActivityReport(params: {
    startDate?: string;
    endDate?: string;
    locationId?: string;
    productId?: string;
    movementType?: string;
    searchTerm?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Prisma.StockMovementWhereInput = {};

    if (params.locationId) where.locationId = params.locationId;
    if (params.productId) where.productId = params.productId;
    if (params.movementType) where.movementType = params.movementType as any;
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) {
        where.createdAt.gte = new Date(params.startDate + 'T00:00:00.000Z');
      }
      if (params.endDate) {
        where.createdAt.lte = new Date(params.endDate + 'T23:59:59.999Z');
      }
    }
    if (params.searchTerm) {
      where.OR = [
        { product: { name: { contains: params.searchTerm, mode: 'insensitive' } } },
        { product: { sku: { contains: params.searchTerm, mode: 'insensitive' } } },
        { notes: { contains: params.searchTerm, mode: 'insensitive' } },
      ];
    }

    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              barcodeId: true,
              Baseprice: true,
              finalPrice: true,
            },
          },
          location: { select: { id: true, name: true, code: true } },
          performer: {
            select: {
              id: true,
              email: true,
              admins: { select: { name: true }, take: 1 },
            },
          },
        },
      }),
      prisma.stockMovement.count({ where }),
    ]);

    // Human-readable label map
    const movementLabel: Record<string, string> = {
      PURCHASE:         'Stock Received (GRN)',
      SALE:             'Stock Sold (POS)',
      CUSTOMER_RETURN:  'Customer Return',
      SUPPLIER_RETURN:  'Supplier Return',
      TRANSFER_IN:      'Stock Transfer In',
      TRANSFER_OUT:     'Stock Transfer Out',
      ADJUSTMENT_IN:    'Stock Adjustment (+)',
      ADJUSTMENT_OUT:   'Stock Adjustment (-)',
      DAMAGE:           'Damage / Waste',
      EXPIRED:          'Expired Stock Written Off',
    };

    // Direction map: IN = stock increased, OUT = stock decreased
    const movementDirection: Record<string, 'IN' | 'OUT'> = {
      PURCHASE:        'IN',
      CUSTOMER_RETURN: 'IN',
      SUPPLIER_RETURN: 'OUT',
      TRANSFER_IN:     'IN',
      TRANSFER_OUT:    'OUT',
      ADJUSTMENT_IN:   'IN',
      ADJUSTMENT_OUT:  'OUT',
      SALE:            'OUT',
      DAMAGE:          'OUT',
      EXPIRED:         'OUT',
    };

    const rows = movements.map((m) => {
      const performerName =
        m.performer?.admins?.[0]?.name ?? m.performer?.email ?? '—';
      const direction = movementDirection[m.movementType] ?? 'IN';
      const unitCost = Number(m.product.Baseprice);
      const absQty = Math.abs(m.quantityChanged);
      const totalCostImpact = +(unitCost * absQty).toFixed(2);

      return {
        id: m.id,
        date: m.createdAt.toISOString(),
        dateFormatted: m.createdAt.toISOString().slice(0, 10),
        timeFormatted: m.createdAt.toTimeString().slice(0, 8),
        movementType: m.movementType,
        movementLabel: movementLabel[m.movementType] ?? m.movementType,
        direction,
        product: {
          id: m.product.id,
          name: m.product.name,
          sku: m.product.sku ?? '—',
          barcodeId: m.product.barcodeId ?? '—',
        },
        location: {
          id: m.location.id,
          name: m.location.name,
          code: m.location.code,
        },
        previousQty: m.previousQuantity,
        quantityChanged: m.quantityChanged,
        currentQty: m.currentQuantity,
        unitCost,
        totalCostImpact,
        referenceType: m.referenceType,
        referenceId: m.referenceId,
        performedBy: performerName,
        notes: m.notes ?? '—',
      };
    });

    // Summary counters for the current page / full filtered set (use totals from DB)
    const [summaryAgg] = await prisma.$queryRaw<
      { totalIn: bigint; totalOut: bigint; totalRows: bigint }[]
    >`
      SELECT
        COALESCE(SUM(CASE WHEN "quantityChanged" > 0 THEN "quantityChanged" ELSE 0 END), 0)::bigint AS "totalIn",
        COALESCE(SUM(CASE WHEN "quantityChanged" < 0 THEN ABS("quantityChanged") ELSE 0 END), 0)::bigint AS "totalOut",
        COUNT(*)::bigint AS "totalRows"
      FROM stock_movements
      WHERE 1=1
        ${params.locationId ? Prisma.sql`AND "locationId" = ${params.locationId}` : Prisma.empty}
        ${params.productId ? Prisma.sql`AND "productId" = ${params.productId}` : Prisma.empty}
        ${params.movementType ? Prisma.sql`AND "movementType" = ${params.movementType}::"StockMovementType"` : Prisma.empty}
        ${params.startDate ? Prisma.sql`AND "createdAt" >= ${new Date(params.startDate + 'T00:00:00.000Z')}` : Prisma.empty}
        ${params.endDate ? Prisma.sql`AND "createdAt" <= ${new Date(params.endDate + 'T23:59:59.999Z')}` : Prisma.empty}
    `;

    return {
      data: rows,
      summary: {
        totalIn: Number(summaryAgg?.totalIn ?? 0),
        totalOut: Number(summaryAgg?.totalOut ?? 0),
        netChange: Number(summaryAgg?.totalIn ?? 0) - Number(summaryAgg?.totalOut ?? 0),
        totalTransactions: total,
      },
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getMovementReport(params: {
    startDate?: string;
    endDate?: string;
    locationId?: string;
    productId?: string;
    movementType?: any;
    page?: number;
    limit?: number;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.StockMovementWhereInput = {};

    if (params.locationId) where.locationId = params.locationId;
    if (params.productId) where.productId = params.productId;
    if (params.movementType) where.movementType = params.movementType;
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = new Date(params.startDate + 'T00:00:00.000Z');
      if (params.endDate) where.createdAt.lte = new Date(params.endDate + 'T23:59:59.999Z');
    }

    const [data, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          product: { select: { id: true, name: true, sku: true } },
          location: { select: { id: true, name: true, code: true } },
          performer: { select: { id: true, email: true } },
        },
      }),
      prisma.stockMovement.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getTransferReport(params: {
    startDate?: string;
    endDate?: string;
    sourceLocationId?: string;
    destinationLocationId?: string;
    status?: any;
    page?: number;
    limit?: number;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.StockTransferWhereInput = { deletedAt: null };

    if (params.sourceLocationId)
      where.sourceLocationId = params.sourceLocationId;
    if (params.destinationLocationId)
      where.destinationLocationId = params.destinationLocationId;
    if (params.status) where.status = params.status;
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = new Date(params.startDate + 'T00:00:00.000Z');
      if (params.endDate) where.createdAt.lte = new Date(params.endDate + 'T23:59:59.999Z');
    }

    const [data, total] = await Promise.all([
      prisma.stockTransfer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          sourceLocation: { select: { id: true, name: true } },
          destinationLocation: { select: { id: true, name: true } },
          creator: { select: { id: true, email: true } },
        },
      }),
      prisma.stockTransfer.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getDamageReport(params: {
    startDate?: string;
    endDate?: string;
    locationId?: string;
    reason?: any;
    page?: number;
    limit?: number;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.DamageWhereInput = { deletedAt: null };

    if (params.locationId) where.locationId = params.locationId;
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = new Date(params.startDate + 'T00:00:00.000Z');
      if (params.endDate) where.createdAt.lte = new Date(params.endDate + 'T23:59:59.999Z');
    }
    if (params.reason) {
      where.items = {
        some: { reason: params.reason },
      };
    }

    const [data, total] = await Promise.all([
      prisma.damage.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          location: { select: { id: true, name: true } },
          creator: { select: { id: true, email: true } },
          items: {
            include: {
              product: {
                select: { id: true, name: true, sku: true, Baseprice: true },
              },
            },
          },
        },
      }),
      prisma.damage.count({ where }),
    ]);

    // Format output including total cost loss calculations
    const formatted = data.map((d) => {
      const itemsTotalLoss = d.items.reduce(
        (sum, item) => sum + item.quantity * item.product.Baseprice,
        0,
      );
      return {
        ...d,
        totalLossValuation: Number(itemsTotalLoss.toFixed(2)),
      };
    });

    return {
      data: formatted,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getAdjustmentReport(params: {
    startDate?: string;
    endDate?: string;
    locationId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.StockAdjustmentWhereInput = { deletedAt: null };
    if (params.locationId) where.locationId = params.locationId;
    if (params.status) where.status = params.status as any;
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate)
        (where.createdAt as any).gte = new Date(params.startDate + 'T00:00:00.000Z');
      if (params.endDate)
        (where.createdAt as any).lte = new Date(params.endDate + 'T23:59:59.999Z');
    }

    const [data, total] = await Promise.all([
      prisma.stockAdjustment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          location: { select: { id: true, name: true } },
          creator: { select: { id: true, email: true } },
          items: {
            include: {
              product: {
                select: { id: true, name: true, sku: true, Baseprice: true },
              },
            },
          },
        },
      }),
      prisma.stockAdjustment.count({ where }),
    ]);

    const formatted = data.map((adj) => {
      const totalAdded = adj.items.reduce(
        (s, i) => (i.quantityChanged > 0 ? s + i.quantityChanged : s),
        0,
      );
      const totalRemoved = adj.items.reduce(
        (s, i) => (i.quantityChanged < 0 ? s + Math.abs(i.quantityChanged) : s),
        0,
      );
      return {
        id: adj.id,
        adjustmentNumber: (adj as any).adjustmentNumber ?? null,
        status: adj.status,
        reason: (adj as any).reason ?? null,
        locationId: adj.locationId,
        locationName: adj.location.name,
        totalItemLines: adj.items.length,
        totalAdded,
        totalRemoved,
        createdBy: adj.creator?.email ?? null,
        createdAt: adj.createdAt,
        items: adj.items.map((i) => ({
          productName: i.product.name,
          sku: i.product.sku,
          quantityChanged: i.quantityChanged,
          reason: (i as any).reason ?? null,
        })),
      };
    });

    return {
      data: formatted,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getInventoryDashboardSummary() {
    const [
      stocks,
      lowStockResult,
      recentMovements,
      activePOCount,
      activeTransferCount,
      locationCount,
      pendingAdjCount,
      pendingDamageCount,
    ] = await Promise.all([
      prisma.stock.findMany({
        where: { deletedAt: null },
        include: {
          product: { select: { Baseprice: true, finalPrice: true } },
        },
      }),
      this.getLowStockAlerts({ page: 1, limit: 6 }),
      prisma.stockMovement.findMany({
        take: 6,
        orderBy: { createdAt: "desc" },
        include: {
          product: { select: { name: true, sku: true } },
          location: { select: { name: true } },
        },
      }),
      prisma.purchaseOrder.count({
        where: { deletedAt: null, status: { in: ["DRAFT", "PENDING"] } },
      }),
      prisma.stockTransfer.count({
        where: {
          deletedAt: null,
          status: { in: ["DRAFT", "PENDING", "APPROVED", "IN_TRANSIT"] },
        },
      }),
      prisma.location.count({ where: { deletedAt: null } }),
      prisma.stockAdjustment.count({
        where: { deletedAt: null, status: "DRAFT" },
      }),
      prisma.damage.count({ where: { deletedAt: null, status: "DRAFT" } }),
    ]);

    const totalUniqueProducts = new Set(stocks.map((s) => s.productId)).size;
    const totalPhysicalQuantity = stocks.reduce(
      (acc, s) => acc + s.quantity,
      0,
    );
    const totalReservedQuantity = stocks.reduce(
      (acc, s) => acc + s.reservedQuantity,
      0,
    );
    const totalValueCost = stocks.reduce(
      (acc, s) => acc + s.quantity * Number(s.product.Baseprice),
      0,
    );
    const totalValueRetail = stocks.reduce(
      (acc, s) => acc + s.quantity * Number(s.product.finalPrice),
      0,
    );

    return {
      summary: {
        totalUniqueProducts,
        totalPhysicalQuantity,
        totalReservedQuantity,
        availableQuantity: totalPhysicalQuantity - totalReservedQuantity,
        totalValueCost: +totalValueCost.toFixed(2),
        totalValueRetail: +totalValueRetail.toFixed(2),
        locationCount,
        activePOCount,
        activeTransferCount,
        lowStockCount: lowStockResult.meta.total,
        pendingAdjCount,
        pendingDamageCount,
      },
      recentMovements,
      topLowStockAlerts: lowStockResult.data,
    };
  }
}

export const stockService = new StockService();
