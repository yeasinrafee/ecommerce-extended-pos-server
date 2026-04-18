import { ApiErrorItem } from '../types/api-response.js';

export class AppError extends Error {
  statusCode: number;
  errors: ApiErrorItem[];
  isOperational: boolean;

  constructor(statusCode: number, message: string, errors: ApiErrorItem[] = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
