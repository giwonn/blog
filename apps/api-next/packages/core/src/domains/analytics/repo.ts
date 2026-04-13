import { sql } from "drizzle-orm";
import { db } from "../../db/client";
import type { PopularArticle } from "./types";

/**
 * Returns the top N articles by page view count within the last `days` days.
 *
 * Mirrors Kotlin's QueryDslAnalyticsReader.findTopPages. The frontend tracks
 * article views with `path = '/articles/<numeric-id>'`, so we strip the
 * `/articles/` prefix (10 chars) and CAST the remainder to bigint to join
 * against articles.id.
 *
 * Uses raw SQL because drizzle's fluent query builder can't express a JOIN
 * on a derived SUBSTRING/CAST expression without escape hatches anyway.
 */
export async function findPopularArticles(limit: number, days: number): Promise<PopularArticle[]> {
  const rows = await db.execute(sql`
    SELECT a.id AS id, a.title AS title, COUNT(pv.id)::bigint AS view_count
    FROM page_views pv
    JOIN articles a ON a.id = CAST(SUBSTRING(pv.path FROM 11) AS bigint)
    WHERE pv.created_at >= NOW() - (${days} || ' days')::interval
      AND pv.path LIKE '/articles/%'
    GROUP BY a.id, a.title
    ORDER BY view_count DESC
    LIMIT ${limit}
  `);
  return (rows as unknown as { id: number | bigint; title: string; view_count: number | bigint }[]).map(
    (r) => ({
      id: Number(r.id),
      title: r.title,
      viewCount: Number(r.view_count),
    }),
  );
}
