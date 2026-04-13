import type { MiddlewareHandler } from "hono";
import { pino } from "pino";
import { env } from "@api-next/core";

const logger = pino({ level: env.LOG_LEVEL, name: "api-blog-next" });

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = performance.now();
  await next();
  const ms = (performance.now() - start).toFixed(1);
  logger.info(
    { method: c.req.method, path: c.req.path, status: c.res.status, ms },
    "request",
  );
};

export { logger };
