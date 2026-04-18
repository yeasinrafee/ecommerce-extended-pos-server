import { env } from '../../config/env.js';

const baseStyle = `
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
  border: 1px solid #e1e1e1;
  border-radius: 8px;
`;

const headerStyle = `
  text-align: center;
  padding-bottom: 20px;
`;

const bodyStyle = `
  padding: 20px;
  background-color: #f8f9fa;
  border-radius: 6px;
`;

const summaryBoxStyle = (borderColor: string) => `
  margin: 20px 0;
  padding: 15px;
  background-color: #ffffff;
  border-left: 4px solid ${borderColor};
  border-radius: 4px;
`;

const footerStyle = `
  text-align: center;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #eeeeee;
  font-size: 12px;
  color: #999;
`;

const layout = (title: string, content: string) => `
  <div style="${baseStyle}">
    <div style="${headerStyle}">
      <h1 style="color: #007bff; margin: 0;">${title}</h1>
    </div>
    <div style="${bodyStyle}">
      ${content}
    </div>
    <div style="${footerStyle}">
      <p style="margin: 0;">For more details, visit <a href="https://${env.companyWebsite}" style="color: #007bff; text-decoration: none;">${env.companyWebsite}</a>.</p>
      <p style="margin: 5px 0 0 0;">&copy; ${new Date().getFullYear()} ${env.companyName}. All rights reserved.</p>
    </div>
  </div>
`;

export const orderEmailTemplates = {
  orderPlaced: (customerName: string, amount: number) => {
    const content = `
      <p style="font-size: 16px; color: #333; margin-top: 0;">Dear <strong>${customerName}</strong>,</p>
      <p style="font-size: 14px; color: #555; line-height: 1.5;">
        Thank you for your order! Your order has been successfully placed and is currently <strong>Pending</strong>. Our team will review and confirm it shortly.
      </p>
      <div style="${summaryBoxStyle('#f39c12')}">
        <p style="margin: 0; font-size: 14px; color: #333;"><strong>Order Status:</strong> Pending</p>
        <p style="margin: 5px 0 0 0; font-size: 14px; color: #333;"><strong>Total Amount:</strong> $${amount}</p>
      </div>
      <p style="font-size: 14px; color: #555; line-height: 1.5;">
        We will send you another update once your order has been confirmed and is ready for shipping.
      </p>
    `;
    return layout('Order Placed!', content);
  },

  orderConfirmed: (customerName: string, amount: number) => {
    const content = `
      <p style="font-size: 16px; color: #333; margin-top: 0;">Hi <strong>${customerName}</strong>,</p>
      <p style="font-size: 14px; color: #555; line-height: 1.5;">
        Great news! Your order has been <strong>Confirmed</strong> and is now being processed by our warehouse team.
      </p>
      <div style="${summaryBoxStyle('#28a745')}">
        <p style="margin: 0; font-size: 14px; color: #333;"><strong>Order Status:</strong> Confirmed</p>
        <p style="margin: 5px 0 0 0; font-size: 14px; color: #333;"><strong>Total Amount:</strong> $${amount}</p>
      </div>
    `;
    return layout('Order Confirmed!', content);
  },

  orderShipped: (customerName: string, trackingNumber?: string) => {
    const content = `
      <p style="font-size: 16px; color: #333; margin-top: 0;">Hi <strong>${customerName}</strong>,</p>
      <p style="font-size: 14px; color: #555; line-height: 1.5;">
        Exciting news! Your order is shipped and on its way.
      </p>
      <p style="font-size: 14px; color: #555; line-height: 1.5;">
        You can expect your delivery soon.
      </p>
    `;
    return layout('Order Shipped!', content);
  },

  orderDelivered: (customerName: string) => {
    const content = `
      <p style="font-size: 16px; color: #333; margin-top: 0;">Hi <strong>${customerName}</strong>,</p>
      <p style="font-size: 14px; color: #555; line-height: 1.5;">
        Your order has been <strong>Delivered</strong>! We hope you love your purchase.
      </p>
      <div style="${summaryBoxStyle('#28a745')}">
        <p style="margin: 0; font-size: 14px; color: #333;"><strong>Order Status:</strong> Delivered</p>
      </div>
      <p style="font-size: 14px; color: #555; line-height: 1.5;">
        Thank you for choosing our service!
      </p>
    `;
    return layout('Order Delivered!', content);
  },

  orderCancelled: (customerName: string, reason?: string) => {
    const content = `
      <p style="font-size: 16px; color: #333; margin-top: 0;">Hi <strong>${customerName}</strong>,</p>
      <p style="font-size: 14px; color: #555; line-height: 1.5;">
        Your order has been <strong>Cancelled</strong>.
      </p>
      <div style="${summaryBoxStyle('#dc3545')}">
        <p style="margin: 0; font-size: 14px; color: #333;"><strong>Order Status:</strong> Cancelled</p>
        ${reason ? `<p style="margin: 5px 0 0 0; font-size: 14px; color: #333;"><strong>Reason:</strong> ${reason}</p>` : ''}
      </div>
      <p style="font-size: 14px; color: #555; line-height: 1.5;">
        If this was unexpected or if you have any questions, please reach out to us immediately. Any pending charges will be refunded.
      </p>
    `;
    return layout('Order Cancelled', content);
  },

  statusUpdate: (order: any, status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return orderEmailTemplates.orderConfirmed(order.customerName, order.finalAmount);
      case 'SHIPPED':
        return orderEmailTemplates.orderShipped(order.customerName);
      case 'DELIVERED':
        return orderEmailTemplates.orderDelivered(order.customerName);
      case 'CANCELLED':
        return orderEmailTemplates.orderCancelled(order.customerName);
      default:
        return orderEmailTemplates.orderPlaced(order.customerName, order.finalAmount);
    }
  },
};
