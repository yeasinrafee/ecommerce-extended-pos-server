import { Request, Response } from 'express';
import { sendResponse } from '../utils/send-response.js';

export const notFoundMiddleware = (req: Request, res: Response) => {
  return sendResponse({
    res,
    statusCode: 404,
    success: false,
    message: 'Route not found',
    errors: [
      {
        message: `Cannot ${req.method} ${req.originalUrl}`,
        code: 'ROUTE_NOT_FOUND'
      }
    ],
    meta: {
      timestamp: new Date().toISOString()
    }
  });
};
