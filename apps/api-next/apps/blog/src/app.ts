import { Hono } from "hono";
import { cors } from "hono/cors";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import { healthRoute } from "./routes/health";
import { booksRoute } from "./routes/books";
import { seriesRoute } from "./routes/series";
import { articlesRoute } from "./routes/articles";
import { analyticsTrackRoute } from "./routes/analytics";

export function createApp() {
  const app = new Hono();
  app.use("*", requestLogger);
  app.use("*", cors({ origin: "*" }));
  app.route("/health", healthRoute);
  app.route("/books", booksRoute);
  app.route("/series", seriesRoute);
  app.route("/articles", articlesRoute);
  app.route("/analytics", analyticsTrackRoute);
  app.onError(errorHandler);
  return app;
}
