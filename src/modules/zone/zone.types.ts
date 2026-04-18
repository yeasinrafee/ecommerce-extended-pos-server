export type CreateZoneDto = {
  name: string;
};

export type UpdateZoneDto = Partial<CreateZoneDto>;

export type ZoneListQuery = {
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
