import { describe, it, expect, beforeEach } from "bun:test";
import { createApp } from "../src/app";
import { db, schema } from "@api/core";
import { resetDb } from "@api/core/test-helpers";

function jsonHeaders(): Record<string, string> {
  return { "content-type": "application/json" };
}

type BookResponse = {
  id: number;
  title: string;
  slug: string;
  author: string;
  publisher: string | null;
  thumbnailUrl: string | null;
  description: string | null;
  isbn: string | null;
  readStartDate: string | null;
  readEndDate: string | null;
  rating: number | null;
  createdAt: string;
  updatedAt: string;
};

type BookDataEnvelope = { data: BookResponse };
type BookListEnvelope = { data: BookResponse[] };
type BookDetailEnvelope = { data: { book: BookResponse; articles: unknown[] } };
type ErrorEnvelope = { message: string };

const validBody = {
  title: "Clean Code",
  slug: "clean-code",
  author: "Robert C. Martin",
  publisher: "Prentice Hall",
  thumbnailUrl: "https://example.com/cc.jpg",
  description: "A handbook of agile software craftsmanship.",
  isbn: "9780132350884",
  readStartDate: "2026-01-15",
  readEndDate: "2026-02-10",
  rating: 5,
};

async function seedBook(overrides: Partial<typeof validBody> & { id?: number } = {}) {
  const now = new Date().toISOString();
  const row = {
    title: overrides.title ?? validBody.title,
    slug: overrides.slug ?? validBody.slug,
    author: overrides.author ?? validBody.author,
    publisher: overrides.publisher ?? validBody.publisher,
    thumbnail_url: overrides.thumbnailUrl ?? validBody.thumbnailUrl,
    description: overrides.description ?? validBody.description,
    isbn: overrides.isbn ?? validBody.isbn,
    read_start_date: overrides.readStartDate ?? validBody.readStartDate,
    read_end_date: overrides.readEndDate ?? validBody.readEndDate,
    rating: overrides.rating ?? validBody.rating,
    created_at: now,
    updated_at: now,
  };
  const inserted = await db.insert(schema.books).values(row).returning({ id: schema.books.id });
  return inserted[0]!.id;
}

async function seedArticle(opts: {
  bookId: number | null;
  status?: "DRAFT" | "PUBLIC" | "LOCKED" | "PRIVATE";
  orderInBook?: number | null;
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
      book_id: opts.bookId,
      order_in_book: opts.orderInBook ?? null,
    })
    .returning({ id: schema.articles.id });
  return inserted[0]!.id;
}

