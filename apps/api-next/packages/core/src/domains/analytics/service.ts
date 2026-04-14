import * as repo from "./repo";
import type {
  PageViewCount,
  ReferrerCount,
  DailyPageViewCount,
  DailyVisitorCount,
  VisitorLocation,
  IpAccessHistory,
  ArticleAccessHistory,
  AnalyticsOverview,
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
