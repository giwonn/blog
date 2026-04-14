import { sql } from "drizzle-orm";
import { db } from "../../db/client";
import type {
  PageViewCount,
  ReferrerCount,
  DailyPageViewCount,
  DailyVisitorCount,
  VisitorCount,
  VisitorLocation,
  IpAccessHistory,
  ArticleAccessHistory,
} from "./types";

type RawRow = Record<string, unknown>;

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") return Number(v);
  return 0;
}

function toStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

/**
 * Top pages by view count within a UTC datetime range.
 * Mirrors Kotlin AnalyticsReader.findTopPages. Joins page_views to articles
 * via CAST(SUBSTRING(path, 11) AS bigint) — frontend tracks with
 * path = '/articles/<numeric-id>'.
 */
export async function findTopPages(from: Date, to: Date): Promise<PageViewCount[]> {
  const rows = (await db.execute(sql`
    SELECT a.id AS article_id, a.title AS title, COUNT(pv.id)::bigint AS view_count
    FROM page_views pv
    JOIN articles a ON a.id = CAST(SUBSTRING(pv.path FROM 11) AS bigint)
    WHERE pv.created_at >= ${from.toISOString()}::timestamp
      AND pv.created_at < ${to.toISOString()}::timestamp
      AND pv.path LIKE '/articles/%'
    GROUP BY a.id, a.title
    ORDER BY view_count DESC
  `)) as unknown as RawRow[];
  return rows.map((r) => ({
    articleId: toNumber(r.article_id),
    title: String(r.title),
    viewCount: toNumber(r.view_count),
  }));
}

/**
 * Top referrers. Null referrers are bucketed as the Korean label `(직접 접속)`
 * (direct access), mirroring Kotlin's CaseBuilder logic.
 */
export async function findTopReferrers(from: Date, to: Date): Promise<ReferrerCount[]> {
  const directLabel = "(직접 접속)";
  const rows = (await db.execute(sql`
    SELECT referrer, COUNT(id)::bigint AS view_count
    FROM (
      SELECT COALESCE(pv.referrer, ${directLabel}) AS referrer, pv.id
      FROM page_views pv
      WHERE pv.created_at >= ${from.toISOString()}::timestamp
        AND pv.created_at < ${to.toISOString()}::timestamp
    ) sub
    GROUP BY referrer
    ORDER BY view_count DESC
  `)) as unknown as RawRow[];
  return rows.map((r) => ({
    referrer: String(r.referrer),
    viewCount: toNumber(r.view_count),
  }));
}

/**
 * Page views per day within a range. Grouped by UTC date of `created_at`.
 */
export async function findDailyPageViews(from: Date, to: Date): Promise<DailyPageViewCount[]> {
  const rows = (await db.execute(sql`
    SELECT TO_CHAR(pv.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
           COUNT(pv.id)::bigint AS view_count
    FROM page_views pv
    WHERE pv.created_at >= ${from.toISOString()}::timestamp
      AND pv.created_at < ${to.toISOString()}::timestamp
    GROUP BY TO_CHAR(pv.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
    ORDER BY date ASC
  `)) as unknown as RawRow[];
  return rows.map((r) => ({
    date: String(r.date),
    viewCount: toNumber(r.view_count),
  }));
}

/**
 * Unique visitors per day, grouped in the caller's timezone.
 */
export async function findDailyVisitors(
  from: Date,
  to: Date,
  tz: string,
): Promise<DailyVisitorCount[]> {
  const rows = (await db.execute(sql`
    SELECT date, COUNT(DISTINCT session_id)::bigint AS visitor_count
    FROM (
      SELECT TO_CHAR(pv.created_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS date,
             pv.session_id
      FROM page_views pv
      WHERE pv.created_at >= ${from.toISOString()}::timestamp
        AND pv.created_at < ${to.toISOString()}::timestamp
        AND pv.session_id IS NOT NULL
    ) sub
    GROUP BY date
    ORDER BY date ASC
  `)) as unknown as RawRow[];
  return rows.map((r) => ({
    date: String(r.date),
    visitorCount: toNumber(r.visitor_count),
  }));
}

/**
 * Count distinct session ids within a range. Used by the overview and by
 * VisitorStatsService (Plan G2) as the raw-table fallback.
 */
export async function countDistinctSessions(from: Date, to: Date): Promise<number> {
  const rows = (await db.execute(sql`
    SELECT COUNT(DISTINCT pv.session_id)::bigint AS n
    FROM page_views pv
    WHERE pv.created_at >= ${from.toISOString()}::timestamp
      AND pv.created_at < ${to.toISOString()}::timestamp
      AND pv.session_id IS NOT NULL
  `)) as unknown as RawRow[];
  return toNumber(rows[0]?.n ?? 0);
}

/**
 * Visitor locations aggregated by IP address. Returns only rows that have
 * geo data populated (lat/lng non-null).
 */
