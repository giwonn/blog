import { describe, it, expect, beforeEach } from "bun:test";
import { createApp } from "../src/app";
import { db, schema } from "@api-next/core";
import { resetDb } from "@api-next/core/test-helpers";

type PopularArticleResponse = {
  id: number;
  title: string;
  viewCount: number;
};

type ListEnvelope = { data: PopularArticleResponse[] };

async function seedArticle(title: string) {
  const now = new Date().toISOString();
  const inserted = await db
    .insert(schema.articles)
    .values({
      title,
      slug: title.toLowerCase().replace(/\s+/g, "-"),
      content: "body",
      status: "PUBLIC",
      created_at: now,
      updated_at: now,
      published_at: now,
    })
    .returning({ id: schema.articles.id });
  return inserted[0]!.id;
}

async function seedPageView(path: string, daysAgo = 0) {
  const created = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  await db.insert(schema.page_views).values({
    path,
    ip_address: "127.0.0.1",
    user_agent: null,
    referrer: null,
    session_id: null,
    latitude: null,
    longitude: null,
    country: null,
    city: null,
    created_at: created,
  });
}

describe("admin GET /admin/dashboard/popular-articles", () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
  });

  it("empty page_views returns empty list", async () => {
    const res = await app.request("/admin/dashboard/popular-articles");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [] });
  });

  it("returns top articles sorted by viewCount desc", async () => {
    const id1 = await seedArticle("A1");
    const id2 = await seedArticle("A2");
    const id3 = await seedArticle("A3");
    // A2 has 3 views, A1 has 2, A3 has 1
    await seedPageView(`/articles/${id2}`);
    await seedPageView(`/articles/${id2}`);
    await seedPageView(`/articles/${id2}`);
    await seedPageView(`/articles/${id1}`);
    await seedPageView(`/articles/${id1}`);
    await seedPageView(`/articles/${id3}`);
    const res = await app.request("/admin/dashboard/popular-articles");
    expect(res.status).toBe(200);
    const body = (await res.json()) as ListEnvelope;
    expect(body.data).toHaveLength(3);
    expect(body.data[0]?.id).toBe(id2);
    expect(body.data[0]?.viewCount).toBe(3);
    expect(body.data[1]?.id).toBe(id1);
    expect(body.data[1]?.viewCount).toBe(2);
    expect(body.data[2]?.id).toBe(id3);
    expect(body.data[2]?.viewCount).toBe(1);
  });

  it("excludes page_views older than 30 days", async () => {
    const id = await seedArticle("Old");
    await seedPageView(`/articles/${id}`, 31);
    const res = await app.request("/admin/dashboard/popular-articles");
    const body = (await res.json()) as ListEnvelope;
    expect(body.data).toEqual([]);
  });

  it("excludes non-/articles paths", async () => {
    const id = await seedArticle("Real");
    await seedPageView(`/articles/${id}`);
    await seedPageView("/about");
    await seedPageView("/series/some");
    const res = await app.request("/admin/dashboard/popular-articles");
    const body = (await res.json()) as ListEnvelope;
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.id).toBe(id);
    expect(body.data[0]?.viewCount).toBe(1);
  });

});

