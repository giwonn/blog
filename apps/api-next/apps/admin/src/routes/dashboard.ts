import { Hono } from "hono";
import { analyticsFindPopularArticles } from "@api-next/core";

export const dashboardRoute = new Hono();

dashboardRoute.get("/popular-articles", async (c) => {
  const data = await analyticsFindPopularArticles(5, 30);
  return c.json({ data });
});
