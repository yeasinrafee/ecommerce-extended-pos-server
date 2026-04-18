import { prisma } from '../../config/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import type { CreateShippingDto, UpdateShippingDto } from './shipping.types.js';

const getShipping = async () => {
  return prisma.shipping.findFirst();
};

const getShippingById = async (id: string) => {
  const s = await prisma.shipping.findUnique({ where: { id } });
  if (!s) {
    throw new AppError(404, 'Shipping not found', [
      { message: 'No shipping exists with the provided id', code: 'NOT_FOUND' }
    ]);
  }
  return s;
};

const createShipping = async (dto: CreateShippingDto) => {
  const count = await prisma.shipping.count();
  if (count > 0) {
    throw new AppError(400, 'Shipping record already exists', [
      { message: 'Only one shipping record is allowed', code: 'ALREADY_EXISTS' }
    ]);
  }

  const hasDimensions =
    typeof (dto as any).length === 'number' && !Number.isNaN((dto as any).length) &&
    typeof (dto as any).width === 'number' && !Number.isNaN((dto as any).width) &&
    typeof (dto as any).height === 'number' && !Number.isNaN((dto as any).height);

  const computedVolume = hasDimensions
    ? (Number((dto as any).length) * Number((dto as any).width) * Number((dto as any).height))
    : null;

  const created = await prisma.shipping.create({
    data: {
      minimumFreeShippingAmount: dto.minimumFreeShippingAmount,
      tax: dto.tax,
      maximumWeight: dto.maximumWeight ?? null,
      // store computed volume if dimensions present, otherwise fall back to any explicit maximumVolume
      maximumVolume: computedVolume ?? (dto as any).maximumVolume ?? null,
      // persist individual dimensions as provided (cm)
      length: (dto as any).length ?? null,
      width: (dto as any).width ?? null,
      height: (dto as any).height ?? null,
      chargePerWeight: dto.chargePerWeight ?? null,
      	  chargePerVolume: dto.chargePerVolume ?? null,
      	  weightUnit: (dto as any).weightUnit ?? null,
      	  volumeUnit: (dto as any).volumeUnit ?? null
    }
  });

  return created;
};

const updateShipping = async (id: string, payload: UpdateShippingDto) => {
  const existing = await prisma.shipping.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, 'Shipping not found', [
      { message: 'No shipping exists with the provided id', code: 'NOT_FOUND' }
    ]);
  }

  const dataToUpdate: any = { ...payload };

  // compute maximumVolume if complete dimensions are provided
  const length = (dataToUpdate as any).length;
  const width = (dataToUpdate as any).width;
  const height = (dataToUpdate as any).height;

  const hasDimensions =
    typeof length === 'number' && !Number.isNaN(length) &&
    typeof width === 'number' && !Number.isNaN(width) &&
    typeof height === 'number' && !Number.isNaN(height);

  if (hasDimensions) {
    dataToUpdate.maximumVolume = Number(length) * Number(width) * Number(height);
  }

  // Ensure removed/deprecated fields aren't passed to Prisma (field removed from schema)
  if (Object.prototype.hasOwnProperty.call(dataToUpdate, 'defaultShippingCharge')) {
    delete (dataToUpdate as any).defaultShippingCharge;
  }

  // Remove undefined keys so Prisma doesn't try to set undefined values. Keep nulls.
  ['length', 'width', 'height', 'maximumVolume', 'weightUnit', 'volumeUnit'].forEach((k) => {
    if ((dataToUpdate as any)[k] === undefined) delete (dataToUpdate as any)[k];
  });

  const updated = await prisma.shipping.update({ where: { id }, data: dataToUpdate as any });
  return updated;
};

const deleteShipping = async (id: string) => {
  const existing = await prisma.shipping.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, 'Shipping not found', [
      { message: 'No shipping exists with the provided id', code: 'NOT_FOUND' }
    ]);
  }

  await prisma.shipping.delete({ where: { id } });
  return true;
};

const resetShipping = async () => {
  // Remove all shipping records. Keeps behavior simple since only one record is expected.
  await prisma.shipping.deleteMany();
  return true;
};

export const shippingService = {
  getShipping,
  getShippingById,
  createShipping,
  updateShipping,
  deleteShipping
  ,resetShipping
};
