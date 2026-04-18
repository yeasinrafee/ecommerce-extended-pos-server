export type CreateShippingDto = {
  minimumFreeShippingAmount: number;
  tax: number;
  maximumWeight?: number | null;
  maximumVolume?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  chargePerWeight?: number | null;
  chargePerVolume?: number | null;
  weightUnit?: number | null;
  volumeUnit?: number | null;
};

export type UpdateShippingDto = Partial<CreateShippingDto>;
