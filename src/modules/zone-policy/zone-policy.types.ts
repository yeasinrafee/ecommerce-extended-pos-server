export type CreateZonePolicyDto = {
  policyName: string;
  deliveryTime: number;
  shippingCost: number;
  status?: 'ACTIVE' | 'INACTIVE';
  zoneIds?: string[];
};

export type UpdateZonePolicyDto = Partial<CreateZonePolicyDto>;

export type ZonePolicyListQuery = {
  page?: number;
  limit?: number;
  searchTerm?: string;
};

export type ServiceListResult<T> = {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
