import { Hono } from "hono";
import { analyticsFindTopPages, type PopularArticle } from "@api/core";

export const dashboardRoute = new Hono();

dashboardRoute.get("/popular-articles", async (c) => {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 30);
  const topPages = await analyticsFindTopPages(from, to);
  const data: PopularArticle[] = topPages.slice(0, 5).map((p) => ({
    id: p.articleId,
    title: p.title,
    viewCount: p.viewCount,
  }));
  return c.json({ data });
});
