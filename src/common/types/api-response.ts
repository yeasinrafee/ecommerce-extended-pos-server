export type ApiErrorItem = {
  field?: string;
  message: string;
  code?: string;
};

export type ApiMeta = {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  requestId?: string;
  timestamp?: string;
};

export type ApiResponse<T> = {
  success: boolean;
  message: string;
  data: T | null;
  errors: ApiErrorItem[];
  meta: ApiMeta;
};
