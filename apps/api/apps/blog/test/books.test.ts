import { describe, it, expect, beforeEach } from "bun:test";
import { createApp } from "../src/app";
import { db, schema } from "@api/core";
import { resetDb } from "@api/core/test-helpers";

type BookListItem = {
  id: number;
  title: string;
  slug: string;
  author: string;
  thumbnailUrl: string | null;
  rating: number | null;
  articleCount: number;
};

type BookDetailResponse = {
  data: {
    book: {
      id: number;
      title: string;
      slug: string;
      author: string;
    };
    articles: { id: number; slug: string; status: string }[];
  };
};

async function seedBook(slug: string, title: string) {
  const now = new Date().toISOString();
  const inserted = await db
    .insert(schema.books)
    .values({
      title,
      slug,
      author: "Author",
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

async function seedArticle(opts: {
  bookId: number;
  status: "DRAFT" | "PUBLIC" | "LOCKED" | "PRIVATE";
  slug: string;
}) {
  const now = new Date().toISOString();
  await db.insert(schema.articles).values({
    title: opts.slug,
    slug: opts.slug,
    content: "body",
    status: opts.status,
    book_id: opts.bookId,
    order_in_book: null,
    created_at: now,
    updated_at: now,
  });
}

describe("public GET /books", () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
  });

  it("returns empty list when no books exist", async () => {
    const res = await app.request("/books");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [] });
  });

  it("returns BookWithArticleCount[] with visible-article counts", async () => {
    const id1 = await seedBook("alpha", "Alpha");
    const id2 = await seedBook("beta", "Beta");
    await seedArticle({ bookId: id1, status: "PUBLIC", slug: "p1" });
    await seedArticle({ bookId: id1, status: "LOCKED", slug: "p2" });
    await seedArticle({ bookId: id1, status: "DRAFT", slug: "p3" }); // hidden
    await seedArticle({ bookId: id1, status: "PRIVATE", slug: "p4" }); // hidden
    // id2 has no articles

    const res = await app.request("/books");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: BookListItem[] };
    const byId = Object.fromEntries(body.data.map((b) => [b.id, b]));
    expect(byId[id1]?.articleCount).toBe(2);
    expect(byId[id2]?.articleCount).toBe(0);
  });
});

describe("public GET /books/:slug", () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
  });

  it("returns book + visible articles only", async () => {
    const id = await seedBook("alpha", "Alpha");
    await seedArticle({ bookId: id, status: "PUBLIC", slug: "v1" });
    await seedArticle({ bookId: id, status: "LOCKED", slug: "v2" });
    await seedArticle({ bookId: id, status: "DRAFT", slug: "h1" });
    await seedArticle({ bookId: id, status: "PRIVATE", slug: "h2" });

    const res = await app.request("/books/alpha");
    expect(res.status).toBe(200);
    const body = (await res.json()) as BookDetailResponse;
    expect(body.data.book.slug).toBe("alpha");
    const articleSlugs = body.data.articles.map((a) => a.slug).sort();
    expect(articleSlugs).toEqual(["v1", "v2"]);
  });

  it("returns 404 for unknown slug", async () => {
    const res = await app.request("/books/nope");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("책을 찾을 수 없습니다");
  });
});
