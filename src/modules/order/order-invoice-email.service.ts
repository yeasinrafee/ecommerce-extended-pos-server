import { Job } from 'bullmq';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import sharp from 'sharp';
import { prisma } from '../../config/prisma.js';
import { createQueue, createWorker } from '../../common/services/mq.service.js';
import { emailService } from '../../common/services/email.service.js';
import { orderEmailTemplates } from './order.email-templates.js';
import { env } from '../../config/env.js';

type RGB = [number, number, number];

interface SelectedAttribute {
  attributeName: string;
  attributeValue: string;
}

interface InvoiceProduct {
  id: string;
  name: string;
  sku: string | null;
}

interface InvoiceOrderItem {
  id: string;
  quantity: number;
  Baseprice: number;
  finalPrice: number;
  discountType: string | null;
  discountValue: number | null;
  product: InvoiceProduct;
  selectedAttributes: SelectedAttribute[];
}

interface InvoiceOrderData {
  id: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingAddressLine: string;
  shippingPostCode: string;
  baseAmount: number;
  discountAmount: number;
  finalAmount: number;
  finalShippingCharge: number;
  totalWeight: number | null;
  deliveryTime: number | null;
  expectedDeliveryDate: Date | null;
  createdAt: Date;
  orderStatus: string;
  zoneName: string;
  zonePolicyName: string;
  orderItems: InvoiceOrderItem[];
}

interface CompanyData {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logo: string;
}

interface LogoData {
  b64: string;
  w: number;
  h: number;
}

interface OrderPlacedEmailJobData {
  orderId: string;
}

const COMPANY_DEFAULTS: CompanyData = {
  name: env.companyName,
  tagline: 'Premium Fashion & Lifestyle',
  address: 'House 12, Road 5, Mirpur-10, Dhaka-1216, Bangladesh',
  phone: '+880 1700-000000',
  email: 'support@zayrah.com',
  website: env.companyWebsite,
  logo: '/logo.png',
};

const STATUS_COLOR: Record<string, RGB> = {
  PENDING: [234, 179, 8],
  CONFIRMED: [59, 130, 246],
  PROCESSING: [168, 85, 247],
  SHIPPED: [20, 184, 166],
  DELIVERED: [22, 163, 74],
  CANCELLED: [239, 68, 68],
};

const C: Record<string, RGB> = {
  hdr: [15, 23, 42],
  accent: [99, 102, 241],
  dark: [15, 23, 42],
  muted: [100, 116, 139],
  light: [241, 245, 249],
  white: [255, 255, 255],
  border: [226, 232, 240],
};

