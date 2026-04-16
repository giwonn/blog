import { Hono } from "hono";
import { cors } from "hono/cors";
import path from "node:path";
import { env } from "@api/core";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import { healthRoute } from "./routes/health";
import { settingsRoute } from "./routes/settings";
import { booksAdminRoute } from "./routes/books";
import { seriesAdminRoute } from "./routes/series";
import { articlesAdminRoute } from "./routes/articles";
import { dashboardRoute } from "./routes/dashboard";
import { analyticsRoute } from "./routes/analytics";
import { imagesAdminRoute } from "./routes/images";

export function createApp() {
  const app = new Hono();
  app.use("*", requestLogger);
  app.use("*", cors({ origin: "http://localhost:3001", credentials: true }));
  app.route("/health", healthRoute);
  app.route("/admin/settings", settingsRoute);
  app.route("/admin/books", booksAdminRoute);
  app.route("/admin/series", seriesAdminRoute);
  app.route("/admin/articles", articlesAdminRoute);
  app.route("/admin/dashboard", dashboardRoute);
  app.route("/admin/analytics", analyticsRoute);
  app.route("/admin/images", imagesAdminRoute);
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
