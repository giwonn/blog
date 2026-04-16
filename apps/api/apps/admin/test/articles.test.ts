import { describe, it, expect, beforeEach } from "bun:test";
import path from "node:path";
import { mkdir, writeFile, rm, stat } from "node:fs/promises";
import { createApp } from "../src/app";
import { db, schema } from "@api/core";
import { resetDb } from "@api/core/test-helpers";
import { resetEnvCache } from "@api/core/env";

const IMG_ROOT_ARTICLES = path.join(process.cwd(), "storage-articles-test");
process.env.IMAGE_STORAGE_PATH = IMG_ROOT_ARTICLES;
process.env.IMAGE_PUBLIC_URL = "http://localhost:8081/images";
resetEnvCache();

function jsonHeaders(): Record<string, string> {
  return { "content-type": "application/json" };
}

type ArticleResponse = {
  id: number;
  title: string;
  slug: string;
  content: string;
  status: "DRAFT" | "PUBLIC" | "LOCKED" | "PRIVATE";
  password: string | null;
  seriesId: number | null;
  orderInSeries: number | null;
  bookId: number | null;
  orderInBook: number | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PageResponse = {
  data: {
    content: ArticleResponse[];
    page: {
      totalElements: number;
      totalPages: number;
      number: number;
      size: number;
    };
  };
};

const validBody = {
  title: "Hello Hono",
  slug: "hello-hono",
  content: "# Hello\nbody text",
  status: "DRAFT" as const,
  password: null,
  seriesId: null,
  orderInSeries: null,
  bookId: null,
  orderInBook: null,
};

type ArticleStatusLiteral = "DRAFT" | "PUBLIC" | "LOCKED" | "PRIVATE";

async function seedArticle(
  overrides: Partial<Omit<typeof validBody, "status">> & {
    status?: ArticleStatusLiteral;
    publishedAt?: string | null;
  } = {},
) {
  const now = new Date().toISOString();
  const status: ArticleStatusLiteral = overrides.status ?? "PUBLIC";
  const inserted = await db
    .insert(schema.articles)
    .values({
      title: overrides.title ?? validBody.title,
      slug: overrides.slug ?? `seed-${Math.random().toString(36).slice(2, 9)}`,
      content: overrides.content ?? validBody.content,
      status,
      password: overrides.password ?? null,
      series_id: overrides.seriesId ?? null,
      order_in_series: overrides.orderInSeries ?? null,
      book_id: overrides.bookId ?? null,
      order_in_book: overrides.orderInBook ?? null,
      published_at: overrides.publishedAt ?? (status === "PUBLIC" || status === "LOCKED" ? now : null),
      created_at: now,
      updated_at: now,
    })
    .returning({ id: schema.articles.id });
  return inserted[0]!.id;
}

describe("admin articles endpoints", () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
  });

  // ----- POST -----
  it("POST creates a DRAFT article with publishedAt null", async () => {
    const res = await app.request("/admin/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: ArticleResponse };
    expect(body.data.id).toBeGreaterThan(0);
    expect(body.data.slug).toBe("hello-hono");
    expect(body.data.status).toBe("DRAFT");
    expect(body.data.publishedAt).toBeNull();
  });

  it("POST creates a PUBLIC article with publishedAt populated", async () => {
    const res = await app.request("/admin/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ ...validBody, status: "PUBLIC" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: ArticleResponse };
    expect(body.data.status).toBe("PUBLIC");
    expect(body.data.publishedAt).not.toBeNull();
    expect(typeof body.data.publishedAt).toBe("string");
  });

  it("POST rejects duplicate slug with 400", async () => {
    await seedArticle({ slug: "hello-hono" });
    const res = await app.request("/admin/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("이미 사용 중인 slug입니다");
  });

  it("POST rejects missing content with 400", async () => {
    const { content: _c, ...bodyNoContent } = validBody;
    const res = await app.request("/admin/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(bodyNoContent),
    });
    expect(res.status).toBe(400);
  });

  // ----- GET list -----
  it("GET /admin/articles empty returns empty page", async () => {
    const res = await app.request("/admin/articles", {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as PageResponse;
    expect(body.data.content).toEqual([]);
    expect(body.data.page.totalElements).toBe(0);
  });

  it("GET /admin/articles paginates 25 articles into 3 pages of 10", async () => {
    for (let i = 0; i < 25; i++) {
      await seedArticle({ slug: `art-${i.toString().padStart(2, "0")}` });
    }
    const res = await app.request("/admin/articles", {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as PageResponse;
    expect(body.data.content).toHaveLength(10);
    expect(body.data.page.totalElements).toBe(25);
    expect(body.data.page.totalPages).toBe(3);
    expect(body.data.page.number).toBe(0);
  });

  it("GET /admin/articles?page=2&size=10 returns last 5 elements", async () => {
    for (let i = 0; i < 25; i++) {
      await seedArticle({ slug: `art-${i.toString().padStart(2, "0")}` });
    }
    const res = await app.request("/admin/articles?page=2&size=10", {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as PageResponse;
    expect(body.data.content).toHaveLength(5);
    expect(body.data.page.number).toBe(2);
  });

  // ----- GET by id -----
  it("GET /admin/articles/:id returns the article", async () => {
    const id = await seedArticle({ slug: "abc" });
    const res = await app.request(`/admin/articles/${id}`, {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: ArticleResponse };
    expect(body.data.id).toBe(id);
    expect(body.data.slug).toBe("abc");
  });

  it("GET /admin/articles/:id returns 404 for missing", async () => {
    const res = await app.request("/admin/articles/9999", {});
    expect(res.status).toBe(404);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("게시글을 찾을 수 없습니다");
  });

  // ----- PUT -----
  it("PUT updates and bumps updatedAt", async () => {
    const id = await seedArticle({ slug: "to-update" });
    await new Promise((r) => setTimeout(r, 5));
    const res = await app.request(`/admin/articles/${id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ ...validBody, slug: "to-update", title: "Updated", status: "PUBLIC" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: ArticleResponse };
    expect(body.data.title).toBe("Updated");
    expect(body.data.updatedAt > body.data.createdAt).toBe(true);
  });

  it("PUT slug change to an existing slug → 400", async () => {
    await seedArticle({ slug: "first" });
    const id = await seedArticle({ slug: "second" });
    const res = await app.request(`/admin/articles/${id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ ...validBody, slug: "first" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("이미 사용 중인 slug입니다");
  });

  it("PUT same slug as self → 200", async () => {
    const id = await seedArticle({ slug: "stable" });
    const res = await app.request(`/admin/articles/${id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ ...validBody, slug: "stable" }),
    });
    expect(res.status).toBe(200);
  });

  it("PUT DRAFT → PUBLIC sets publishedAt for the first time", async () => {
    const id = await seedArticle({ slug: "to-publish", status: "DRAFT", publishedAt: null });
    const res = await app.request(`/admin/articles/${id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ ...validBody, slug: "to-publish", status: "PUBLIC" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: ArticleResponse };
    expect(body.data.status).toBe("PUBLIC");
    expect(body.data.publishedAt).not.toBeNull();
  });

  it("PUT 404 for missing", async () => {
    const res = await app.request("/admin/articles/9999", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(404);
  });

  // ----- DELETE -----
  it("DELETE removes the article", async () => {
    const id = await seedArticle();
    const del = await app.request(`/admin/articles/${id}`, {
      method: "DELETE",
      headers: jsonHeaders(),
    });
    expect(del.status).toBe(204);
    const get = await app.request(`/admin/articles/${id}`, {});
    expect(get.status).toBe(404);
  });

  it("DELETE 404 for missing", async () => {
    const res = await app.request("/admin/articles/9999", {
      method: "DELETE",
      headers: jsonHeaders(),
    });
    expect(res.status).toBe(404);
  });

  // --- Plan J: image integration ---
  const IMG_ROOT = IMG_ROOT_ARTICLES;

  async function seedTempImage(): Promise<string> {
    await mkdir(path.join(IMG_ROOT, "temp"), { recursive: true });
    const id = crypto.randomUUID();
    const filename = `${id}.png`;
    await writeFile(path.join(IMG_ROOT, "temp", filename), new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    return `http://localhost:8081/images/temp/${filename}`;
  }

  async function fileExists(url: string): Promise<boolean> {
    const rel = url.replace("http://localhost:8081/images/", "");
    try {
      await stat(path.join(IMG_ROOT, rel));
      return true;
    } catch {
      return false;
    }
  }

  it("POST article with temp image moves file and rewrites URL", async () => {
    await rm(IMG_ROOT, { recursive: true, force: true });
    const tempUrl = await seedTempImage();
    const res = await app.request("/admin/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        title: "With image",
        slug: "with-image",
        content: `![alt](${tempUrl})`,
        status: "PUBLIC",
        password: null,
        seriesId: null,
        orderInSeries: null,
        bookId: null,
        orderInBook: null,
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: number; content: string } };
    expect(body.data.content).not.toContain("/temp/");
    expect(body.data.content).toContain(`/articles/${body.data.id}/`);
    const permUrl = body.data.content.match(/\((https?:[^)]+)\)/)![1]!;
    expect(await fileExists(permUrl)).toBe(true);
    expect(await fileExists(tempUrl)).toBe(false);
  });

  it("PUT article removing an image deletes the old file", async () => {
    await rm(IMG_ROOT, { recursive: true, force: true });
    const tempUrl = await seedTempImage();
    const createRes = await app.request("/admin/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        title: "Remove",
        slug: "remove-img",
        content: `before ![a](${tempUrl}) after`,
        status: "PUBLIC",
        password: null,
        seriesId: null,
        orderInSeries: null,
        bookId: null,
        orderInBook: null,
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { data: { id: number; content: string } };
    const permUrl = created.data.content.match(/\((https?:[^)]+)\)/)![1]!;
    expect(await fileExists(permUrl)).toBe(true);

    const putRes = await app.request(`/admin/articles/${created.data.id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({
        title: "Remove",
        slug: "remove-img",
        content: "no image anymore",
        status: "PUBLIC",
        password: null,
        seriesId: null,
        orderInSeries: null,
        bookId: null,
        orderInBook: null,
      }),
    });
    expect(putRes.status).toBe(200);
    expect(await fileExists(permUrl)).toBe(false);
  });

  it("DELETE article removes all its images from disk", async () => {
    await rm(IMG_ROOT, { recursive: true, force: true });
    const tempUrl = await seedTempImage();
    const createRes = await app.request("/admin/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        title: "Delete",
        slug: "delete-img",
        content: `![a](${tempUrl})`,
        status: "PUBLIC",
        password: null,
        seriesId: null,
        orderInSeries: null,
        bookId: null,
        orderInBook: null,
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { data: { id: number; content: string } };
    const permUrl = created.data.content.match(/\((https?:[^)]+)\)/)![1]!;
    expect(await fileExists(permUrl)).toBe(true);

    const delRes = await app.request(`/admin/articles/${created.data.id}`, {
      method: "DELETE",
      headers: jsonHeaders(),
    });
    expect(delRes.status).toBe(204);
    expect(await fileExists(permUrl)).toBe(false);
  });
});