describe("admin books endpoints", () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
  });

  // ----- POST -----
  it("POST /admin/books creates a book", async () => {
    const res = await app.request("/admin/books", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as BookDataEnvelope;
    expect(body.data.id).toBeGreaterThan(0);
    expect(body.data.slug).toBe("clean-code");
    expect(body.data.title).toBe("Clean Code");
    expect(typeof body.data.createdAt).toBe("string");
    expect(typeof body.data.updatedAt).toBe("string");
  });

  it("POST /admin/books rejects duplicate slug with 400", async () => {
    await seedBook();
    const res = await app.request("/admin/books", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.message).toBe("이미 사용 중인 책 slug입니다");
  });

  it("POST /admin/books rejects missing title with 400", async () => {
    const { title: _t, ...bodyNoTitle } = validBody;
    const res = await app.request("/admin/books", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(bodyNoTitle),
    });
    expect(res.status).toBe(400);
  });

  // ----- GET list -----
  it("GET /admin/books returns empty list", async () => {
    const res = await app.request("/admin/books", {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [] });
  });

  it("GET /admin/books returns all seeded books", async () => {
    await seedBook({ slug: "a", title: "A" });
    await seedBook({ slug: "b", title: "B" });
    const res = await app.request("/admin/books", {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as BookListEnvelope;
    expect(body.data).toHaveLength(2);
    const slugs = body.data.map((b) => b.slug).sort();
    expect(slugs).toEqual(["a", "b"]);
  });

  // ----- GET by id -----
  it("GET /admin/books/:id returns book + empty articles", async () => {
    const id = await seedBook();
    const res = await app.request(`/admin/books/${id}`, {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as BookDetailEnvelope;
    expect(body.data.book.slug).toBe("clean-code");
    expect(body.data.articles).toEqual([]);
  });

  it("GET /admin/books/:id returns articles sorted by orderInBook (all statuses)", async () => {
    const id = await seedBook();
    await seedArticle({ bookId: id, status: "PUBLIC", orderInBook: 2, slug: "a2" });
    await seedArticle({ bookId: id, status: "DRAFT", orderInBook: 1, slug: "a1" });
    await seedArticle({ bookId: id, status: "LOCKED", orderInBook: 3, slug: "a3" });
    const res = await app.request(`/admin/books/${id}`, {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { book: BookResponse; articles: { slug: string }[] } };
    expect(body.data.articles.map((a) => a.slug)).toEqual(["a1", "a2", "a3"]);
  });

  it("GET /admin/books/:id returns 404 for missing id", async () => {
    const res = await app.request("/admin/books/9999", {});
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.message).toBe("책을 찾을 수 없습니다");
  });

  // ----- PUT -----
  it("PUT /admin/books/:id updates the book and bumps updatedAt", async () => {
    const id = await seedBook();
    // Force a small wait so updatedAt strictly differs.
    await new Promise((r) => setTimeout(r, 5));
    const res = await app.request(`/admin/books/${id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ ...validBody, title: "Clean Code (2nd ed)" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as BookDataEnvelope;
    expect(body.data.title).toBe("Clean Code (2nd ed)");
    expect(body.data.updatedAt > body.data.createdAt).toBe(true);
  });

  it("PUT /admin/books/:id allows re-saving the same slug", async () => {
    const id = await seedBook();
    const res = await app.request(`/admin/books/${id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(200);
  });

  it("PUT /admin/books/:id rejects a slug already used by another book", async () => {
    await seedBook({ slug: "first" });
    const id = await seedBook({ slug: "second" });
    const res = await app.request(`/admin/books/${id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ ...validBody, slug: "first" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.message).toBe("이미 사용 중인 책 slug입니다");
  });

  it("PUT /admin/books/:id returns 404 for missing id", async () => {
    const res = await app.request("/admin/books/9999", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(404);
  });

  // ----- DELETE -----
  it("DELETE /admin/books/:id removes the book", async () => {
    const id = await seedBook();
    const del = await app.request(`/admin/books/${id}`, {
      method: "DELETE",
      headers: jsonHeaders(),
    });
    expect(del.status).toBe(204);
    const getRes = await app.request(`/admin/books/${id}`, {});
    expect(getRes.status).toBe(404);
  });

  it("DELETE /admin/books/:id returns 404 for missing id", async () => {
    const res = await app.request("/admin/books/9999", {
      method: "DELETE",
      headers: jsonHeaders(),
    });
    expect(res.status).toBe(404);
  });

  // ----- article-order (recovered from Plan C deferred) -----
  it("PUT /admin/books/:id/article-order reorders articles", async () => {
    const id = await seedBook();
    const a1 = await seedArticle({ bookId: id, status: "PUBLIC", orderInBook: 99, slug: "a1" });
    const a2 = await seedArticle({ bookId: id, status: "PUBLIC", orderInBook: 99, slug: "a2" });
    const a3 = await seedArticle({ bookId: id, status: "PUBLIC", orderInBook: 99, slug: "a3" });
    const res = await app.request(`/admin/books/${id}/article-order`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ articleIds: [a3, a1, a2] }),
    });
    expect(res.status).toBe(200);
    const get = await app.request(`/admin/books/${id}`, {});
    const body = (await get.json()) as { data: { articles: { slug: string }[] } };
    expect(body.data.articles.map((a) => a.slug)).toEqual(["a3", "a1", "a2"]);
  });

  it("PUT /admin/books/:id/article-order returns 404 for missing book", async () => {
    const res = await app.request(`/admin/books/9999/article-order`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ articleIds: [] }),
    });
    expect(res.status).toBe(404);
  });

});

