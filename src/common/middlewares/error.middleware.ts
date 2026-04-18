import { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { AppError } from '../errors/app-error.js';
import { logger } from '../../config/logger.js';
import { sendResponse } from '../utils/send-response.js';

export const errorMiddleware = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const isAppError = error instanceof AppError;
  const isMulterError = error instanceof MulterError;

  const statusCode = isAppError || isMulterError ? 400 : 500;
  const message = isAppError
    ? error.message
    : isMulterError
      ? 'File upload validation failed'
      : 'Internal server error';
  const errors = isAppError
    ? error.errors
    : isMulterError
      ? [
          {
            message: error.message,
            code: error.code
          }
        ]
    : [
        {
          message: 'Unexpected server error',
          code: 'INTERNAL_SERVER_ERROR'
        }
      ];

  logger.error(
    {
      err: error,
      path: req.originalUrl,
      method: req.method
    },
    message
  );

  sendResponse({
    res,
    statusCode,
    success: false,
    message,
    errors,
    meta: {
      timestamp: new Date().toISOString()
    }
  });
};
