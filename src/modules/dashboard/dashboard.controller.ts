import { Request, Response, NextFunction } from 'express';
import { getDashboardAnalyticsService } from './dashboard.service.js';
import { getDashboardQuerySchema } from './dashboard.types.js';

export const getDashboardAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const validatedQuery = getDashboardQuerySchema.parse(req).query;
    
    const data = await getDashboardAnalyticsService(validatedQuery);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};
