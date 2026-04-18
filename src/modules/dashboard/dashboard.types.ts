import { z } from "zod";

export const getDashboardQuerySchema = z.object({
  query: z.object({
    month: z.string().optional(),
    year: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
});
