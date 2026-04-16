import { describe, it, expect, beforeEach } from "bun:test";
import { createApp } from "../src/app";
import { db, schema } from "@api/core";
import { resetDb } from "@api/core/test-helpers";

type ArticleShape = {
  id: number;
  title: string;
  slug: string;
  content: string;
  status: string;
  publishedAt: string | null;
  seriesId: number | null;
  bookId: number | null;
};

type PageResponse = { data: { content: ArticleShape[]; page: { totalElements: number } } };

async function seedArticle(opts: {
  slug: string;
  title?: string;
  status?: "DRAFT" | "PUBLIC" | "LOCKED" | "PRIVATE";
  password?: string | null;
  seriesId?: number | null;
  orderInSeries?: number | null;
  bookId?: number | null;
  orderInBook?: number | null;
  publishedAt?: string | null;
}) {
  const now = new Date().toISOString();
  const status = opts.status ?? "PUBLIC";
  const publishedAt =
    opts.publishedAt !== undefined
      ? opts.publishedAt
      : status === "PUBLIC" || status === "LOCKED"
        ? now
        : null;
  const inserted = await db
    .insert(schema.articles)
    .values({
      title: opts.title ?? opts.slug,
      slug: opts.slug,
      content: "body",
      status,
      password: opts.password ?? null,
      series_id: opts.seriesId ?? null,
      order_in_series: opts.orderInSeries ?? null,
      book_id: opts.bookId ?? null,
      order_in_book: opts.orderInBook ?? null,
      published_at: publishedAt,
      created_at: now,
      updated_at: now,
    })
    .returning({ id: schema.articles.id });
  return inserted[0]!.id;
}

async function seedSeries(slug: string) {
  const now = new Date().toISOString();
  const inserted = await db
    .insert(schema.series)
    .values({ title: slug, slug, description: null, thumbnail_url: null, created_at: now, updated_at: now })
    .returning({ id: schema.series.id });
  return inserted[0]!.id;
}

async function seedBook(slug: string) {
  const now = new Date().toISOString();
  const inserted = await db
    .insert(schema.books)
    .values({
      title: slug,
      slug,
      author: "A",
      publisher: null,
      thumbnail_url: null,
      description: null,
      isbn: null,
      read_start_date: null,
      read_end_date: null,
      rating: null,
      created_at: now,
      updated_at: now,
    })
    .returning({ id: schema.books.id });
  return inserted[0]!.id;
}

describe("public GET /articles list", () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
  });

  it("empty returns empty page", async () => {
    const res = await app.request("/articles");
    expect(res.status).toBe(200);
    const body = (await res.json()) as PageResponse;
    expect(body.data.content).toEqual([]);
    expect(body.data.page.totalElements).toBe(0);
  });

  it("returns only visible articles (PUBLIC + LOCKED)", async () => {
    await seedArticle({ slug: "p", status: "PUBLIC" });
    await seedArticle({ slug: "l", status: "LOCKED", password: "pw" });
    await seedArticle({ slug: "d", status: "DRAFT" });
    await seedArticle({ slug: "pr", status: "PRIVATE" });
    const res = await app.request("/articles");
    const body = (await res.json()) as PageResponse;
    expect(body.data.page.totalElements).toBe(2);
    const slugs = body.data.content.map((a) => a.slug).sort();
    expect(slugs).toEqual(["l", "p"]);
  });

  it("filter=series returns only articles with seriesId", async () => {
    const seriesId = await seedSeries("s1");
    await seedArticle({ slug: "in-series", seriesId });
    await seedArticle({ slug: "standalone" });
    const res = await app.request("/articles?filter=series");
    const body = (await res.json()) as PageResponse;
    expect(body.data.page.totalElements).toBe(1);
    expect(body.data.content[0]?.slug).toBe("in-series");
  });

  it("filter=book returns only articles with bookId", async () => {
    const bookId = await seedBook("b1");
    await seedArticle({ slug: "in-book", bookId });
    await seedArticle({ slug: "standalone" });
    const res = await app.request("/articles?filter=book");
    const body = (await res.json()) as PageResponse;
    expect(body.data.page.totalElements).toBe(1);
    expect(body.data.content[0]?.slug).toBe("in-book");
  });

  it("filter=standalone returns only articles with both null", async () => {
    const seriesId = await seedSeries("s1");
    const bookId = await seedBook("b1");
    await seedArticle({ slug: "in-series", seriesId });
    await seedArticle({ slug: "in-book", bookId });
    await seedArticle({ slug: "alone" });
    const res = await app.request("/articles?filter=standalone");
    const body = (await res.json()) as PageResponse;
    expect(body.data.page.totalElements).toBe(1);
    expect(body.data.content[0]?.slug).toBe("alone");
  });
});