const fmt = (n: number) =>
  `£${Number(n).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtDate = (value: string | Date | null | undefined) => {
  if (!value) return 'N/A';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';

  return date.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const shortId = (id: string) => id.slice(0, 8).toUpperCase();

const fetchLogo = async (src: string): Promise<LogoData | null> => {
  if (!src || !/^https?:\/\//i.test(src)) {
    return null;
  }

  try {
    const response = await fetch(src);
    if (!response.ok) {
      return null;
    }

    const imageArrayBuffer = await response.arrayBuffer();
    const input = Buffer.from(imageArrayBuffer);
    const pngBuffer = await sharp(input).png().toBuffer();
    const metadata = await sharp(pngBuffer).metadata();

    if (!metadata.width || !metadata.height) {
      return null;
    }

    return {
      b64: `data:image/png;base64,${pngBuffer.toString('base64')}`,
      w: metadata.width,
      h: metadata.height,
    };
  } catch {
    return null;
  }
};

const toSelectedAttributes = (variations: Array<{ productVariation: { attribute: { name: string } | null; attributeValue: string } | null }>) => {
  return variations
    .map((variation) => {
      const attribute = variation.productVariation?.attribute;
      const attributeValue = variation.productVariation?.attributeValue;

      if (!attribute || !attributeValue) {
        return null;
      }

      return {
        attributeName: attribute.name,
        attributeValue,
      };
    })
    .filter((item): item is SelectedAttribute => item !== null);
};

const getOrderForInvoice = async (orderId: string): Promise<InvoiceOrderData> => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: {
        include: {
          user: true,
        },
      },
      address: {
        include: {
          zone: {
            include: {
              zonePolicies: {
                include: {
                  zonePolicy: true,
                },
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
    throw new Error(`Order not found for invoice: ${orderId}`);
  }

  const zonePolicy = order.address?.zone?.zonePolicies?.[0]?.zonePolicy;

  let expectedDeliveryDate = order.expectedDeliveryDate;
  if (!expectedDeliveryDate && zonePolicy?.deliveryTime) {
    const fallback = new Date(order.createdAt);
    fallback.setDate(fallback.getDate() + Math.ceil(zonePolicy.deliveryTime));
    expectedDeliveryDate = fallback;
  }

  return {
    id: order.id,
    customerName: order.customerName,
    customerEmail: order.customerEmail ?? order.customer.user.email,
    customerPhone: order.customerPhone,
    shippingAddressLine: [order.address.flatNumber, order.address.streetAddress]
      .filter(Boolean)
      .join(', '),
    shippingPostCode: order.address.postCode ?? '',
    baseAmount: order.baseAmount,
    discountAmount: order.discountAmount,
    finalAmount: order.finalAmount,
    finalShippingCharge: order.finalShippingCharge,
    totalWeight: order.totalWeight,
    deliveryTime: order.deliveryTime,
    expectedDeliveryDate,
    createdAt: order.createdAt,
    orderStatus: order.orderStatus,
    zoneName: order.address?.zone?.name ?? 'N/A',
    zonePolicyName: zonePolicy?.policyName ?? 'N/A',
    orderItems: order.orderItems.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      Baseprice: item.Baseprice,
      finalPrice: item.finalPrice,
      discountType: item.discountType,
      discountValue: item.discountValue,
      product: {
        id: item.product.id,
        name: item.product.name,
        sku: item.product.sku ?? '-',
      },
      selectedAttributes: toSelectedAttributes(item.variations),
    })),
  };
};

const resolveCompanyData = async (): Promise<CompanyData> => {
  const companyInfo = await prisma.companyInformation.findFirst();

  return {
    name: COMPANY_DEFAULTS.name,
    tagline: COMPANY_DEFAULTS.tagline,
    address: companyInfo?.address ?? COMPANY_DEFAULTS.address,
    phone: companyInfo?.phone ?? COMPANY_DEFAULTS.phone,
    email: companyInfo?.email ?? COMPANY_DEFAULTS.email,
    website: COMPANY_DEFAULTS.website,
    logo: companyInfo?.logo ?? COMPANY_DEFAULTS.logo,
  };
};

const generateInvoicePdfBuffer = async (
  order: InvoiceOrderData,
  company: CompanyData,
): Promise<Buffer> => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 15;
  const HH = 46;

  const logo = await fetchLogo(company.logo);

  doc.setFillColor(...C.hdr);
  doc.rect(0, 0, PW, HH, 'F');
  doc.setFillColor(...C.accent);
  doc.rect(0, HH - 0.8, PW, 0.8, 'F');

  const BOX = 30;
  if (logo) {
    const r = logo.w / logo.h;
    let lw = BOX;
    let lh = BOX;
    if (r > 1) {
      lh = BOX / r;
    } else {
      lw = BOX * r;
    }
    doc.addImage(logo.b64, 'PNG', M, (HH - lh) / 2, lw, lh);
  } else {
    const initials = company.name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    doc.setTextColor(...C.white);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(initials, M + 15, HH / 2 + 3, { align: 'center' });
  }

  doc.setTextColor(...C.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(company.name, PW - M, 14, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(180, 190, 210);
  doc.text(company.tagline, PW - M, 20, { align: 'right' });
  doc.text(company.address, PW - M, 26.5, { align: 'right' });
  doc.text(`${company.phone}  ·  ${company.email}`, PW - M, 33, {
    align: 'right',
  });
  doc.text(company.website, PW - M, 39.5, { align: 'right' });

  let y = HH + 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(...C.dark);
  doc.text('INVOICE', M, y);
  doc.setDrawColor(...C.accent);
  doc.setLineWidth(0.9);
  doc.line(M, y + 2.5, M + 43, y + 2.5);

  const dotClr: RGB = STATUS_COLOR[order.orderStatus] ?? C.muted;
  const statusLabel =
    order.orderStatus.charAt(0) + order.orderStatus.slice(1).toLowerCase();
  doc.setFillColor(...dotClr);
  doc.circle(M + 49, y - 2.5, 2.2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...dotClr);
  doc.text(statusLabel, M + 53.5, y - 1);

  const mX = PW - M;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.muted);
  doc.text('Invoice No:', mX - 52, y - 8);
  doc.text('Order Date:', mX - 52, y - 2);
  doc.text('Expected Delivery:', mX - 52, y + 4);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.dark);
  doc.text(`#${shortId(order.id)}`, mX, y - 8, { align: 'right' });
  doc.text(fmtDate(order.createdAt), mX, y - 2, { align: 'right' });
  doc.text(fmtDate(order.expectedDeliveryDate), mX, y + 4, { align: 'right' });

  y += 13;
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.25);
  doc.line(M, y, PW - M, y);
  y += 8;

  const cW = (PW - 2 * M - 8) / 2;
  const drawCard = (cx: number, title: string, bg: RGB) => {
    doc.setFillColor(...C.light);
    doc.roundedRect(cx, y, cW, 34, 2, 2, 'F');
    doc.setFillColor(...bg);
    doc.roundedRect(cx, y, cW, 7.5, 2, 2, 'F');
    doc.rect(cx, y + 4.5, cW, 3, 'F');
    doc.setTextColor(...C.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(title, cx + 5, y + 5.3);
  };

  drawCard(M, 'BILL TO', C.hdr);
  doc.setTextColor(...C.dark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(order.customerName || 'N/A', M + 5, y + 14.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.muted);
  doc.text(order.customerEmail || '—', M + 5, y + 21);
  doc.text(order.customerPhone || '—', M + 5, y + 27.5);

  const cX2 = M + cW + 8;
  drawCard(cX2, 'SHIP TO', [51, 65, 85]);
  doc.setTextColor(...C.dark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(order.zoneName || 'N/A', cX2 + 5, y + 14.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.muted);
  doc.text(order.shippingAddressLine || '—', cX2 + 5, y + 21);
  doc.text(`Post Code: ${order.shippingPostCode}`, cX2 + 5, y + 27.5);

  y += 42;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...C.dark);
  doc.text('Order Items', M, y);
  y += 4;

  const rows = order.orderItems.map((item, idx) => {
    const attrs =
      item.selectedAttributes.length > 0
        ? item.selectedAttributes
            .map((a) => `${a.attributeName}: ${a.attributeValue}`)
            .join(', ')
        : '—';

    return [
      idx + 1,
      item.product?.name ?? '—',
      item.product?.sku ?? '—',
      item.quantity,
      fmt(item.Baseprice),
      item.discountType && item.discountType !== 'NONE'
        ? `${item.discountValue ?? 0}`
        : '—',
      attrs,
      fmt(item.finalPrice * item.quantity),
    ];
  });

  const renderAutoTable = autoTable as unknown as (
    inputDoc: jsPDF,
    options: Record<string, unknown>,
  ) => void;

  renderAutoTable(doc, {
    startY: y,
    head: [
      [
        '#',
        'Product',
        'SKU',
        'Qty',
        'Unit Price',
        'Discount',
        'Attributes',
        'Total',
      ],
    ],
    body: rows,
    margin: { left: M, right: M },
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
      textColor: C.dark,
      lineColor: C.border,
      lineWidth: 0.2,
      valign: 'middle',
    },
    headStyles: {
      fillColor: C.hdr,
      textColor: C.white,
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 45, halign: 'left' },
      2: { cellWidth: 22, halign: 'left' },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 22, halign: 'center' },
      5: { cellWidth: 18, halign: 'center' },
      6: { cellWidth: 30, halign: 'center' },
      7: { cellWidth: 22, halign: 'center' },
    },
  });

  y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
    ?.finalY
    ? ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY as number) + 8
    : y + 8;

  const sX = PW - M - 78;
  const sW = 78;
  const rH = 8;
  const sumRows: [string, string][] = [
    ['Subtotal', fmt(order.baseAmount)],
    ['Shipping', fmt(order.finalShippingCharge)],
    [
      'Discount',
      order.discountAmount > 0 ? `-${fmt(order.discountAmount)}` : '—',
    ],
  ];
  doc.setFillColor(...C.light);
  doc.roundedRect(sX, y, sW, rH * sumRows.length + rH + 4, 2, 2, 'F');
  let sy = y + 7;
  sumRows.forEach(([l, v]) => {
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.muted);
    doc.text(l, sX + 5, sy);
    doc.setTextColor(...C.dark);
    doc.text(v, sX + sW - 5, sy, { align: 'right' });
    sy += rH;
  });
  doc.setFillColor(...C.hdr);
  doc.roundedRect(sX, sy - 2, sW, rH + 3, 2, 2, 'F');
  doc.rect(sX, sy - 2, sW, 3, 'F');
  doc.setTextColor(...C.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('TOTAL', sX + 5, sy + 4.5);
  doc.text(fmt(order.finalAmount), sX + sW - 5, sy + 4.5, { align: 'right' });

  y = sy + rH + 10;

  doc.setFillColor(...C.light);
  doc.roundedRect(M, y, PW - 2 * M, 16, 2, 2, 'F');
  const infoItems: [string, string][] = [
    ['Delivery Zone', order.zoneName || '—'],
    ['Delivery Time', `${Math.ceil(order.deliveryTime ?? 0)} Days`],
    ['Zone Policy', order.zonePolicyName || '—'],
    ['Total Weight', `${order.totalWeight ?? 0} g`],
  ];
  const iW = (PW - 2 * M) / infoItems.length;
  infoItems.forEach(([l, v], i) => {
    const ix = M + i * iW + iW / 2;
    doc.setTextColor(...C.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(l, ix, y + 6, { align: 'center' });
    doc.setTextColor(...C.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(v, ix, y + 12, { align: 'center' });
  });

  y += 24;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.muted);
  doc.text(
    `Thank you for shopping with ${company.name}! For any queries, please contact our support team.`,
    PW / 2,
    y,
    { align: 'center' },
  );

  const fY = PH - 11;
  doc.setFillColor(...C.hdr);
  doc.rect(0, fY, PW, 11, 'F');
  doc.setFillColor(...C.accent);
  doc.rect(0, fY, PW, 0.8, 'F');
  doc.setTextColor(180, 190, 210);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(
    `${company.name}  ·  ${company.website}  ·  ${company.phone}  ·  Generated on ${new Date().toLocaleDateString('en-GB')}`,
    PW / 2,
    fY + 7,
    { align: 'center' },
  );

  const bytes = doc.output('arraybuffer');
  return Buffer.from(bytes);
};

const sendOrderPlacedEmailWithInvoice = async (orderId: string): Promise<void> => {
  const [order, company] = await Promise.all([
    getOrderForInvoice(orderId),
    resolveCompanyData(),
  ]);

  if (!order.customerEmail) {
    return;
  }

  const pdfBuffer = await generateInvoicePdfBuffer(order, company);

  await emailService.sendEmail({
    to: order.customerEmail,
    subject: 'Order Placed Successfully',
    html: orderEmailTemplates.orderPlaced(order.customerName, order.finalAmount),
    attachments: [
      {
        filename: `Invoice_${shortId(order.id)}_${new Date().toISOString().slice(0, 10)}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
};

export const orderEmailQueue = createQueue('orderEmailQueue', { verify: true });

export const orderEmailWorker = createWorker(
  'orderEmailQueue',
  async (job: Job) => {
    if (job.name !== 'sendOrderPlacedEmailWithInvoice') {
      return;
    }

    const data = job.data as OrderPlacedEmailJobData;
    await sendOrderPlacedEmailWithInvoice(data.orderId);
  },
  3,
  { verify: true },
);
