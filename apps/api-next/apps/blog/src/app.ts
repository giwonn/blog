import { Hono } from "hono";
import { cors } from "hono/cors";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import { healthRoute } from "./routes/health";

export function createApp() {
  const app = new Hono();
  app.use("*", requestLogger);
  app.use("*", cors({ origin: "*" }));
  app.route("/health", healthRoute);
  app.onError(errorHandler);
  return app;
}
