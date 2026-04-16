import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "@api/core";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import { healthRoute } from "./routes/health";
import { booksRoute } from "./routes/books";
import { seriesRoute } from "./routes/series";
import { articlesRoute } from "./routes/articles";
import { analyticsTrackRoute } from "./routes/analytics";
import { sidebarRoute } from "./routes/sidebar";

export function createApp() {
  const app = new Hono();
  app.use("*", requestLogger);
  app.use("*", cors({ origin: "*" }));
  app.route("/health", healthRoute);
  app.route("/books", booksRoute);
  app.route("/series", seriesRoute);
  app.route("/articles", articlesRoute);
  app.route("/analytics", analyticsTrackRoute);
  app.route("/sidebar", sidebarRoute);
  app.get("/images/*", async (c) => {
    const rel = c.req.path.slice("/images/".length);
    if (rel.length === 0 || rel.split("/").includes("..") || rel.includes("\0")) {
      return c.notFound();
    }
    const full = path.join(env.IMAGE_STORAGE_PATH, rel);
    const file = Bun.file(full);
    if (!(await file.exists())) {
      return c.notFound();
    }
    return new Response(file);
  });
  app.onError(errorHandler);
  return app;
}
