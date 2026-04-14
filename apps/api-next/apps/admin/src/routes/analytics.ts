import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  toUtcDateRange,
  analyticsGetOverview,
  analyticsGetTopPages,
  analyticsGetTopReferrers,
  analyticsGetDailyPageViews,
  analyticsGetDailyVisitors,
  analyticsGetVisitorLocations,
  analyticsGetIpAccessHistory,
  analyticsGetArticleAccessHistory,
} from "@api-next/core";

type ZodIssueLike = { path: PropertyKey[]; message: string };
type ZodErrorLike = { issues: ZodIssueLike[] };

function validationErrorMessage(error: ZodErrorLike): string {
  const first = error.issues[0];
  if (!first) return "Invalid request";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}

const dateRangeQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  tz: z.string().min(1).default("UTC"),
});

const ipHistoryQuerySchema = dateRangeQuerySchema.extend({
  ip: z.string().min(1),
});

const articleHistoryQuerySchema = dateRangeQuerySchema.extend({
  articleId: z.coerce.number().int().positive(),
});

const queryHook = <T>(schema: z.ZodType<T>) =>
  zValidator("query", schema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  });

export const analyticsRoute = new Hono();

analyticsRoute.get("/overview", queryHook(dateRangeQuerySchema), async (c) => {
  const { from, to, tz } = c.req.valid("query");
  const { fromUtc, toUtcExclusive } = toUtcDateRange(from, to, tz);
  const data = await analyticsGetOverview(fromUtc, toUtcExclusive);
  return c.json({ data });
});

analyticsRoute.get("/page-views", queryHook(dateRangeQuerySchema), async (c) => {
  const { from, to, tz } = c.req.valid("query");
  const { fromUtc, toUtcExclusive } = toUtcDateRange(from, to, tz);
  const data = await analyticsGetDailyPageViews(fromUtc, toUtcExclusive);
  return c.json({ data });
});

analyticsRoute.get("/daily-visitors", queryHook(dateRangeQuerySchema), async (c) => {
  const { from, to, tz } = c.req.valid("query");
  const { fromUtc, toUtcExclusive } = toUtcDateRange(from, to, tz);
  const data = await analyticsGetDailyVisitors(fromUtc, toUtcExclusive, tz);
  return c.json({ data });
});

analyticsRoute.get("/top-pages", queryHook(dateRangeQuerySchema), async (c) => {
  const { from, to, tz } = c.req.valid("query");
  const { fromUtc, toUtcExclusive } = toUtcDateRange(from, to, tz);
  const data = await analyticsGetTopPages(fromUtc, toUtcExclusive);
  return c.json({ data });
});

analyticsRoute.get("/referrers", queryHook(dateRangeQuerySchema), async (c) => {
  const { from, to, tz } = c.req.valid("query");
  const { fromUtc, toUtcExclusive } = toUtcDateRange(from, to, tz);
  const data = await analyticsGetTopReferrers(fromUtc, toUtcExclusive);
  return c.json({ data });
});

analyticsRoute.get("/visitor-locations", queryHook(dateRangeQuerySchema), async (c) => {
  const { from, to, tz } = c.req.valid("query");
  const { fromUtc, toUtcExclusive } = toUtcDateRange(from, to, tz);
  const data = await analyticsGetVisitorLocations(fromUtc, toUtcExclusive);
  return c.json({ data });
});

analyticsRoute.get("/ip-access-history", queryHook(ipHistoryQuerySchema), async (c) => {
  const { from, to, tz, ip } = c.req.valid("query");
  const { fromUtc, toUtcExclusive } = toUtcDateRange(from, to, tz);
  const data = await analyticsGetIpAccessHistory(ip, fromUtc, toUtcExclusive);
  return c.json({ data });
});

analyticsRoute.get("/article-access-history", queryHook(articleHistoryQuerySchema), async (c) => {
  const { from, to, tz, articleId } = c.req.valid("query");
  const { fromUtc, toUtcExclusive } = toUtcDateRange(from, to, tz);
  const data = await analyticsGetArticleAccessHistory(articleId, fromUtc, toUtcExclusive);
  return c.json({ data });
});