export async function findVisitorLocations(from: Date, to: Date): Promise<VisitorLocation[]> {
  const rows = (await db.execute(sql`
    SELECT pv.ip_address AS ip_address,
           pv.latitude AS latitude,
           pv.longitude AS longitude,
           MAX(pv.country) AS country,
           MAX(pv.city) AS city,
           COUNT(pv.id)::bigint AS visit_count,
           MAX(pv.created_at) AS last_visited_at
    FROM page_views pv
    WHERE pv.created_at >= ${from.toISOString()}::timestamp
      AND pv.created_at < ${to.toISOString()}::timestamp
      AND pv.latitude IS NOT NULL
      AND pv.longitude IS NOT NULL
    GROUP BY pv.ip_address, pv.latitude, pv.longitude
    ORDER BY visit_count DESC
  `)) as unknown as RawRow[];
  return rows.map((r) => ({
    ipAddress: String(r.ip_address),
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    country: toStringOrNull(r.country),
    city: toStringOrNull(r.city),
    visitCount: toNumber(r.visit_count),
    lastVisitedAt: String(r.last_visited_at),
  }));
}

/**
 * Page view history for a specific IP within a range.
 */
export async function findIpAccessHistory(
  ipAddress: string,
  from: Date,
  to: Date,
): Promise<IpAccessHistory[]> {
  const rows = (await db.execute(sql`
    SELECT pv.path AS path,
           pv.ip_address AS ip_address,
           pv.country AS country,
           pv.city AS city,
           pv.created_at AS created_at
    FROM page_views pv
    WHERE pv.ip_address = ${ipAddress}
      AND pv.created_at >= ${from.toISOString()}::timestamp
      AND pv.created_at < ${to.toISOString()}::timestamp
    ORDER BY pv.created_at DESC
  `)) as unknown as RawRow[];
  return rows.map((r) => ({
    path: String(r.path),
    ipAddress: String(r.ip_address),
    country: toStringOrNull(r.country),
    city: toStringOrNull(r.city),
    createdAt: String(r.created_at),
  }));
}

/**
 * Page view history filtered to `/articles/<articleId>` paths.
 */
export async function findArticleAccessHistory(
  articleId: number,
  from: Date,
  to: Date,
): Promise<ArticleAccessHistory[]> {
  const rows = (await db.execute(sql`
    SELECT pv.ip_address AS ip_address,
           pv.country AS country,
           pv.city AS city,
           pv.created_at AS created_at
    FROM page_views pv
    WHERE pv.path = ${"/articles/" + articleId}
      AND pv.created_at >= ${from.toISOString()}::timestamp
      AND pv.created_at < ${to.toISOString()}::timestamp
    ORDER BY pv.created_at DESC
  `)) as unknown as RawRow[];
  return rows.map((r) => ({
    ipAddress: String(r.ip_address),
    country: toStringOrNull(r.country),
    city: toStringOrNull(r.city),
    createdAt: String(r.created_at),
  }));
}

/**
 * Total lifetime visitor count from the daily_visitor_stats aggregated table.
 * This reader is useful but the full VisitorStatsService fallback chain
 * lives in Plan G2.
 */
export async function getTotalVisitorCount(): Promise<number> {
  const rows = (await db.execute(sql`
    SELECT COALESCE(SUM(visitor_count), 0)::bigint AS total
    FROM daily_visitor_stats
  `)) as unknown as RawRow[];
  return toNumber(rows[0]?.total ?? 0);
}

/**
 * Visitor count for a specific date from daily_visitor_stats. Returns 0 if
 * the row doesn't exist (scheduler hasn't run yet for that day).
 */
export async function getVisitorCountByDate(date: string): Promise<VisitorCount> {
  const rows = (await db.execute(sql`
    SELECT COALESCE(visitor_count, 0)::bigint AS count
    FROM daily_visitor_stats
    WHERE date = ${date}
  `)) as unknown as RawRow[];
  return { count: toNumber(rows[0]?.count ?? 0) };
}

export type PageViewRow = {
  path: string;
  ipAddress: string;
  userAgent: string | null;
  referrer: string | null;
  sessionId: string | null;
  latitude: number | null;
  longitude: number | null;
  country: string | null;
  city: string | null;
};

export async function savePageView(row: PageViewRow): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(sql`
    INSERT INTO page_views (
      path, ip_address, user_agent, referrer, session_id,
      latitude, longitude, country, city, created_at
    ) VALUES (
      ${row.path}, ${row.ipAddress}, ${row.userAgent}, ${row.referrer}, ${row.sessionId},
      ${row.latitude}, ${row.longitude}, ${row.country}, ${row.city}, ${now}::timestamp
    )
  `);
}

export async function upsertSession(
  sessionId: string,
  ipAddress: string,
  userAgent: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(sql`
    INSERT INTO visitor_sessions (
      session_id, ip_address, user_agent, first_visit_at, last_visit_at, page_view_count
    ) VALUES (
      ${sessionId}, ${ipAddress}, ${userAgent}, ${now}::timestamp, ${now}::timestamp, 1
    )
    ON CONFLICT (session_id) DO UPDATE SET
      last_visit_at = EXCLUDED.last_visit_at,
      page_view_count = visitor_sessions.page_view_count + 1
  `);
}

export async function saveDailyVisitorStats(date: string, visitorCount: number): Promise<void> {
  await db.execute(sql`
    INSERT INTO daily_visitor_stats (date, visitor_count)
    VALUES (${date}::date, ${visitorCount})
    ON CONFLICT (date) DO UPDATE SET visitor_count = EXCLUDED.visitor_count
  `);
}
