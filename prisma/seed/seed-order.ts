import bcrypt from "bcryptjs";
import { prisma } from "../../src/config/prisma.js";
import { DiscountType, OrderStatus, Role, Status, StockStatus } from "@prisma/client";

async function main() {
  console.log("Starting order seed...");

  // 1. Create a Zone
  const zone = await prisma.zone.upsert({
    where: { name: "Dhaka" },
    update: {},
    create: { name: "Dhaka" },
  });

  const brandNames = ["Acme", "Nimbus", "Orion"];
  const brands = [] as any[];
  for (const name of brandNames) {
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const b = await prisma.brand.upsert({
      where: { name },
      update: {},
      create: { name, slug }
    });
    brands.push(b);
  }

  const categoryNames = ["Electronics", "Home", "Outdoors"];
  const categories = [] as any[];
  for (const name of categoryNames) {
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const c = await prisma.productCategory.upsert({
      where: { slug },
      update: {},
      create: { name, slug }
    });
    categories.push(c);
  }

  // 2. Create Products (assign random brand and category)
  const products = [];
  for (let i = 1; i <= 10; i++) {
    const basePrice = 100 * i;
    const discountValue = i % 2 === 0 ? 10 : 0;
    const discountType = i % 2 === 0 ? DiscountType.PERCENTAGE_DISCOUNT : DiscountType.NONE;
    const finalPrice = discountType === DiscountType.PERCENTAGE_DISCOUNT 
      ? basePrice * (1 - discountValue / 100) 
      : basePrice;
    // pick a brand and category
    const brand = brands[i % brands.length];
    const category = categories[i % categories.length];

    const p = await prisma.product.upsert({
      where: { sku: `sku-prod-${i}` },
      update: {},
      create: {
        name: `Product ${i}`,
        slug: `product-${i}`,
        Baseprice: basePrice,
        finalPrice: finalPrice,
        discountType: discountType,
        discountValue: discountValue,
        stock: 50,
        sku: `sku-prod-${i}`,
        status: Status.ACTIVE,
        stockStatus: StockStatus.IN_STOCK,
        brandId: brand.id,
        categories: {
          create: [
            {
              category: {
                connect: { id: category.id }
              }
            }
          ]
        }
      },
    });
    products.push(p);
  }

  // 3. Create Customers and Orders
  const customerData = [
    { email: "john@example.com", name: "John Doe", phone: "1234567890" },
    { email: "jane@example.com", name: "Jane Smith", phone: "0987654321" },
    { email: "bob@example.com", name: "Bob Wilson", phone: "1122334455" },
  ];

  const hashed = await bcrypt.hash("12345678", 12);

  for (let c = 0; c < customerData.length; c++) {
    const data = customerData[c];
    
    // Create User
    const user = await prisma.user.upsert({
      where: { email: data.email },
      update: {},
      create: {
        email: data.email,
        password: hashed,
        role: Role.CUSTOMER,
        verified: true,
      },
    });

    // Create Customer profile
    const customer = await prisma.customer.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        phone: data.phone,
        status: Status.ACTIVE,
      },
    });

    // Create Address
    const address = await prisma.address.create({
      data: {
        customerId: customer.id,
        zoneId: zone.id,
        postCode: "1200",
        streetAddress: `${100 + c} main street`,
      },
    });

    // Create 2 orders for each person — ensure one order in March 2026 and the other in a different month
    for (let o = 1; o <= 2; o++) {
      // Pick 3-5 random products
      const orderProductCount = 3 + Math.floor(Math.random() * 3);
      const shuffled = [...products].sort(() => 0.5 - Math.random());
      const selectedProducts = shuffled.slice(0, orderProductCount);

      // Generate a placement date in 2026. One order will be in March (month index 2),
      // the other will be in one of a few other selected months.
      const targetYear = 2026;
      const monthsPool = [0, 2, 3, 6, 10]; // Jan, Mar, Apr, Jul, Nov (0-based)
      const marchIndex = 2;
      const otherMonths = monthsPool.filter((m) => m !== marchIndex);
      const month = o === 1 ? marchIndex : otherMonths[(c + o) % otherMonths.length];
      const day = 1 + Math.floor(Math.random() * 28);
      const hour = Math.floor(Math.random() * 24);
      const minute = Math.floor(Math.random() * 60);
      const orderDate = new Date(targetYear, month, day, hour, minute, 0);

      // track used months for logging later
      if (typeof globalThis.__seedUsedMonths === 'undefined') {
        // attach to global to persist across loop iterations in some runtimes
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        globalThis.__seedUsedMonths = new Set<number>();
      }
      // @ts-ignore
      globalThis.__seedUsedMonths.add(month);

      let baseAmount = 0;
      const orderItemsData = selectedProducts.map(p => {
        const qty = 1 + Math.floor(Math.random() * 2);
        baseAmount += p.finalPrice * qty;
        return {
          productId: p.id,
          quantity: qty,
          Baseprice: p.Baseprice,
          finalPrice: p.finalPrice,
          discountType: p.discountType,
          discountValue: p.discountValue,
          createdAt: orderDate,
          updatedAt: orderDate,
        };
      });

      const shippingCharge = 50;
      const finalAmount = baseAmount + shippingCharge;

      await prisma.order.create({
        data: {
          customerId: customer.id,
          customerName: data.name,
          customerEmail: data.email,
          customerPhone: data.phone,
          addressId: address.id,
          baseAmount: baseAmount,
          discountType: DiscountType.NONE,
          discountValue: 0,
          discountAmount: 0,
          finalAmount: finalAmount,
          baseShippingCharge: shippingCharge,
          finalShippingCharge: shippingCharge,
          orderStatus: OrderStatus.PENDING,
          createdAt: orderDate,
          updatedAt: orderDate,
          orderItems: {
            create: orderItemsData
          }
        }
      });
    }
    console.log(`Created user, customer, address and 2 orders for ${data.email}`);
  }

  console.log("Seed completed successfully");
  // Print which months were used (human-friendly)
  // @ts-ignore
  const usedSet: Set<number> = globalThis.__seedUsedMonths ?? new Set<number>();
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const usedNames = Array.from(usedSet).sort((a,b)=>a-b).map(m=>monthNames[m]);
  console.log("Orders were created for months:", usedNames.join(', '));
}

main()
  .catch((err) => {
    console.error("seed error", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
