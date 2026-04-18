import nodemailer from "nodemailer";
import { env } from "../../config/env.js";
import { createQueue, createWorker } from "./mq.service.js";
import type { Job } from "bullmq";

interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: nodemailer.SendMailOptions["attachments"];
}

export const emailQueue = createQueue("emailQueue", { verify: true });

class EmailService {
  private transporter: nodemailer.Transporter;

  private maxSendAttempts = 3;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.mailHost,
      port: 465,
      secure: true,
      auth: {
        user: env.mailUser,
        pass: env.mailPass,
      },
    });

    this.transporter
      .verify()
      .then(() => {
        console.log("SMTP transporter verified");
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("SMTP transporter verification failed", msg);
      });
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      if (!env.mailHost || !env.mailUser || !env.mailPass) {
        if (process.env.NODE_ENV === "development") {
          console.log("DEV EMAIL (not sent) ->", {
            to: options.to,
            subject: options.subject,
            text: options.text ?? this.stripHtml(options.html ?? ""),
            html: options.html,
          });
          return true;
        }
        throw new Error(
          "Mail configuration missing (mailHost/mailUser/mailPass)",
        );
      }

      const mailOptions: nodemailer.SendMailOptions = {
        from: `"${env.mailFrom}" <${env.mailUser}>`,
        to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
        subject: options.subject,
        html: options.html ? this.applyBaseStyling(options.html) : undefined,
        text: options.text ?? this.stripHtml(options.html ?? ""),
        attachments: options.attachments,
      };

      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

      let lastErr: any = null;
      for (let attempt = 1; attempt <= this.maxSendAttempts; attempt++) {
        try {
          const info = await this.transporter.sendMail(mailOptions);
          // console.log(`Email sent successfully to ${mailOptions.to}. MessageId: ${info.messageId}`);
          return true;
        } catch (err) {
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`Email send attempt ${attempt} failed`, msg);
          if (attempt < this.maxSendAttempts) {
            await sleep(250 * Math.pow(2, attempt));
          }
        }
      }

      throw lastErr;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Failed to send email:", msg);
      throw error;
    }
  }

  private stripHtml(html: string) {
    return html
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private applyBaseStyling(contentHtml: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta http-equiv="x-ua-compatible" content="ie=edge">
        <title>Email Notification</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          /* Basic reset and styling for email clients */
          body, table, td, a {
            -ms-text-size-adjust: 100%; /* 1 */
            -webkit-text-size-adjust: 100%; /* 2 */
          }
          table, td {
            mso-table-rspace: 0pt;
            mso-table-lspace: 0pt;
          }
          img {
            -ms-interpolation-mode: bicubic;
          }
          a[x-apple-data-detectors] {
            font-family: inherit !important;
            font-size: inherit !important;
            font-weight: inherit !important;
            line-height: inherit !important;
            color: inherit !important;
            text-decoration: none !important;
          }
          body {
            width: 100% !important;
            height: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            background-color: #f4f4f4;
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          }
          .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          .email-header {
            background-color: #007bff;
            color: #ffffff;
            padding: 20px;
            text-align: center;
          }
          .email-body {
            padding: 30px;
            color: #333333;
            line-height: 1.6;
            font-size: 16px;
          }
          .email-footer {
            background-color: #f4f4f4;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #777777;
          }
          .btn {
            display: inline-block;
            padding: 12px 24px;
            background-color: #007bff;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 4px;
            font-weight: bold;
            margin-top: 20px;
          }
          /* Ensure text block respects margins */
          p { margin: 0 0 15px 0; }
        </style>
      </head>
      <body>
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td align="center" style="padding: 40px 10px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" class="email-container">
                <tr>
                  <td class="email-body">
                    <!-- Dynamic Content Goes Here -->
                    ${contentHtml}
                  </td>
                </tr>
                <tr>
                  <td class="email-footer">
                    <p>&copy; ${new Date().getFullYear()} ${env.mailFrom.split("@")[0]}. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  async queueEmail(options: EmailOptions): Promise<void> {
    await emailQueue.add("sendEmail", options);
  }

  async sendOtpEmail(
    to: string,
    otp: string,
    expiryMinutes?: number,
  ): Promise<boolean> {
    const minutes = typeof expiryMinutes === "number" ? expiryMinutes : 15;
    const expiryDate = new Date(Date.now() + minutes * 60 * 1000);
    const expiryText = `within the next ${minutes} minute${minutes === 1 ? "" : "s"}`;

    const html = `
      <h2 style="margin-bottom: 20px;">Your One-Time Password (OTP)</h2>
      <p>Hello,</p>
      <p>Your OTP code for verification is:</p>
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 4px; display: inline-block; margin: 20px 0; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #007bff;">
          ${otp}
      </div>
      <p>Please use this code ${expiryText}. If you did not request this, please ignore this email.</p>
      <p style="margin-top:10px;font-size:13px;color:#666;">This code will expire at <strong>${expiryDate.toLocaleString()}</strong> (server time).</p>
    `;

    return this.sendEmail({
      to,
      subject: `Your OTP Code (expires in ${minutes} min)`,
      html,
    });
  }

  async sendInvoiceEmail(
    to: string,
    userName: string,
    pdfBuffer: Buffer,
  ): Promise<boolean> {
    const html = `
      <h3>Invoice Ready</h3>
      <p>Hello \${userName},</p>
      <p>Please find your recent invoice attached to this email.</p>
      <p>Thank you for your business!</p>
    `;

    return this.sendEmail({
      to,
      subject: "Your Invoice",
      html,
      attachments: [
        {
          filename: "invoice.pdf",
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
  }
}

export const emailService = new EmailService();

export const emailWorker = createWorker(
  "emailQueue",
  async (job: Job) => {
    const data = job.data as EmailOptions;
    await emailService.sendEmail(data);
  },
  5,
  { verify: true },
);
