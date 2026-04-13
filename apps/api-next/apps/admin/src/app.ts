import { Hono } from "hono";
import { cors } from "hono/cors";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import { jwtAuth } from "./middleware/jwtAuth";
import { healthRoute } from "./routes/health";
import { settingsRoute } from "./routes/settings";
import { booksAdminRoute } from "./routes/books";

export function createApp() {
  const app = new Hono();
  app.use("*", requestLogger);
  app.use("*", cors({ origin: "http://localhost:3001", credentials: true }));
  app.use("*", jwtAuth);
  app.route("/health", healthRoute);
  app.route("/admin/settings", settingsRoute);
  app.route("/admin/books", booksAdminRoute);
  app.onError(errorHandler);
  return app;
}