describe("public GET /articles/:slug", () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
  });

  it("PUBLIC returns the article", async () => {
    await seedArticle({ slug: "open", status: "PUBLIC" });
    const res = await app.request("/articles/open");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: ArticleShape };
    expect(body.data.slug).toBe("open");
  });

  it("DRAFT returns 404", async () => {
    await seedArticle({ slug: "draft", status: "DRAFT" });
    const res = await app.request("/articles/draft");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("게시글을 찾을 수 없습니다");
  });

  it("PRIVATE returns 404", async () => {
    await seedArticle({ slug: "priv", status: "PRIVATE" });
    const res = await app.request("/articles/priv");
    expect(res.status).toBe(404);
  });

  it("LOCKED without password returns 403 PASSWORD_REQUIRED", async () => {
    await seedArticle({ slug: "locked", status: "LOCKED", password: "pw" });
    const res = await app.request("/articles/locked");
    expect(res.status).toBe(403);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("비밀번호가 필요한 게시글입니다");
  });

  it("LOCKED with wrong password returns 403 PASSWORD_INCORRECT", async () => {
    await seedArticle({ slug: "locked", status: "LOCKED", password: "pw" });
    const res = await app.request("/articles/locked?password=nope");
    expect(res.status).toBe(403);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("비밀번호가 올바르지 않습니다");
  });

  it("LOCKED with correct password returns the article", async () => {
    await seedArticle({ slug: "locked", status: "LOCKED", password: "pw" });
    const res = await app.request("/articles/locked?password=pw");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: ArticleShape };
    expect(body.data.slug).toBe("locked");
  });

  it("non-existent slug returns 404", async () => {
    const res = await app.request("/articles/nope");
    expect(res.status).toBe(404);
  });
});

describe("public GET /articles/:slug/neighbors", () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
  });

  it("publishedAt mode returns prev/next by published_at", async () => {
    await seedArticle({ slug: "first", publishedAt: "2026-01-01T00:00:00.000Z" });
    await seedArticle({ slug: "middle", publishedAt: "2026-01-02T00:00:00.000Z" });
    await seedArticle({ slug: "last", publishedAt: "2026-01-03T00:00:00.000Z" });
    const res = await app.request("/articles/middle/neighbors");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { previous: { slug: string } | null; next: { slug: string } | null };
    };
    expect(body.data.previous?.slug).toBe("first");
    expect(body.data.next?.slug).toBe("last");
  });

  it("series mode returns prev/next by order_in_series", async () => {
    const seriesId = await seedSeries("s");
    await seedArticle({ slug: "s1", seriesId, orderInSeries: 1 });
    await seedArticle({ slug: "s2", seriesId, orderInSeries: 2 });
    await seedArticle({ slug: "s3", seriesId, orderInSeries: 3 });
    const res = await app.request("/articles/s2/neighbors?series=s");
    const body = (await res.json()) as {
      data: { previous: { slug: string } | null; next: { slug: string } | null };
    };
    expect(body.data.previous?.slug).toBe("s1");
    expect(body.data.next?.slug).toBe("s3");
  });

  it("book mode returns prev/next by order_in_book", async () => {
    const bookId = await seedBook("b");
    await seedArticle({ slug: "b1", bookId, orderInBook: 1 });
    await seedArticle({ slug: "b2", bookId, orderInBook: 2 });
    await seedArticle({ slug: "b3", bookId, orderInBook: 3 });
    const res = await app.request("/articles/b2/neighbors?book=b");
    const body = (await res.json()) as {
      data: { previous: { slug: string } | null; next: { slug: string } | null };
    };
    expect(body.data.previous?.slug).toBe("b1");
    expect(body.data.next?.slug).toBe("b3");
  });

  it("returns null prev/next when there are none", async () => {
    await seedArticle({ slug: "lonely", publishedAt: "2026-01-01T00:00:00.000Z" });
    const res = await app.request("/articles/lonely/neighbors");
    const body = (await res.json()) as {
      data: { previous: unknown; next: unknown };
    };
    expect(body.data.previous).toBeNull();
    expect(body.data.next).toBeNull();
  });
});
