import { Response } from 'express';
import { ApiErrorItem, ApiMeta, ApiResponse } from '../types/api-response.js';

type SendResponseArgs<T> = {
  res: Response;
  statusCode: number;
  success: boolean;
  message: string;
  data?: T | null;
  errors?: ApiErrorItem[];
  meta?: ApiMeta;
};

export const sendResponse = <T>({
  res,
  statusCode,
  success,
  message,
  data = null,
  errors = [],
  meta = {}
}: SendResponseArgs<T>) => {
  const responseBody: ApiResponse<T> = {
    success,
    message,
    data,
    errors,
    meta
  };

  return res.status(statusCode).json(responseBody);
};
