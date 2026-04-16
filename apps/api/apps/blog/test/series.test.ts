import { describe, it, expect, beforeEach } from "bun:test";
import { createApp } from "../src/app";
import { db, schema } from "@api/core";
import { resetDb } from "@api/core/test-helpers";

type SeriesListItem = {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  thumbnailUrl: string | null;
  articleCount: number;
};

type SeriesDetailResponse = {
  data: {
    series: { id: number; title: string; slug: string };
    articles: { id: number; slug: string; status: string }[];
  };
};

async function seedSeries(slug: string, title: string) {
  const now = new Date().toISOString();
  const inserted = await db
    .insert(schema.series)
    .values({
      title,
      slug,
      description: null,
      thumbnail_url: null,
      created_at: now,
      updated_at: now,
    })
    .returning({ id: schema.series.id });
  return inserted[0]!.id;
}

async function seedArticle(opts: {
  seriesId: number;
  status: "DRAFT" | "PUBLIC" | "LOCKED" | "PRIVATE";
  slug: string;
}) {
  const now = new Date().toISOString();
  await db.insert(schema.articles).values({
    title: opts.slug,
    slug: opts.slug,
    content: "body",
    status: opts.status,
    series_id: opts.seriesId,
    order_in_series: null,
    created_at: now,
    updated_at: now,
  });
}

describe("public GET /series", () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
  });

  it("returns empty list when no series exist", async () => {
    const res = await app.request("/series");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [] });
  });

  it("returns SeriesWithArticleCount[] with visible-article counts", async () => {
    const id1 = await seedSeries("alpha", "Alpha");
    const id2 = await seedSeries("beta", "Beta");
    await seedArticle({ seriesId: id1, status: "PUBLIC", slug: "p1" });
    await seedArticle({ seriesId: id1, status: "LOCKED", slug: "p2" });
    await seedArticle({ seriesId: id1, status: "DRAFT", slug: "p3" });
    await seedArticle({ seriesId: id1, status: "PRIVATE", slug: "p4" });

    const res = await app.request("/series");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: SeriesListItem[] };
    const byId = Object.fromEntries(body.data.map((s) => [s.id, s]));
    expect(byId[id1]?.articleCount).toBe(2);
    expect(byId[id2]?.articleCount).toBe(0);
  });
});

describe("public GET /series/:slug", () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
  });

  it("returns series + visible articles only", async () => {
    const id = await seedSeries("alpha", "Alpha");
    await seedArticle({ seriesId: id, status: "PUBLIC", slug: "v1" });
    await seedArticle({ seriesId: id, status: "LOCKED", slug: "v2" });
    await seedArticle({ seriesId: id, status: "DRAFT", slug: "h1" });
    await seedArticle({ seriesId: id, status: "PRIVATE", slug: "h2" });

    const res = await app.request("/series/alpha");
    expect(res.status).toBe(200);
    const body = (await res.json()) as SeriesDetailResponse;
    expect(body.data.series.slug).toBe("alpha");
    const articleSlugs = body.data.articles.map((a) => a.slug).sort();
    expect(articleSlugs).toEqual(["v1", "v2"]);
  });

  it("returns 404 for unknown slug", async () => {
    const res = await app.request("/series/nope");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("시리즈를 찾을 수 없습니다");
  });
});
