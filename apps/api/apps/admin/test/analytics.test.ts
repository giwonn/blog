import { describe, it, expect, beforeEach } from "bun:test";
import { createApp } from "../src/app";
import { db, schema } from "@api/core";
import { resetDb } from "@api/core/test-helpers";

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

async function seedPageView(opts: {
  path: string;
  createdAt?: string;
  ip?: string;
  sessionId?: string | null;
  referrer?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  country?: string | null;
  city?: string | null;
}) {
  await db.insert(schema.page_views).values({
    path: opts.path,
    ip_address: opts.ip ?? "127.0.0.1",
    user_agent: null,
    referrer: opts.referrer ?? null,
    session_id: opts.sessionId !== undefined ? opts.sessionId : "s-default",
    latitude: opts.latitude ?? null,
    longitude: opts.longitude ?? null,
    country: opts.country ?? null,
    city: opts.city ?? null,
    created_at: opts.createdAt ?? new Date().toISOString(),
  });
}

const today = new Date().toISOString().slice(0, 10);
const todayQuery = `from=${today}&to=${today}&tz=UTC`;

describe("admin GET /admin/analytics/overview", () => {
  const app = createApp();
  beforeEach(async () => {
    await resetDb();
  });

  it("empty returns zeros", async () => {
    const res = await app.request(`/admin/analytics/overview?${todayQuery}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { totalPageViews: number; topPages: unknown[] } };
    expect(body.data.totalPageViews).toBe(0);
    expect(body.data.topPages).toEqual([]);
  });

  it("sums top-page view counts", async () => {
    const id = await seedArticle("Hello");
    await seedPageView({ path: `/articles/${id}` });
    await seedPageView({ path: `/articles/${id}` });
    const res = await app.request(`/admin/analytics/overview?${todayQuery}`);
    const body = (await res.json()) as { data: { totalPageViews: number; topPages: { articleId: number; viewCount: number }[] } };
    expect(body.data.totalPageViews).toBe(2);
    expect(body.data.topPages[0]?.articleId).toBe(id);
    expect(body.data.topPages[0]?.viewCount).toBe(2);
  });
});

describe("admin GET /admin/analytics/page-views", () => {
  const app = createApp();
  beforeEach(async () => {
    await resetDb();
  });

  it("returns daily totals grouped by UTC date", async () => {
    const id = await seedArticle("A");
    const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await seedPageView({ path: `/articles/${id}`, createdAt: yesterdayIso });
    await seedPageView({ path: `/articles/${id}`, createdAt: yesterdayIso });
    await seedPageView({ path: `/articles/${id}` });
    const yesterday = yesterdayIso.slice(0, 10);
    const res = await app.request(
      `/admin/analytics/page-views?from=${yesterday}&to=${today}&tz=UTC`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { date: string; viewCount: number }[] };
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    const byDate = Object.fromEntries(body.data.map((d) => [d.date, d.viewCount]));
    expect(byDate[yesterday]).toBe(2);
    expect(byDate[today]).toBe(1);
  });
});

describe("admin GET /admin/analytics/daily-visitors", () => {
  const app = createApp();
  beforeEach(async () => {
    await resetDb();
  });

  it("counts distinct sessions per day", async () => {
    const id = await seedArticle("A");
    await seedPageView({ path: `/articles/${id}`, sessionId: "s1" });
    await seedPageView({ path: `/articles/${id}`, sessionId: "s1" });
    await seedPageView({ path: `/articles/${id}`, sessionId: "s2" });
    const res = await app.request(
      `/admin/analytics/daily-visitors?${todayQuery}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { date: string; visitorCount: number }[] };
    expect(body.data[0]?.visitorCount).toBe(2);
  });
});

