import { prisma } from '../../config/prisma.js';

export const getDashboardAnalyticsService = async (query: { month?: string; year?: string; startDate?: string; endDate?: string; }) => {
  let startDate: Date;
  let endDate: Date;

  if (query.startDate && query.endDate) {
    startDate = new Date(query.startDate);
    endDate = new Date(query.endDate);
    endDate.setHours(23, 59, 59, 999);
  } else if (query.month && query.year) {
    const year = parseInt(query.year);
    const month = parseInt(query.month) - 1; // 0-indexed
    startDate = new Date(year, month, 1);
    endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
  } else if (query.year) {
    const year = parseInt(query.year);
    startDate = new Date(year, 0, 1);
    endDate = new Date(year, 11, 31, 23, 59, 59, 999);
  } else {
    const year = new Date().getFullYear();
    const month = new Date().getMonth();
    startDate = new Date(year, month, 1);
    endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
  }

  const orders = await prisma.order.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    },
    select: {
      id: true,
      finalAmount: true,
      orderStatus: true,
      createdAt: true,
      orderItems: {
        select: {
          product: {
            select: {
              brand: { select: { id: true, name: true } },
              categories: { select: { category: { select: { id: true, name: true } } } }
            }
          }
        }
      }
    }
  });

  let totalRevenue = 0, totalOrders = 0;
  let pendingOrdersCount = 0, pendingOrdersRevenue = 0;
  let confirmedOrdersCount = 0, confirmedOrdersRevenue = 0;
  let deliveredOrdersCount = 0, deliveredOrdersRevenue = 0;

  for (const order of orders) {
    if (order.orderStatus !== 'CANCELLED') {
      totalRevenue += order.finalAmount;
      totalOrders += 1;
    }
    
    if (order.orderStatus === 'PENDING') {
      pendingOrdersCount += 1;
      pendingOrdersRevenue += order.finalAmount;
    } else if (order.orderStatus === 'CONFIRMED') {
      confirmedOrdersCount += 1;
      confirmedOrdersRevenue += order.finalAmount;
    } else if (order.orderStatus === 'DELIVERED') {
      deliveredOrdersCount += 1;
      deliveredOrdersRevenue += order.finalAmount;
    }
  }

  const durationDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  const isDaily = durationDays <= 31;

  const areaChartMap = new Map<string, { revenue: number; orders: number }>();
  
  if (isDaily) {
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const label = `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`;
      areaChartMap.set(label, { revenue: 0, orders: 0 });
    }
  } else {
    let tempDate = new Date(startDate);
    while (tempDate <= endDate) {
      const label = tempDate.toLocaleString('default', { month: 'short', year: durationDays > 365 ? '2-digit' : undefined });
      areaChartMap.set(label, { revenue: 0, orders: 0 });
      tempDate.setMonth(tempDate.getMonth() + 1);
    }
  }

  const categoryMap = new Map<string, number>();
  const brandMap = new Map<string, number>();

  for (const order of orders) {
    if (order.orderStatus === 'CANCELLED') continue;

    const d = order.createdAt;
    let label = '';
    if (isDaily) {
      label = `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`;
    } else {
       label = d.toLocaleString('default', { month: 'short', year: durationDays > 365 ? '2-digit' : undefined });
    }
    
    if (areaChartMap.has(label)) {
      const current = areaChartMap.get(label)!;
      current.revenue += order.finalAmount;
      current.orders += 1;
    }

    for (const item of order.orderItems) {
      const brandName = item.product.brand?.name || 'Unbranded';
      brandMap.set(brandName, (brandMap.get(brandName) || 0) + 1);

      if (item.product.categories && item.product.categories.length > 0) {
        for (const cat of item.product.categories) {
          const catName = cat.category.name;
          categoryMap.set(catName, (categoryMap.get(catName) || 0) + 1);
        }
      } else {
        categoryMap.set('Uncategorized', (categoryMap.get('Uncategorized') || 0) + 1);
      }
    }
  }

  const areaChartData = Array.from(areaChartMap.entries()).map(([name, data]) => ({
    name,
    revenue: parseFloat(data.revenue.toFixed(2)),
    orders: data.orders
  }));

  const colors = ["#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e", "#f59e0b", "#10b981", "#0ea5e9", "#6366f1", "#d946ef", "#f97316"];
  
  const formattedCategoryData = Array.from(categoryMap.entries()).sort((a,b)=>b[1]-a[1]).map(([name, value], i) => ({
    name,
    value,
    fill: colors[i % colors.length]
  })).slice(0, 10);

  const formattedBrandData = Array.from(brandMap.entries()).sort((a,b)=>b[1]-a[1]).map(([name, value], i) => ({
    name,
    value,
    fill: colors[(i + 5) % colors.length]
  })).slice(0, 10);

  return {
    cards: {
      totalRevenue,
      totalOrders,
      pendingOrdersCount,
      pendingOrdersRevenue,
      confirmedOrdersCount,
      confirmedOrdersRevenue,
      deliveredOrdersCount,
      deliveredOrdersRevenue,
    },
    areaChartData,
    categoryData: formattedCategoryData,
    brandData: formattedBrandData
  };
};
