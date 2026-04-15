import { describe, it, expect, beforeEach } from "bun:test";
import { createApp } from "../src/app";
import { db, schema } from "@api-next/core";
import { resetDb } from "@api-next/core/test-helpers";

function jsonHeaders(): Record<string, string> {
  return { "content-type": "application/json" };
}

type SeriesResponse = {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

type SeriesDataEnvelope = { data: SeriesResponse };
type SeriesListEnvelope = { data: SeriesResponse[] };
type SeriesDetailEnvelope = { data: { series: SeriesResponse; articles: unknown[] } };
type ErrorEnvelope = { message: string };

const validBody = {
  title: "Hono Deep Dive",
  slug: "hono-deep-dive",
  description: "A series on the Hono web framework",
  thumbnailUrl: "https://example.com/hono.jpg",
};

async function seedSeries(overrides: Partial<typeof validBody> = {}) {
  const now = new Date().toISOString();
  const row = {
    title: overrides.title ?? validBody.title,
    slug: overrides.slug ?? validBody.slug,
    description: overrides.description ?? validBody.description,
    thumbnail_url: overrides.thumbnailUrl ?? validBody.thumbnailUrl,
    created_at: now,
    updated_at: now,
  };
  const inserted = await db.insert(schema.series).values(row).returning({ id: schema.series.id });
  return inserted[0]!.id;
}

async function seedArticle(opts: {
  seriesId: number | null;
  status?: "DRAFT" | "PUBLIC" | "LOCKED" | "PRIVATE";
  orderInSeries?: number | null;
  slug?: string;
  title?: string;
}) {
  const now = new Date().toISOString();
  const inserted = await db
    .insert(schema.articles)
    .values({
      title: opts.title ?? "Test Article",
      slug: opts.slug ?? `test-article-${Math.random().toString(36).slice(2, 9)}`,
      content: "body",
      created_at: now,
      updated_at: now,
      status: opts.status ?? "PUBLIC",
      series_id: opts.seriesId,
      order_in_series: opts.orderInSeries ?? null,
    })
    .returning({ id: schema.articles.id });
  return inserted[0]!.id;
}

describe("admin series endpoints", () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
  });

  // ----- POST -----
  it("POST /admin/series creates a series", async () => {
    const res = await app.request("/admin/series", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as SeriesDataEnvelope;
    expect(body.data.id).toBeGreaterThan(0);
    expect(body.data.slug).toBe("hono-deep-dive");
    expect(body.data.title).toBe("Hono Deep Dive");
    expect(typeof body.data.createdAt).toBe("string");
    expect(typeof body.data.updatedAt).toBe("string");
  });

  it("POST /admin/series rejects duplicate slug with 400", async () => {
    await seedSeries();
    const res = await app.request("/admin/series", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.message).toBe("이미 사용 중인 시리즈 slug입니다");
  });

  it("POST /admin/series rejects missing title with 400", async () => {
    const { title: _t, ...bodyNoTitle } = validBody;
    const res = await app.request("/admin/series", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(bodyNoTitle),
    });
    expect(res.status).toBe(400);
  });

  // ----- GET list -----
  it("GET /admin/series returns empty list", async () => {
    const res = await app.request("/admin/series", {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [] });
  });

  it("GET /admin/series returns all seeded series", async () => {
    await seedSeries({ slug: "a", title: "A" });
    await seedSeries({ slug: "b", title: "B" });
    const res = await app.request("/admin/series", {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as SeriesListEnvelope;
    expect(body.data).toHaveLength(2);
    const slugs = body.data.map((s) => s.slug).sort();
    expect(slugs).toEqual(["a", "b"]);
  });

  // ----- GET by id -----
  it("GET /admin/series/:id returns series + empty articles", async () => {
    const id = await seedSeries();
    const res = await app.request(`/admin/series/${id}`, {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as SeriesDetailEnvelope;
    expect(body.data.series.slug).toBe("hono-deep-dive");
    expect(body.data.articles).toEqual([]);
  });

  it("GET /admin/series/:id returns articles sorted by orderInSeries (all statuses)", async () => {
    const id = await seedSeries();
    await seedArticle({ seriesId: id, status: "PUBLIC", orderInSeries: 2, slug: "s2" });
    await seedArticle({ seriesId: id, status: "DRAFT", orderInSeries: 1, slug: "s1" });
    await seedArticle({ seriesId: id, status: "LOCKED", orderInSeries: 3, slug: "s3" });
    const res = await app.request(`/admin/series/${id}`, {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { series: SeriesResponse; articles: { slug: string }[] } };
    expect(body.data.articles.map((a) => a.slug)).toEqual(["s1", "s2", "s3"]);
  });

  it("GET /admin/series/:id returns 404 for missing id", async () => {
    const res = await app.request("/admin/series/9999", {});
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.message).toBe("시리즈를 찾을 수 없습니다");
  });

  // ----- PUT -----
  it("PUT /admin/series/:id updates and bumps updatedAt", async () => {
    const id = await seedSeries();
    await new Promise((r) => setTimeout(r, 5));
    const res = await app.request(`/admin/series/${id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ ...validBody, title: "Hono Deep Dive (revised)" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SeriesDataEnvelope;
    expect(body.data.title).toBe("Hono Deep Dive (revised)");
    expect(body.data.updatedAt > body.data.createdAt).toBe(true);
  });

  it("PUT /admin/series/:id allows re-saving the same slug", async () => {
    const id = await seedSeries();
    const res = await app.request(`/admin/series/${id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(200);
  });

  it("PUT /admin/series/:id rejects a slug already used by another series", async () => {
    await seedSeries({ slug: "first" });
    const id = await seedSeries({ slug: "second" });
    const res = await app.request(`/admin/series/${id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ ...validBody, slug: "first" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.message).toBe("이미 사용 중인 시리즈 slug입니다");
  });

  it("PUT /admin/series/:id returns 404 for missing id", async () => {
    const res = await app.request("/admin/series/9999", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(404);
  });

  // ----- DELETE -----
  it("DELETE /admin/series/:id removes the series", async () => {
    const id = await seedSeries();
    const del = await app.request(`/admin/series/${id}`, {
      method: "DELETE",
      headers: jsonHeaders(),
    });
    expect(del.status).toBe(204);
    const getRes = await app.request(`/admin/series/${id}`, {});
    expect(getRes.status).toBe(404);
  });

  it("DELETE /admin/series/:id returns 404 for missing id", async () => {
    const res = await app.request("/admin/series/9999", {
      method: "DELETE",
      headers: jsonHeaders(),
    });
    expect(res.status).toBe(404);
  });

  // ----- article-order (recovered from Plan D deferred) -----
  it("PUT /admin/series/:id/article-order reorders articles", async () => {
    const id = await seedSeries();
    const a1 = await seedArticle({ seriesId: id, status: "PUBLIC", orderInSeries: 99, slug: "sa1" });
    const a2 = await seedArticle({ seriesId: id, status: "PUBLIC", orderInSeries: 99, slug: "sa2" });
    const a3 = await seedArticle({ seriesId: id, status: "PUBLIC", orderInSeries: 99, slug: "sa3" });
    const res = await app.request(`/admin/series/${id}/article-order`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ articleIds: [a3, a1, a2] }),
    });
    expect(res.status).toBe(200);
    const get = await app.request(`/admin/series/${id}`, {});
    const body = (await get.json()) as { data: { articles: { slug: string }[] } };
    expect(body.data.articles.map((a) => a.slug)).toEqual(["sa3", "sa1", "sa2"]);
  });

  it("PUT /admin/series/:id/article-order returns 404 for missing series", async () => {
    const res = await app.request(`/admin/series/9999/article-order`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ articleIds: [] }),
    });
    expect(res.status).toBe(404);
  });

});

