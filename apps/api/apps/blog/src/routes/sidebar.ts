import { Hono } from "hono";
import {
  analyticsFindTopPages,
  commentsGetRecent,
  analyticsGetVisitorSummary,
  type PopularArticle,
} from "@api/core";

export const sidebarRoute = new Hono();

sidebarRoute.get("/popular-articles", async (c) => {
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

sidebarRoute.get("/recent-comments", async (c) => {
  const data = await commentsGetRecent(5);
  return c.json({ data });
});

sidebarRoute.get("/visitors", async (c) => {
  const data = await analyticsGetVisitorSummary();
  return c.json({ data });
});
