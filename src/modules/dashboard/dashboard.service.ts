import { prisma } from '../../config/prisma.js';
import { OrderStatus } from '@prisma/client';

function buildDateRange(query: {
  month?: string;
  year?: string;
  startDate?: string;
  endDate?: string;
}) {
  let startDate: Date;
  let endDate: Date;

  if (query.startDate && query.endDate) {
    startDate = new Date(query.startDate);
    endDate = new Date(query.endDate);
    endDate.setHours(23, 59, 59, 999);
  } else if (query.month && query.year) {
    const y = parseInt(query.year);
    const m = parseInt(query.month) - 1;
    startDate = new Date(y, m, 1);
    endDate = new Date(y, m + 1, 0, 23, 59, 59, 999);
  } else if (query.year) {
    const y = parseInt(query.year);
    startDate = new Date(y, 0, 1);
    endDate = new Date(y, 11, 31, 23, 59, 59, 999);
  } else {
    const now = new Date();
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  return { startDate, endDate };
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#f97316', '#0ea5e9', '#6366f1'];

export const getDashboardAnalyticsService = async (query: {
  month?: string;
  year?: string;
  startDate?: string;
  endDate?: string;
}) => {
  const { startDate, endDate } = buildDateRange(query);
  const dateFilter = { gte: startDate, lte: endDate };
  const durationDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  const isDaily = durationDays <= 31;

  const [webOrders, posOrders, stockRows, lowStockConfigs, topPosItems] = await Promise.all([
    // Web orders — only what's needed
    prisma.order.findMany({
      where: { createdAt: dateFilter },
      select: {
        finalAmount: true,
        orderStatus: true,
        createdAt: true,
        orderItems: {
          select: {
            quantity: true,
            product: { select: { categories: { select: { category: { select: { name: true } } } } } },
          },
        },
      },
    }),

    // POS orders
    prisma.posOrder.findMany({
      where: { createdAt: dateFilter, deletedAt: null },
      select: {
        finalAmount: true,
        paidAmount: true,
        createdAt: true,
        posOrderItems: {
          select: {
            quantity: true,
            finalPrice: true,
            product: {
              select: {
                id: true,
                name: true,
                categories: { select: { category: { select: { name: true } } } },
              },
            },
          },
        },
      },
    }),

    // Current stock (not date-filtered — always latest)
    prisma.stock.aggregate({ where: { deletedAt: null }, _sum: { quantity: true } }),

    // Low stock alerts
    prisma.lowStockConfig.findMany({
      where: { deletedAt: null },
      select: {
        minimumQuantity: true,
        product: {
          select: {
            id: true,
            name: true,
            stocks: { where: { deletedAt: null }, select: { quantity: true } },
          },
        },
      },
    }),

    // Top selling products by POS (groupBy in memory — avoid extra query)
    Promise.resolve(null),
  ]);

  // ── Summary cards ───────────────────────────────────────────────────────

  const activeWebOrders = webOrders.filter(o => o.orderStatus !== OrderStatus.RETURNED);
  const webRevenue = activeWebOrders.reduce((s, o) => s + o.finalAmount, 0);

  const posRevenue = posOrders.reduce((s, o) => s + o.finalAmount, 0);
  const posDue = posOrders.reduce((s, o) => s + Math.max(0, o.finalAmount - o.paidAmount), 0);

  const totalRevenue = webRevenue + posRevenue;
  const totalOrders = activeWebOrders.length + posOrders.length;

  const totalStock = stockRows._sum.quantity ?? 0;

  const lowStockAlerts = lowStockConfigs
    .map(cfg => {
      const currentQty = cfg.product.stocks.reduce((s, st) => s + st.quantity, 0);
      return { productId: cfg.product.id, name: cfg.product.name, currentQty, minQty: cfg.minimumQuantity };
    })
    .filter(a => a.currentQty <= a.minQty)
    .sort((a, b) => a.currentQty - b.currentQty)
    .slice(0, 10);

  // ── Timeline chart (line/bar) ────────────────────────────────────────────

  type Slot = { posRevenue: number; webRevenue: number; orders: number };
  const timeline = new Map<string, Slot>();

  function getLabel(date: Date): string {
    if (isDaily) return `${date.getDate()} ${date.toLocaleString('default', { month: 'short' })}`;
    return date.toLocaleString('default', { month: 'short', year: durationDays > 365 ? '2-digit' : undefined });
  }

  // Pre-fill skeleton so chart has no gaps
  if (isDaily) {
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      timeline.set(getLabel(new Date(d)), { posRevenue: 0, webRevenue: 0, orders: 0 });
    }
  } else {
    let t = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const last = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    while (t <= last) {
      timeline.set(getLabel(t), { posRevenue: 0, webRevenue: 0, orders: 0 });
      t.setMonth(t.getMonth() + 1);
    }
  }

  for (const o of activeWebOrders) {
    const slot = timeline.get(getLabel(o.createdAt));
    if (slot) { slot.webRevenue += o.finalAmount; slot.orders += 1; }
  }
  for (const o of posOrders) {
    const slot = timeline.get(getLabel(o.createdAt));
    if (slot) { slot.posRevenue += o.finalAmount; slot.orders += 1; }
  }

  const timelineChart = Array.from(timeline.entries()).map(([name, d]) => ({
    name,
    posRevenue: +d.posRevenue.toFixed(2),
    webRevenue: +d.webRevenue.toFixed(2),
    totalRevenue: +(d.posRevenue + d.webRevenue).toFixed(2),
    orders: d.orders,
  }));

  // ── Category pie (POS only) ───────────────────────────────────────────────

  const catMap = new Map<string, number>();

  // POS only (web reserved for future)
  for (const o of posOrders)
    for (const item of o.posOrderItems)
      for (const c of item.product.categories)
        catMap.set(c.category.name, (catMap.get(c.category.name) ?? 0) + item.quantity);

  const categoryPie = Array.from(catMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }));

  // ── Top selling products (POS) ────────────────────────────────────────────

  const productSalesMap = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const o of posOrders) {
    for (const item of o.posOrderItems) {
      const pid = item.product.id;
      const existing = productSalesMap.get(pid);
      if (existing) {
        existing.qty += item.quantity;
        existing.revenue += item.finalPrice;
      } else {
        productSalesMap.set(pid, {
          name: item.product.name,
          qty: item.quantity,
          revenue: item.finalPrice,
        });
      }
    }
  }

  const topSellingProducts = Array.from(productSalesMap.entries())
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 5)
    .map(([productId, d], i) => ({
      rank: i + 1,
      productId,
      name: d.name,
      qtySold: d.qty,
      revenue: +d.revenue.toFixed(2),
    }));

  const totalProductsSold = productSalesMap.size; // unique products sold in period

  // ────────────────────────────────────────────────────────────────────────

  return {
    dateRange: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },

    cards: {
      totalRevenue:      +totalRevenue.toFixed(2),
      posRevenue:        +posRevenue.toFixed(2),
      // webRevenue:       +webRevenue.toFixed(2),   // reserved for future
      posDue:            +posDue.toFixed(2),
      totalOrders,
      posOrders:         posOrders.length,
      // webOrders:        activeWebOrders.length,   // reserved for future
      totalProductsSold, // unique products sold (POS)
      totalStock,
      lowStockCount:     lowStockAlerts.length,
    },

    timelineChart,        // bar chart (POS only for now)
    categoryPie,          // top 5 categories pie
    topSellingProducts,   // top 5 products table
    lowStockAlerts,       // low stock list
  };
};
