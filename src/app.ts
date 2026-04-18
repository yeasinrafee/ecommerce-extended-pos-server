import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { apiRoutes } from "./routes/index.js";
import { errorMiddleware } from "./common/middlewares/error.middleware.js";
import { notFoundMiddleware } from "./common/middlewares/not-found.middleware.js";
import { sendResponse } from "./common/utils/send-response.js";

export const app = express();

app.use(
  cors({
    origin: env.corsOrigins,
    credentials: true,
  }),
);
app.use(express.json());
// app.use(express.json({ limit: "50mb" }));
// app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());
app.use(
  pinoHttp({
    logger,
  }),
);

app.get("/health", (req, res) => {
  sendResponse({
    res,
    statusCode: 200,
    success: true,
    message: "Server is healthy",
    data: {
      uptime: process.uptime(),
    },
    errors: [],
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
});

app.use("/api", apiRoutes);
app.use(notFoundMiddleware);
app.use(errorMiddleware);
