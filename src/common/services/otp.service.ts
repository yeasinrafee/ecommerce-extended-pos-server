import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../errors/app-error.js';
import { emailService } from './email.service.js';

const DEFAULT_LENGTH = 6;
const MIN_LENGTH = 4;
const MAX_LENGTH = 10;
const DEFAULT_EXPIRY_MINUTES = 10;

interface GenerateOtpOptions {
  userId: string;
  to: string;
  length?: number;
  expiryMinutes?: number;
}

interface VerifyOtpOptions {
  userId: string;
  code: string;
  consume?: boolean; // Default true
  onVerified?: (tx: Prisma.TransactionClient, record: OtpRecord) => Promise<void>;
}

type OtpRecord = {
  id: string;
  userId: string;
  code: string;
  expiryDate: Date;
};

class OtpService {
  private createNumericCode(length: number): string {
    const digits: string[] = [];
    for (let i = 0; i < length; i += 1) {
      digits.push(String(crypto.randomInt(0, 10)));
    }
    return digits.join('');
  }

  private hashCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  async generate(options: GenerateOtpOptions): Promise<Date> {
    const effectiveLength = Math.min(Math.max(options.length ?? DEFAULT_LENGTH, MIN_LENGTH), MAX_LENGTH);
    const expiryMinutes = Math.max((options.expiryMinutes ?? DEFAULT_EXPIRY_MINUTES), 1);
    const expiryDate = new Date(Date.now() + expiryMinutes * 60 * 1000);

    const newCode = this.createNumericCode(effectiveLength);
    const hashedCode = this.hashCode(newCode);

    await prisma.$transaction(async (tx) => {
      await tx.oTP.deleteMany({ where: { userId: options.userId } });
      await tx.oTP.create({
        data: {
          userId: options.userId,
          code: hashedCode,
          expiryDate,
        },
      });
    });

    await emailService.sendOtpEmail(options.to, newCode, expiryMinutes);

    return expiryDate;
  }

  async verify(options: VerifyOtpOptions): Promise<OtpRecord> {
    return prisma.$transaction(async (tx) => {
      const record = await tx.oTP.findFirst({
        where: { userId: options.userId },
        orderBy: { createdAt: 'desc' },
      });

      if (!record) {
        throw new AppError(404, 'OTP not found', [
          { message: 'No OTP exists for the provided user', code: 'OTP_NOT_FOUND' },
        ]);
      }

      if (record.expiryDate.getTime() < Date.now()) {
        await tx.oTP.delete({ where: { id: record.id } });
        throw new AppError(400, 'OTP has expired', [
          { message: 'The provided OTP has expired', code: 'OTP_EXPIRED' },
        ]);
      }

      if (record.code !== this.hashCode(options.code)) {
        throw new AppError(400, 'Invalid OTP code', [
          { message: 'The provided OTP is not valid', code: 'OTP_INVALID' },
        ]);
      }

      if (options.consume !== false) {
        await tx.oTP.delete({ where: { id: record.id } });
      }

      if (options.onVerified) {
        await options.onVerified(tx, {
          id: record.id,
          userId: record.userId,
          code: record.code,
          expiryDate: record.expiryDate,
        });
      }

      return {
        id: record.id,
        userId: record.userId,
        code: record.code,
        expiryDate: record.expiryDate,
      };
    });
  }
}

export const otpService = new OtpService();
