import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { createApp } from "../src/app";
import { db, schema, sql, analyticsAddVisitor, analyticsSaveDailyVisitorStats } from "@api-next/core";
import { resetDb, resetRedis } from "@api-next/core/test-helpers";
import { __clearCommentsCache } from "../../../packages/core/src/domains/comments/service";

type PopularArticleShape = { id: number; title: string; viewCount: number };
type RecentCommentShape = { body: string; author: string; avatarUrl: string; url: string; createdAt: string };
type VisitorSummaryShape = { total: number; today: number; yesterday: number };

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

async function seedPageView(path: string, sessionId: string | null = null) {
  const now = new Date().toISOString();
  await db.insert(schema.page_views).values({
    path,
    ip_address: "1.2.3.4",
    user_agent: null,
    referrer: null,
    session_id: sessionId,
    latitude: null,
    longitude: null,
    country: null,
    city: null,
    created_at: now,
  });
}

type FetchSignature = typeof globalThis.fetch;
const realFetch: FetchSignature = globalThis.fetch;

function mockFetchWith(resolver: () => Response | Promise<Response>) {
  globalThis.fetch = (async () => resolver()) as unknown as FetchSignature;
}

function restoreFetch() {
  globalThis.fetch = realFetch;
}

const commentFixture = [
  {
    body: "Great post",
    html_url: "https://github.com/giwonn/giwon-blog/issues/1#issuecomment-1",
    created_at: "2026-04-10T12:00:00Z",
    user: { login: "alice", avatar_url: "https://example.com/alice.jpg" },
  },
  {
    body: "Thanks",
    html_url: "https://github.com/giwonn/giwon-blog/issues/2#issuecomment-2",
    created_at: "2026-04-11T09:00:00Z",
    user: { login: "bob", avatar_url: "https://example.com/bob.jpg" },
  },
];

describe("GET /sidebar/popular-articles", () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
    await resetRedis();
  });

  it("empty state returns empty list", async () => {
    const res = await app.request("/sidebar/popular-articles");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [] });
  });

  it("with page_views returns sorted PopularArticle shape", async () => {
    const id = await seedArticle("Hello");
    await seedPageView(`/articles/${id}`);
    await seedPageView(`/articles/${id}`);
    const res = await app.request("/sidebar/popular-articles");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: PopularArticleShape[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.id).toBe(id);
    expect(body.data[0]?.title).toBe("Hello");
    expect(body.data[0]?.viewCount).toBe(2);
  });
});

describe("GET /sidebar/recent-comments", () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
    await resetRedis();
    __clearCommentsCache();
  });

  afterAll(() => {
    restoreFetch();
  });

  it("returns parsed comments on 200", async () => {
    mockFetchWith(() => new Response(JSON.stringify(commentFixture), { status: 200 }));
    const res = await app.request("/sidebar/recent-comments");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: RecentCommentShape[] };
    expect(body.data).toHaveLength(2);
    expect(body.data[0]?.author).toBe("alice");
    expect(body.data[1]?.author).toBe("bob");
    restoreFetch();
  });

  it("returns empty list when GitHub fetch fails", async () => {
    mockFetchWith(() => new Response("server down", { status: 503 }));
    const res = await app.request("/sidebar/recent-comments");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [] });
    restoreFetch();
  });
});

describe("GET /sidebar/visitors", () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
    await resetRedis();
  });

  afterAll(async () => {
    await resetRedis();
  });

  it("empty state returns zeros", async () => {
    const res = await app.request("/sidebar/visitors");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { total: 0, today: 0, yesterday: 0 } });
  });

  it("uses Redis for today and DB for historical total", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await analyticsAddVisitor(today, "s1");
    await analyticsAddVisitor(today, "s2");
    await analyticsSaveDailyVisitorStats("2026-04-10", 5);
    await analyticsSaveDailyVisitorStats("2026-04-11", 7);
    const res = await app.request("/sidebar/visitors");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: VisitorSummaryShape };
    expect(body.data.today).toBe(2);
    // total = historical (5+7) + today (2) = 14
    expect(body.data.total).toBe(14);
  });
});

// Ensure sql is reachable — keeps the drizzle-orm import non-dead for blog workspace
void sql;
