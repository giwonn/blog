import * as repo from "./repo";
import { resolveGeoLocation } from "./geo";
import { addVisitor, getVisitorCount } from "./visitorCounter";
import type {
  PageViewCount,
  ReferrerCount,
  DailyPageViewCount,
  DailyVisitorCount,
  VisitorLocation,
  IpAccessHistory,
  ArticleAccessHistory,
  AnalyticsOverview,
  PageViewInput,
  VisitorSummary,
} from "./types";

/**
 * Overview: total page views + top pages within the range.
 * Mirrors Kotlin AnalyticsQueryService.getOverview.
 */
export async function getOverview(from: Date, to: Date): Promise<AnalyticsOverview> {
  const topPages = await repo.findTopPages(from, to);
  const totalPageViews = topPages.reduce((acc, p) => acc + p.viewCount, 0);
  return { totalPageViews, topPages };
}

export async function getTopPages(from: Date, to: Date): Promise<PageViewCount[]> {
  return await repo.findTopPages(from, to);
}

export async function getTopReferrers(from: Date, to: Date): Promise<ReferrerCount[]> {
  return await repo.findTopReferrers(from, to);
}

export async function getDailyPageViews(from: Date, to: Date): Promise<DailyPageViewCount[]> {
  return await repo.findDailyPageViews(from, to);
}

export async function getDailyVisitors(
  from: Date,
  to: Date,
  tz: string,
): Promise<DailyVisitorCount[]> {
  return await repo.findDailyVisitors(from, to, tz);
}

export async function getVisitorLocations(from: Date, to: Date): Promise<VisitorLocation[]> {
  return await repo.findVisitorLocations(from, to);
}

export async function getIpAccessHistory(
  ip: string,
  from: Date,
  to: Date,
): Promise<IpAccessHistory[]> {
  return await repo.findIpAccessHistory(ip, from, to);
}

export async function getArticleAccessHistory(
  articleId: number,
  from: Date,
  to: Date,
): Promise<ArticleAccessHistory[]> {
  return await repo.findArticleAccessHistory(articleId, from, to);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Records a page view. Resolves geo (if public IP), inserts the row,
 * upserts the session, and adds to the Redis visitor set.
 *
 * Callers typically invoke this in a fire-and-forget pattern:
 *   recordPageView(body).catch((err) => console.warn("...", err));
 */
export async function recordPageView(input: PageViewInput): Promise<void> {
  const geo = await resolveGeoLocation(input.ipAddress);
  await repo.savePageView({
    path: input.path,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent ?? null,
    referrer: input.referrer ?? null,
    sessionId: input.sessionId ?? null,
    latitude: geo?.latitude ?? null,
    longitude: geo?.longitude ?? null,
    country: geo?.country ?? null,
    city: geo?.city ?? null,
  });
  if (input.sessionId) {
    await repo.upsertSession(input.sessionId, input.ipAddress, input.userAgent ?? null);
    await addVisitor(isoDate(new Date()), input.sessionId);
  }
}

/**
 * Returns the total / today / yesterday visitor counts with a fallback
 * chain: Redis → daily_visitor_stats → raw COUNT(DISTINCT session_id).
 * Total is historical daily sum + today's live Redis count.
 *
 * Mirrors Kotlin VisitorStatsService.getVisitorSummary.
 */
export async function getVisitorSummary(): Promise<VisitorSummary> {
  const now = new Date();
  const todayStr = isoDate(now);
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = isoDate(yesterday);

  const todayCount = await getVisitorCountWithFallback(todayStr);
  const yesterdayCount = await getVisitorCountWithFallback(yesterdayStr);
  const historicalTotal = await repo.getTotalVisitorCount();
  return {
    total: historicalTotal + todayCount,
    today: todayCount,
    yesterday: yesterdayCount,
  };
}

async function getVisitorCountWithFallback(date: string): Promise<number> {
  const redisCount = await getVisitorCount(date);
  if (redisCount > 0) return redisCount;
  const dbCount = (await repo.getVisitorCountByDate(date)).count;
  if (dbCount > 0) return dbCount;
  const from = new Date(`${date}T00:00:00.000Z`);
  const to = new Date(`${date}T23:59:59.999Z`);
  return await repo.countDistinctSessions(from, to);
}

/**
 * Nightly aggregation: compute yesterday's distinct session count and
 * write it to daily_visitor_stats. Idempotent (ON CONFLICT overwrites).
 * Mirrors Kotlin VisitorStatsAggregator.aggregateDaily.
 */
export async function visitorStatsAggregate(): Promise<void> {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yStr = isoDate(yesterday);
  const from = new Date(`${yStr}T00:00:00.000Z`);
  const to = new Date(`${yStr}T23:59:59.999Z`);
  const count = await repo.countDistinctSessions(from, to);
  await repo.saveDailyVisitorStats(yStr, count);
}