describe("admin GET /admin/analytics/top-pages", () => {
  const app = createApp();
  beforeEach(async () => {
    await resetDb();
  });

  it("returns PageViewCount shape sorted desc", async () => {
    const a = await seedArticle("A");
    const b = await seedArticle("B");
    await seedPageView({ path: `/articles/${a}` });
    await seedPageView({ path: `/articles/${b}` });
    await seedPageView({ path: `/articles/${b}` });
    const res = await app.request(`/admin/analytics/top-pages?${todayQuery}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { articleId: number; title: string; viewCount: number }[] };
    expect(body.data[0]?.articleId).toBe(b);
    expect(body.data[0]?.viewCount).toBe(2);
    expect(body.data[1]?.articleId).toBe(a);
  });
});

describe("admin GET /admin/analytics/referrers", () => {
  const app = createApp();
  beforeEach(async () => {
    await resetDb();
  });

  it("null referrer is bucketed as (직접 접속)", async () => {
    const id = await seedArticle("A");
    await seedPageView({ path: `/articles/${id}`, referrer: null });
    await seedPageView({ path: `/articles/${id}`, referrer: "https://google.com" });
    const res = await app.request(`/admin/analytics/referrers?${todayQuery}`);
    const body = (await res.json()) as { data: { referrer: string; viewCount: number }[] };
    const refs = body.data.map((r) => r.referrer);
    expect(refs).toContain("(직접 접속)");
    expect(refs).toContain("https://google.com");
  });
});

describe("admin GET /admin/analytics/visitor-locations", () => {
  const app = createApp();
  beforeEach(async () => {
    await resetDb();
  });

  it("groups by ip + lat/lng, excludes rows without geo", async () => {
    const id = await seedArticle("A");
    await seedPageView({
      path: `/articles/${id}`,
      ip: "1.1.1.1",
      latitude: 37.5,
      longitude: 127.0,
      country: "South Korea",
      city: "Seoul",
    });
    await seedPageView({
      path: `/articles/${id}`,
      ip: "1.1.1.1",
      latitude: 37.5,
      longitude: 127.0,
      country: "South Korea",
      city: "Seoul",
    });
    await seedPageView({ path: `/articles/${id}`, ip: "2.2.2.2" }); // no geo
    const res = await app.request(
      `/admin/analytics/visitor-locations?${todayQuery}`,
    );
    const body = (await res.json()) as { data: { ipAddress: string; visitCount: number }[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.ipAddress).toBe("1.1.1.1");
    expect(body.data[0]?.visitCount).toBe(2);
  });
});

describe("admin GET /admin/analytics/ip-access-history", () => {
  const app = createApp();
  beforeEach(async () => {
    await resetDb();
  });

  it("filters to one ip", async () => {
    const id = await seedArticle("A");
    await seedPageView({ path: `/articles/${id}`, ip: "1.1.1.1" });
    await seedPageView({ path: "/about", ip: "1.1.1.1" });
    await seedPageView({ path: `/articles/${id}`, ip: "2.2.2.2" });
    const res = await app.request(
      `/admin/analytics/ip-access-history?ip=1.1.1.1&${todayQuery}`,
    );
    const body = (await res.json()) as { data: { path: string; ipAddress: string }[] };
    expect(body.data).toHaveLength(2);
    for (const row of body.data) expect(row.ipAddress).toBe("1.1.1.1");
  });
});

describe("admin GET /admin/analytics/article-access-history", () => {
  const app = createApp();
  beforeEach(async () => {
    await resetDb();
  });

  it("filters to one article", async () => {
    const a = await seedArticle("A");
    const b = await seedArticle("B");
    await seedPageView({ path: `/articles/${a}`, ip: "1.1.1.1" });
    await seedPageView({ path: `/articles/${a}`, ip: "2.2.2.2" });
    await seedPageView({ path: `/articles/${b}`, ip: "1.1.1.1" });
    const res = await app.request(
      `/admin/analytics/article-access-history?articleId=${a}&${todayQuery}`,
    );
    const body = (await res.json()) as { data: { ipAddress: string }[] };
    expect(body.data).toHaveLength(2);
  });
});

describe("admin analytics validation", () => {
  const app = createApp();
  beforeEach(async () => {
    await resetDb();
  });

  it("missing from/to → 400", async () => {
    const res = await app.request("/admin/analytics/overview");
    expect(res.status).toBe(400);
  });
});
