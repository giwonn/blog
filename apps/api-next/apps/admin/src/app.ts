import { Hono } from "hono";
import { cors } from "hono/cors";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import { jwtAuth } from "./middleware/jwtAuth";
import { healthRoute } from "./routes/health";

export function createApp() {
  const app = new Hono();
  app.use("*", requestLogger);
  app.use("*", cors({ origin: "http://localhost:3001", credentials: true }));
  app.use("*", jwtAuth);
  app.route("/health", healthRoute);
  app.onError(errorHandler);
  return app;
}
