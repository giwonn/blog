import { Hono } from "hono";
import {
  seriesFindAll,
  seriesFindBySlug,
  articlesFindVisibleBySeriesId,
  type Series,
} from "@api-next/core";

type SeriesWithArticleCount = {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  thumbnailUrl: string | null;
  articleCount: number;
};

export const seriesRoute = new Hono();

seriesRoute.get("/", async (c) => {
  const series = await seriesFindAll();
  // N+1 mirrors Kotlin behavior. Optimization deferred.
  const data: SeriesWithArticleCount[] = await Promise.all(
    series.map(async (s: Series) => {
      const articles = await articlesFindVisibleBySeriesId(s.id);
      return {
        id: s.id,
        title: s.title,
        slug: s.slug,
        description: s.description,
        thumbnailUrl: s.thumbnailUrl,
        articleCount: articles.length,
      };
    }),
  );
  return c.json({ data });
});

seriesRoute.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const series = await seriesFindBySlug(slug);
  const articles = await articlesFindVisibleBySeriesId(series.id);
  return c.json({ data: { series, articles } });
});
