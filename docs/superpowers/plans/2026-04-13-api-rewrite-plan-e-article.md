# API Rewrite — Plan E: Article Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Kotlin `article` domain (8 endpoints) and recover the two `article-order` endpoints deferred from Plans C and D. Article is the central, largest domain — first plan to introduce pagination, multi-state authorization with password gating, and 3-mode neighbor queries.

**Architecture:** `domains/articles/` is expanded from a 4-function read-only stub (added by Plan C, extended by Plan D) into a full domain with `service.ts`, write functions, neighbor queries, and routes. A new `packages/core/src/pagination.ts` carries the shared `Page<T>` shape. Image processing and Redis caching are skipped to Plans J and beyond.

**Tech Stack:** Hono 4, `@hono/zod-validator`, Drizzle ORM + `bun:sql`, Zod 4, `bun:test`, jose.

**Design reference:** `docs/superpowers/specs/2026-04-13-api-rewrite-plan-e-article-design.md`

---

## Scope Check

This plan ports one full domain (article) and recovers two endpoints from prior plans. It does not introduce image processing (Plan J), caching, or a sort-param parser. It modifies Plans A–D files only at well-defined extension points: `errors.ts` (+4 codes), `domains/articles/*` (extension), `core/src/index.ts` (barrel), `apps/{blog,admin}/src/app.ts` (one mount line each), and `apps/admin/src/routes/{books,series}.ts` (one new handler each).

## File Structure

```
apps/api-next/
├── apps/
│   ├── admin/
│   │   ├── src/
│   │   │   ├── app.ts                          # +mount /admin/articles
│   │   │   └── routes/
│   │   │       ├── articles.ts                 # NEW: 5 admin handlers
│   │   │       ├── books.ts                    # MODIFY: +PUT /:id/article-order
│   │   │       └── series.ts                   # MODIFY: +PUT /:id/article-order
│   │   └── test/
│   │       ├── articles.test.ts                # NEW: ~16 admin TDD cases
│   │       ├── books.test.ts                   # MODIFY: +2 article-order cases
│   │       └── series.test.ts                  # MODIFY: +2 article-order cases
│   └── blog/
│       ├── src/
│       │   ├── app.ts                          # +mount /articles
│       │   └── routes/
│       │       └── articles.ts                 # NEW: 3 public handlers
│       └── test/
│           └── articles.test.ts                # NEW: ~14 public TDD cases
└── packages/core/
    └── src/
        ├── errors.ts                           # +4 ARTICLE_* entries
        ├── pagination.ts                       # NEW: Page<T> + helper
        ├── domains/articles/
        │   ├── types.ts                        # MODIFY: +Zod schemas, neighbor types
        │   ├── repo.ts                         # MODIFY: +12 functions
        │   ├── service.ts                      # NEW
        │   └── index.ts                        # MODIFY: +article* exports
        └── index.ts                            # MODIFY: +Page export, +article surface
```

---

## Task 1: Extend ErrorCode with ARTICLE_* entries

**Files:**
- Modify: `apps/api-next/packages/core/src/errors.ts`

- [ ] **Step 1: Add four new entries**

Read `~/github/new-blog/apps/api-next/packages/core/src/errors.ts`. Replace the `ErrorCode` const body with:

```ts
export const ErrorCode = {
  UNAUTHORIZED: { status: 401, message: "Unauthorized" },
  INTERNAL: { status: 500, message: "Internal server error" },
  BOOK_NOT_FOUND: { status: 404, message: "책을 찾을 수 없습니다" },
  BOOK_SLUG_DUPLICATE: { status: 400, message: "이미 사용 중인 책 slug입니다" },
  SERIES_NOT_FOUND: { status: 404, message: "시리즈를 찾을 수 없습니다" },
  SERIES_SLUG_DUPLICATE: { status: 400, message: "이미 사용 중인 시리즈 slug입니다" },
  ARTICLE_NOT_FOUND: { status: 404, message: "게시글을 찾을 수 없습니다" },
  ARTICLE_PASSWORD_REQUIRED: { status: 403, message: "비밀번호가 필요한 게시글입니다" },
  ARTICLE_PASSWORD_INCORRECT: { status: 403, message: "비밀번호가 올바르지 않습니다" },
  ARTICLE_SLUG_DUPLICATE: { status: 400, message: "이미 사용 중인 slug입니다" },
} as const satisfies Record<string, ErrorCodeValue>;
```

- [ ] **Step 2: Type-check + run core tests**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
bun test
```
Expected: tsc exit 0; bun test 6/6 pass.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/errors.ts
git commit -m "feat(api): add ARTICLE_* error codes (NOT_FOUND, PASSWORD_*, SLUG_DUPLICATE)

Korean messages mirror the Kotlin ErrorCode enum verbatim. Article uses
404 for hidden articles (DRAFT/PRIVATE) so existence is not leaked, and
403 with distinct messages for missing vs incorrect LOCKED password."
```

---

## Task 2: Add `pagination.ts` util to `@api-next/core`

**Files:**
- Create: `apps/api-next/packages/core/src/pagination.ts`

- [ ] **Step 1: Write the pagination util**

Write `~/github/new-blog/apps/api-next/packages/core/src/pagination.ts`:

```ts
/**
 * Minimal subset of Spring Data's Page<T> shape, mirroring the JSON
 * the legacy Kotlin API returns for paginated endpoints. The cutover
 * frontend consumes this exact shape, so do not rename or remove fields
 * without coordinating a frontend update.
 */
export type Page<T> = {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number; // current page index, 0-based
  size: number;
  first: boolean;
  last: boolean;
  empty: boolean;
};

/**
 * Builds a Page<T> from a slice of content + the total row count.
 * Caller computes `content` and `totalElements` separately (one query
 * for rows, one for COUNT) then hands them in.
 */
export function makePage<T>(
  content: T[],
  totalElements: number,
  pageNumber: number,
  pageSize: number,
): Page<T> {
  const totalPages = pageSize > 0 ? Math.ceil(totalElements / pageSize) : 0;
  return {
    content,
    totalElements,
    totalPages,
    number: pageNumber,
    size: pageSize,
    first: pageNumber === 0,
    last: totalPages === 0 ? true : pageNumber >= totalPages - 1,
    empty: content.length === 0,
  };
}
```

- [ ] **Step 2: Re-export from core barrel**

Read `~/github/new-blog/apps/api-next/packages/core/src/index.ts`. Append:

```ts
export { type Page, makePage } from "./pagination";
```

- [ ] **Step 3: Type-check**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/pagination.ts apps/api-next/packages/core/src/index.ts
git commit -m "feat(api): add Page<T> + makePage util in @api-next/core

Mirrors the Spring Data Page shape that the legacy Kotlin API returns,
so the cutover frontend sees no diff in paginated responses. Used by
Plan E article list endpoints; future paginated domains will reuse it."
```

---

## Task 3: Failing admin articles integration test (TDD red)

**Files:**
- Create: `apps/api-next/apps/admin/test/articles.test.ts`

- [ ] **Step 1: Write the test file**

Write `~/github/new-blog/apps/api-next/apps/admin/test/articles.test.ts`:

```ts
import { describe, it, expect, beforeEach, beforeAll } from "bun:test";
import { SignJWT } from "jose";
import { createApp } from "../src/app";
import { env, db, schema } from "@api-next/core";
import { resetDb } from "@api-next/core/test-helpers";

const secret = new TextEncoder().encode(env.ADMIN_JWT_SECRET);

async function mintValidToken() {
  return await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(env.ADMIN_GOOGLE_SUB[0]!)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
    .sign(secret);
}

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
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
    totalElements: number;
    totalPages: number;
    number: number;
    size: number;
    first: boolean;
    last: boolean;
    empty: boolean;
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

async function seedArticle(overrides: Partial<typeof validBody> & { publishedAt?: string | null } = {}) {
  const now = new Date().toISOString();
  const status = overrides.status ?? "PUBLIC";
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
  let token: string;

  beforeAll(async () => {
    token = await mintValidToken();
  });

  beforeEach(async () => {
    await resetDb();
  });

  // ----- POST -----
  it("POST creates a DRAFT article with publishedAt null", async () => {
    const res = await app.request("/admin/articles", {
      method: "POST",
      headers: authHeaders(token),
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
      headers: authHeaders(token),
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
      headers: authHeaders(token),
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
      headers: authHeaders(token),
      body: JSON.stringify(bodyNoContent),
    });
    expect(res.status).toBe(400);
  });

  // ----- GET list -----
  it("GET /admin/articles empty returns empty page", async () => {
    const res = await app.request("/admin/articles", { headers: authHeaders(token) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as PageResponse;
    expect(body.data.content).toEqual([]);
    expect(body.data.totalElements).toBe(0);
    expect(body.data.empty).toBe(true);
    expect(body.data.first).toBe(true);
    expect(body.data.last).toBe(true);
  });

  it("GET /admin/articles paginates 25 articles into 3 pages of 10", async () => {
    for (let i = 0; i < 25; i++) {
      await seedArticle({ slug: `art-${i.toString().padStart(2, "0")}` });
    }
    const res = await app.request("/admin/articles", { headers: authHeaders(token) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as PageResponse;
    expect(body.data.content).toHaveLength(10);
    expect(body.data.totalElements).toBe(25);
    expect(body.data.totalPages).toBe(3);
    expect(body.data.number).toBe(0);
    expect(body.data.first).toBe(true);
    expect(body.data.last).toBe(false);
  });

  it("GET /admin/articles?page=2&size=10 returns last 5 elements", async () => {
    for (let i = 0; i < 25; i++) {
      await seedArticle({ slug: `art-${i.toString().padStart(2, "0")}` });
    }
    const res = await app.request("/admin/articles?page=2&size=10", { headers: authHeaders(token) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as PageResponse;
    expect(body.data.content).toHaveLength(5);
    expect(body.data.number).toBe(2);
    expect(body.data.last).toBe(true);
  });

  // ----- GET by id -----
  it("GET /admin/articles/:id returns the article", async () => {
    const id = await seedArticle({ slug: "abc" });
    const res = await app.request(`/admin/articles/${id}`, { headers: authHeaders(token) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: ArticleResponse };
    expect(body.data.id).toBe(id);
    expect(body.data.slug).toBe("abc");
  });

  it("GET /admin/articles/:id returns 404 for missing", async () => {
    const res = await app.request("/admin/articles/9999", { headers: authHeaders(token) });
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
      headers: authHeaders(token),
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
      headers: authHeaders(token),
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
      headers: authHeaders(token),
      body: JSON.stringify({ ...validBody, slug: "stable" }),
    });
    expect(res.status).toBe(200);
  });

  it("PUT DRAFT → PUBLIC sets publishedAt for the first time", async () => {
    const id = await seedArticle({ slug: "to-publish", status: "DRAFT", publishedAt: null });
    const res = await app.request(`/admin/articles/${id}`, {
      method: "PUT",
      headers: authHeaders(token),
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
      headers: authHeaders(token),
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(404);
  });

  // ----- DELETE -----
  it("DELETE removes the article", async () => {
    const id = await seedArticle();
    const del = await app.request(`/admin/articles/${id}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
    expect(del.status).toBe(204);
    const get = await app.request(`/admin/articles/${id}`, { headers: authHeaders(token) });
    expect(get.status).toBe(404);
  });

  it("DELETE 404 for missing", async () => {
    const res = await app.request("/admin/articles/9999", {
      method: "DELETE",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(404);
  });

  it("all endpoints 401 without JWT", async () => {
    const list = await app.request("/admin/articles");
    expect(list.status).toBe(401);
    const get = await app.request("/admin/articles/1");
    expect(get.status).toBe(401);
    const post = await app.request("/admin/articles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(post.status).toBe(401);
    const put = await app.request("/admin/articles/1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(put.status).toBe(401);
    const del = await app.request("/admin/articles/1", { method: "DELETE" });
    expect(del.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run and verify red**

```bash
cd ~/github/new-blog/apps/api-next/apps/admin
bun test test/articles.test.ts 2>&1 | tail -15
```
Expected: most tests fail (route doesn't exist). Exit non-zero.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/test/articles.test.ts
git commit -m "test(api): add failing admin articles integration tests (TDD red)"
```

---

## Task 4: Failing public blog articles integration test (TDD red)

**Files:**
- Create: `apps/api-next/apps/blog/test/articles.test.ts`

- [ ] **Step 1: Write the test file**

Write `~/github/new-blog/apps/api-next/apps/blog/test/articles.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "bun:test";
import { createApp } from "../src/app";
import { db, schema } from "@api-next/core";
import { resetDb } from "@api-next/core/test-helpers";

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

type PageResponse = { data: { content: ArticleShape[]; totalElements: number } };

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
    expect(body.data.totalElements).toBe(0);
  });

  it("returns only visible articles (PUBLIC + LOCKED)", async () => {
    await seedArticle({ slug: "p", status: "PUBLIC" });
    await seedArticle({ slug: "l", status: "LOCKED", password: "pw" });
    await seedArticle({ slug: "d", status: "DRAFT" });
    await seedArticle({ slug: "pr", status: "PRIVATE" });
    const res = await app.request("/articles");
    const body = (await res.json()) as PageResponse;
    expect(body.data.totalElements).toBe(2);
    const slugs = body.data.content.map((a) => a.slug).sort();
    expect(slugs).toEqual(["l", "p"]);
  });

  it("filter=series returns only articles with seriesId", async () => {
    const seriesId = await seedSeries("s1");
    await seedArticle({ slug: "in-series", seriesId });
    await seedArticle({ slug: "standalone" });
    const res = await app.request("/articles?filter=series");
    const body = (await res.json()) as PageResponse;
    expect(body.data.totalElements).toBe(1);
    expect(body.data.content[0]?.slug).toBe("in-series");
  });

  it("filter=book returns only articles with bookId", async () => {
    const bookId = await seedBook("b1");
    await seedArticle({ slug: "in-book", bookId });
    await seedArticle({ slug: "standalone" });
    const res = await app.request("/articles?filter=book");
    const body = (await res.json()) as PageResponse;
    expect(body.data.totalElements).toBe(1);
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
    expect(body.data.totalElements).toBe(1);
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
```

- [ ] **Step 2: Run and verify red**

```bash
cd ~/github/new-blog/apps/api-next/apps/blog
bun test test/articles.test.ts 2>&1 | tail -10
```
Expected: failures (no `/articles` route yet). Exit non-zero.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/blog/test/articles.test.ts
git commit -m "test(api): add failing public articles integration tests (TDD red)

15 cases covering filter, password-gated LOCKED, neighbors in 3 modes,
and 404 visibility hiding for DRAFT/PRIVATE."
```

---

## Task 5: Extend article types with Zod schemas + neighbor types

**Files:**
- Modify: `apps/api-next/packages/core/src/domains/articles/types.ts`

- [ ] **Step 1: Append schemas and neighbor types**

Read `~/github/new-blog/apps/api-next/packages/core/src/domains/articles/types.ts`. The current file (from Plan C) defines `ArticleStatus`, `VISIBLE_STATUSES`, and the `Article` TS type. Append the new content to the end of the file:

```ts
import { z } from "zod";

export const ArticleStatusSchema = z.enum(["DRAFT", "PUBLIC", "LOCKED", "PRIVATE"]);

export const ArticleRequestSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  content: z.string().min(1),
  status: ArticleStatusSchema.default("DRAFT"),
  password: z.string().nullable().default(null),
  seriesId: z.number().int().positive().nullable().default(null),
  orderInSeries: z.number().int().nullable().default(null),
  bookId: z.number().int().positive().nullable().default(null),
  orderInBook: z.number().int().nullable().default(null),
});

export type ArticleRequest = z.infer<typeof ArticleRequestSchema>;

export type ArticleNeighbor = {
  id: number;
  title: string;
  slug: string;
};

export type ArticleNeighbors = {
  previous: ArticleNeighbor | null;
  next: ArticleNeighbor | null;
};

export type ArticleFilter = "all" | "series" | "book" | "standalone";

export const ArticleListQuerySchema = z.object({
  filter: z.enum(["all", "series", "book", "standalone"]).default("all"),
  page: z.coerce.number().int().min(0).default(0),
  size: z.coerce.number().int().min(1).max(100).default(10),
});

export const AdminArticleListQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  size: z.coerce.number().int().min(1).max(100).default(10),
});
```

- [ ] **Step 2: Type-check**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 3: Sanity check**

```bash
bun -e '
import { ArticleRequestSchema } from "./src/domains/articles/types";
console.log(JSON.stringify(ArticleRequestSchema.parse({
  title: "T", slug: "t", content: "C",
}), null, 2));
'
```
Expected output includes `"status": "DRAFT"` and nullable fields all `null`.

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/domains/articles/types.ts
git commit -m "feat(api): extend article types with Zod schemas and neighbor types

ArticleRequestSchema for create/update body, ArticleListQuerySchema
for the public list query params (with filter), and ArticleNeighbor /
ArticleNeighbors for the prev/next response."
```

---

## Task 6: Extend article repo with full CRUD + neighbor queries

**Files:**
- Modify: `apps/api-next/packages/core/src/domains/articles/repo.ts`

- [ ] **Step 1: Add new functions to repo.ts**

Read `~/github/new-blog/apps/api-next/packages/core/src/domains/articles/repo.ts`. The current file (from Plans C+D) has `articleColumns`, `castStatus`, `findVisibleByBookId`, `findAllByBookId`, `findVisibleBySeriesId`, `findAllBySeriesId`. Keep all of those. Update the imports to add `count`, `desc`, `gt`, `lt`, `ne`, `isNull`, `isNotNull`, `or`, and append the new functions.

Replace the existing import line:

```ts
import { and, asc, eq, inArray } from "drizzle-orm";
```

with:

```ts
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt, ne } from "drizzle-orm";
```

Add this at the top of the file (after the existing imports), if not already present:

```ts
import type { Article, ArticleNeighbor, ArticleNeighbors, ArticleFilter, ArticleRequest } from "./types";
import type { Page } from "../../pagination";
import { makePage } from "../../pagination";
```

(The Plan C/D version already imports `Article`. Add the rest.)

Append after the existing `findAllBySeriesId` function:

```ts
function toRow(req: ArticleRequest, publishedAt: string | null, now: string) {
  return {
    title: req.title,
    slug: req.slug,
    content: req.content,
    status: req.status,
    password: req.password,
    series_id: req.seriesId,
    order_in_series: req.orderInSeries,
    book_id: req.bookId,
    order_in_book: req.orderInBook,
    published_at: publishedAt,
    created_at: now,
    updated_at: now,
  };
}

export async function findById(id: number): Promise<Article | null> {
  const rows = await db
    .select(articleColumns)
    .from(schema.articles)
    .where(eq(schema.articles.id, id));
  castStatus(rows);
  return (rows[0] ?? null) as Article | null;
}

export async function findBySlug(slug: string): Promise<Article | null> {
  const rows = await db
    .select(articleColumns)
    .from(schema.articles)
    .where(eq(schema.articles.slug, slug));
  castStatus(rows);
  return (rows[0] ?? null) as Article | null;
}

export async function existsBySlug(slug: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.articles.id })
    .from(schema.articles)
    .where(eq(schema.articles.slug, slug))
    .limit(1);
  return rows.length > 0;
}

export async function existsBySlugExcludingId(slug: string, excludeId: number): Promise<boolean> {
  const rows = await db
    .select({ id: schema.articles.id })
    .from(schema.articles)
    .where(and(eq(schema.articles.slug, slug), ne(schema.articles.id, excludeId)))
    .limit(1);
  return rows.length > 0;
}

export async function findAllPaginated(pageNumber: number, pageSize: number): Promise<Page<Article>> {
  const offset = pageNumber * pageSize;
  const rows = await db
    .select(articleColumns)
    .from(schema.articles)
    .orderBy(desc(schema.articles.created_at))
    .limit(pageSize)
    .offset(offset);
  castStatus(rows);
  const totalRow = await db.select({ n: count() }).from(schema.articles);
  const totalElements = totalRow[0]?.n ?? 0;
  return makePage(rows as Article[], totalElements, pageNumber, pageSize);
}

export async function findVisibleByFilterPaginated(
  filter: ArticleFilter,
  pageNumber: number,
  pageSize: number,
): Promise<Page<Article>> {
  const offset = pageNumber * pageSize;
  const visibilityClause = inArray(schema.articles.status, VISIBLE_STATUSES as unknown as string[]);
  let whereClause;
  switch (filter) {
    case "series":
      whereClause = and(visibilityClause, isNotNull(schema.articles.series_id));
      break;
    case "book":
      whereClause = and(visibilityClause, isNotNull(schema.articles.book_id));
      break;
    case "standalone":
      whereClause = and(
        visibilityClause,
        isNull(schema.articles.series_id),
        isNull(schema.articles.book_id),
      );
      break;
    case "all":
    default:
      whereClause = visibilityClause;
      break;
  }
  const rows = await db
    .select(articleColumns)
    .from(schema.articles)
    .where(whereClause)
    .orderBy(desc(schema.articles.published_at))
    .limit(pageSize)
    .offset(offset);
  castStatus(rows);
  const totalRow = await db.select({ n: count() }).from(schema.articles).where(whereClause);
  const totalElements = totalRow[0]?.n ?? 0;
  return makePage(rows as Article[], totalElements, pageNumber, pageSize);
}

export async function insert(req: ArticleRequest, publishedAt: string | null, now: string): Promise<Article> {
  const inserted = await db
    .insert(schema.articles)
    .values(toRow(req, publishedAt, now))
    .returning(articleColumns);
  const rows = inserted as { status: string }[];
  castStatus(rows);
  return inserted[0] as Article;
}

export async function update(
  id: number,
  req: ArticleRequest,
  publishedAt: string | null,
  now: string,
): Promise<Article> {
  const updated = await db
    .update(schema.articles)
    .set({
      title: req.title,
      slug: req.slug,
      content: req.content,
      status: req.status,
      password: req.password,
      series_id: req.seriesId,
      order_in_series: req.orderInSeries,
      book_id: req.bookId,
      order_in_book: req.orderInBook,
      published_at: publishedAt,
      updated_at: now,
    })
    .where(eq(schema.articles.id, id))
    .returning(articleColumns);
  const rows = updated as { status: string }[];
  castStatus(rows);
  return updated[0] as Article;
}

export async function deleteById(id: number): Promise<void> {
  await db.delete(schema.articles).where(eq(schema.articles.id, id));
}

const neighborColumns = {
  id: schema.articles.id,
  title: schema.articles.title,
  slug: schema.articles.slug,
};

export async function findNeighborsByPublishedAt(article: Article): Promise<ArticleNeighbors> {
  if (article.publishedAt === null) {
    return { previous: null, next: null };
  }
  const previousRows = await db
    .select(neighborColumns)
    .from(schema.articles)
    .where(
      and(
        lt(schema.articles.published_at, article.publishedAt),
        inArray(schema.articles.status, VISIBLE_STATUSES as unknown as string[]),
        ne(schema.articles.id, article.id),
      ),
    )
    .orderBy(desc(schema.articles.published_at))
    .limit(1);
  const nextRows = await db
    .select(neighborColumns)
    .from(schema.articles)
    .where(
      and(
        gt(schema.articles.published_at, article.publishedAt),
        inArray(schema.articles.status, VISIBLE_STATUSES as unknown as string[]),
        ne(schema.articles.id, article.id),
      ),
    )
    .orderBy(asc(schema.articles.published_at))
    .limit(1);
  return {
    previous: (previousRows[0] as ArticleNeighbor | undefined) ?? null,
    next: (nextRows[0] as ArticleNeighbor | undefined) ?? null,
  };
}

export async function findNeighborsInSeries(article: Article): Promise<ArticleNeighbors> {
  if (article.seriesId === null || article.orderInSeries === null) {
    return { previous: null, next: null };
  }
  const previousRows = await db
    .select(neighborColumns)
    .from(schema.articles)
    .where(
      and(
        eq(schema.articles.series_id, article.seriesId),
        lt(schema.articles.order_in_series, article.orderInSeries),
        inArray(schema.articles.status, VISIBLE_STATUSES as unknown as string[]),
        ne(schema.articles.id, article.id),
      ),
    )
    .orderBy(desc(schema.articles.order_in_series))
    .limit(1);
  const nextRows = await db
    .select(neighborColumns)
    .from(schema.articles)
    .where(
      and(
        eq(schema.articles.series_id, article.seriesId),
        gt(schema.articles.order_in_series, article.orderInSeries),
        inArray(schema.articles.status, VISIBLE_STATUSES as unknown as string[]),
        ne(schema.articles.id, article.id),
      ),
    )
    .orderBy(asc(schema.articles.order_in_series))
    .limit(1);
  return {
    previous: (previousRows[0] as ArticleNeighbor | undefined) ?? null,
    next: (nextRows[0] as ArticleNeighbor | undefined) ?? null,
  };
}

export async function findNeighborsInBook(article: Article): Promise<ArticleNeighbors> {
  if (article.bookId === null || article.orderInBook === null) {
    return { previous: null, next: null };
  }
  const previousRows = await db
    .select(neighborColumns)
    .from(schema.articles)
    .where(
      and(
        eq(schema.articles.book_id, article.bookId),
        lt(schema.articles.order_in_book, article.orderInBook),
        inArray(schema.articles.status, VISIBLE_STATUSES as unknown as string[]),
        ne(schema.articles.id, article.id),
      ),
    )
    .orderBy(desc(schema.articles.order_in_book))
    .limit(1);
  const nextRows = await db
    .select(neighborColumns)
    .from(schema.articles)
    .where(
      and(
        eq(schema.articles.book_id, article.bookId),
        gt(schema.articles.order_in_book, article.orderInBook),
        inArray(schema.articles.status, VISIBLE_STATUSES as unknown as string[]),
        ne(schema.articles.id, article.id),
      ),
    )
    .orderBy(asc(schema.articles.order_in_book))
    .limit(1);
  return {
    previous: (previousRows[0] as ArticleNeighbor | undefined) ?? null,
    next: (nextRows[0] as ArticleNeighbor | undefined) ?? null,
  };
}
```

- [ ] **Step 2: Type-check**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0. If errors mention `inArray` cast issues, the existing `as unknown as string[]` cast pattern from Plan C handles them; verify the `inArray(schema.articles.status, VISIBLE_STATUSES as unknown as string[])` form is consistent.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/domains/articles/repo.ts
git commit -m "feat(api): extend article repo with full CRUD + neighbor queries

Adds findById, findBySlug, existsBySlug, existsBySlugExcludingId,
findAllPaginated, findVisibleByFilterPaginated (filter all/series/book/
standalone), insert, update, deleteById, and the 3 neighbor queries
(byPublishedAt, inSeries, inBook). Re-uses Plan C's articleColumns
projection map and castStatus helper."
```

---

## Task 7: Article service (`service.ts`)

**Files:**
- Create: `apps/api-next/packages/core/src/domains/articles/service.ts`

- [ ] **Step 1: Write `service.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/articles/service.ts`:

```ts
import { BusinessError } from "../../errors";
import * as repo from "./repo";
import type { Article, ArticleNeighbors, ArticleRequest, ArticleFilter } from "./types";
import { VISIBLE_STATUSES } from "./types";
import type { Page } from "../../pagination";

function nowIso(): string {
  return new Date().toISOString();
}

function isVisible(status: Article["status"]): boolean {
  return VISIBLE_STATUSES.includes(status);
}

export async function findAllPaginated(page: number, size: number): Promise<Page<Article>> {
  return await repo.findAllPaginated(page, size);
}

export async function findVisibleByFilterPaginated(
  filter: ArticleFilter,
  page: number,
  size: number,
): Promise<Page<Article>> {
  return await repo.findVisibleByFilterPaginated(filter, page, size);
}

export async function findById(id: number): Promise<Article> {
  const article = await repo.findById(id);
  if (!article) throw BusinessError.from("ARTICLE_NOT_FOUND");
  return article;
}

export async function findBySlug(slug: string): Promise<Article> {
  const article = await repo.findBySlug(slug);
  if (!article) throw BusinessError.from("ARTICLE_NOT_FOUND");
  return article;
}

/**
 * Public-blog read with visibility + password gating. Mirrors the Kotlin
 * `ArticleService.findBySlugForBlog`. Hidden statuses (DRAFT, PRIVATE)
 * return 404 to avoid leaking existence.
 */
export async function findBySlugForBlog(slug: string, password: string | null): Promise<Article> {
  const article = await repo.findBySlug(slug);
  if (!article) throw BusinessError.from("ARTICLE_NOT_FOUND");
  if (!isVisible(article.status)) {
    throw BusinessError.from("ARTICLE_NOT_FOUND");
  }
  if (article.status === "LOCKED" && article.password !== null) {
    if (password === null) {
      throw BusinessError.from("ARTICLE_PASSWORD_REQUIRED");
    }
    if (password !== article.password) {
      throw BusinessError.from("ARTICLE_PASSWORD_INCORRECT");
    }
  }
  return article;
}

/**
 * Returns previous/next neighbors. The `seriesSlug` and `bookSlug` params
 * are markers — their values are not used, only their presence determines
 * which mode to dispatch. Mirrors the Kotlin NeighborArticleService.
 */
export async function findNeighbors(
  slug: string,
  seriesSlug: string | null,
  bookSlug: string | null,
): Promise<ArticleNeighbors> {
  const article = await repo.findBySlug(slug);
  if (!article) throw BusinessError.from("ARTICLE_NOT_FOUND");
  if (seriesSlug !== null && article.seriesId !== null) {
    return await repo.findNeighborsInSeries(article);
  }
  if (bookSlug !== null && article.bookId !== null) {
    return await repo.findNeighborsInBook(article);
  }
  return await repo.findNeighborsByPublishedAt(article);
}

export async function create(req: ArticleRequest): Promise<Article> {
  if (await repo.existsBySlug(req.slug)) {
    throw BusinessError.from("ARTICLE_SLUG_DUPLICATE");
  }
  const now = nowIso();
  const publishedAt = isVisible(req.status) ? now : null;
  return await repo.insert(req, publishedAt, now);
}

export async function update(id: number, req: ArticleRequest): Promise<Article> {
  const existing = await repo.findById(id);
  if (!existing) throw BusinessError.from("ARTICLE_NOT_FOUND");
  if (req.slug !== existing.slug) {
    if (await repo.existsBySlugExcludingId(req.slug, id)) {
      throw BusinessError.from("ARTICLE_SLUG_DUPLICATE");
    }
  }
  const now = nowIso();
  // publishedAt auto-set: DRAFT/PRIVATE → PUBLIC/LOCKED transition with
  // existing.publishedAt == null → set to now.
  let publishedAt = existing.publishedAt;
  const wasNotVisible = !isVisible(existing.status);
  const willBeVisible = isVisible(req.status);
  if (wasNotVisible && willBeVisible && publishedAt === null) {
    publishedAt = now;
  }
  return await repo.update(id, req, publishedAt, now);
}

export async function deleteArticle(id: number): Promise<void> {
  const existing = await repo.findById(id);
  if (!existing) throw BusinessError.from("ARTICLE_NOT_FOUND");
  await repo.deleteById(id);
}
```

- [ ] **Step 2: Type-check**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/domains/articles/service.ts
git commit -m "feat(api): add article service (visibility, password gating, publishedAt)

Includes findBySlugForBlog (404-on-hidden + password gate), findNeighbors
(3-mode dispatch), create/update with auto publishedAt, and deleteArticle
(named to avoid the delete reserved word)."
```

---

## Task 8: Update articles barrel + core re-export

**Files:**
- Modify: `apps/api-next/packages/core/src/domains/articles/index.ts`
- Modify: `apps/api-next/packages/core/src/index.ts`

- [ ] **Step 1: Extend `domains/articles/index.ts`**

Read the current file. Replace the entire file contents with:

```ts
export { type Article, type ArticleStatus, type ArticleNeighbor, type ArticleNeighbors, type ArticleRequest, type ArticleFilter, ArticleRequestSchema, ArticleListQuerySchema, AdminArticleListQuerySchema, VISIBLE_STATUSES } from "./types";
export {
  // existing Plan C/D readers (kept):
  findVisibleByBookId as articlesFindVisibleByBookId,
  findAllByBookId as articlesFindAllByBookId,
  findVisibleBySeriesId as articlesFindVisibleBySeriesId,
  findAllBySeriesId as articlesFindAllBySeriesId,
} from "./repo";
export {
  findAllPaginated as articleFindAll,
  findVisibleByFilterPaginated as articleFindVisibleByFilter,
  findById as articleFindById,
  findBySlug as articleFindBySlug,
  findBySlugForBlog as articleFindBySlugForBlog,
  findNeighbors as articleFindNeighbors,
  create as articleCreate,
  update as articleUpdate,
  deleteArticle as articleDelete,
} from "./service";
```

- [ ] **Step 2: Update core barrel**

Read `~/github/new-blog/apps/api-next/packages/core/src/index.ts`. Find the existing articles re-export block and REPLACE it with:

```ts
export {
  type Article,
  type ArticleStatus,
  type ArticleNeighbor,
  type ArticleNeighbors,
  type ArticleRequest,
  type ArticleFilter,
  ArticleRequestSchema,
  ArticleListQuerySchema,
  AdminArticleListQuerySchema,
  VISIBLE_STATUSES,
  articlesFindVisibleByBookId,
  articlesFindAllByBookId,
  articlesFindVisibleBySeriesId,
  articlesFindAllBySeriesId,
  articleFindAll,
  articleFindVisibleByFilter,
  articleFindById,
  articleFindBySlug,
  articleFindBySlugForBlog,
  articleFindNeighbors,
  articleCreate,
  articleUpdate,
  articleDelete,
} from "./domains/articles";
```

- [ ] **Step 3: Type-check**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/domains/articles/index.ts apps/api-next/packages/core/src/index.ts
git commit -m "feat(api): export article public surface (service + schemas + types)

Existing Plan C/D reader exports are preserved. New service-layer
functions are namespaced article*. The articles re-export block in the
core barrel becomes the canonical export point — older Plan C/D names
are still re-exported from here too."
```

---

## Task 9: Admin articles route + wire-up

**Files:**
- Create: `apps/api-next/apps/admin/src/routes/articles.ts`
- Modify: `apps/api-next/apps/admin/src/app.ts`

- [ ] **Step 1: Write `routes/articles.ts`**

Write `~/github/new-blog/apps/api-next/apps/admin/src/routes/articles.ts`:

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  ArticleRequestSchema,
  AdminArticleListQuerySchema,
  articleFindAll,
  articleFindById,
  articleCreate,
  articleUpdate,
  articleDelete,
} from "@api-next/core";

type ZodIssueLike = { path: PropertyKey[]; message: string };
type ZodErrorLike = { issues: ZodIssueLike[] };

function validationErrorMessage(error: ZodErrorLike): string {
  const first = error.issues[0];
  if (!first) return "Invalid request body";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const articlesAdminRoute = new Hono();

articlesAdminRoute.get(
  "/",
  zValidator("query", AdminArticleListQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { page, size } = c.req.valid("query");
    const data = await articleFindAll(page, size);
    return c.json({ data });
  },
);

articlesAdminRoute.get(
  "/:id",
  zValidator("param", idParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const data = await articleFindById(id);
    return c.json({ data });
  },
);

articlesAdminRoute.post(
  "/",
  zValidator("json", ArticleRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const data = await articleCreate(c.req.valid("json"));
    return c.json({ data }, 201);
  },
);

articlesAdminRoute.put(
  "/:id",
  zValidator("param", idParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  zValidator("json", ArticleRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const data = await articleUpdate(id, c.req.valid("json"));
    return c.json({ data });
  },
);

articlesAdminRoute.delete(
  "/:id",
  zValidator("param", idParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    await articleDelete(id);
    return c.body(null, 204);
  },
);
```

- [ ] **Step 2: Mount in admin `app.ts`**

Read `~/github/new-blog/apps/api-next/apps/admin/src/app.ts`. Add an import line alongside the existing route imports:

```ts
import { articlesAdminRoute } from "./routes/articles";
```

Inside `createApp()`, after the existing `app.route("/admin/series", seriesAdminRoute);`, add:

```ts
app.route("/admin/articles", articlesAdminRoute);
```

- [ ] **Step 3: Run admin tests for articles**

```bash
cd ~/github/new-blog/apps/api-next/apps/admin
bun test test/articles.test.ts 2>&1 | tail -25
```
Expected: 16 pass / 0 fail.

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/src/routes/articles.ts apps/api-next/apps/admin/src/app.ts
git commit -m "feat(api): add /admin/articles route (paginated CRUD)"
```

---

## Task 10: Public blog articles route + wire-up

**Files:**
- Create: `apps/api-next/apps/blog/src/routes/articles.ts`
- Modify: `apps/api-next/apps/blog/src/app.ts`

- [ ] **Step 1: Write `routes/articles.ts`**

Write `~/github/new-blog/apps/api-next/apps/blog/src/routes/articles.ts`:

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  ArticleListQuerySchema,
  articleFindVisibleByFilter,
  articleFindBySlugForBlog,
  articleFindNeighbors,
} from "@api-next/core";

type ZodIssueLike = { path: PropertyKey[]; message: string };
type ZodErrorLike = { issues: ZodIssueLike[] };

function validationErrorMessage(error: ZodErrorLike): string {
  const first = error.issues[0];
  if (!first) return "Invalid request body";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}

export const articlesRoute = new Hono();

articlesRoute.get(
  "/",
  zValidator("query", ArticleListQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { filter, page, size } = c.req.valid("query");
    const data = await articleFindVisibleByFilter(filter, page, size);
    return c.json({ data });
  },
);

articlesRoute.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const password = c.req.query("password") ?? null;
  const data = await articleFindBySlugForBlog(slug, password);
  return c.json({ data });
});

articlesRoute.get("/:slug/neighbors", async (c) => {
  const slug = c.req.param("slug");
  const seriesSlug = c.req.query("series") ?? null;
  const bookSlug = c.req.query("book") ?? null;
  const data = await articleFindNeighbors(slug, seriesSlug, bookSlug);
  return c.json({ data });
});
```

- [ ] **Step 2: Mount in blog `app.ts`**

Read `~/github/new-blog/apps/api-next/apps/blog/src/app.ts`. Add the import:

```ts
import { articlesRoute } from "./routes/articles";
```

Inside `createApp()`, after `app.route("/series", seriesRoute);`, add:

```ts
app.route("/articles", articlesRoute);
```

- [ ] **Step 3: Run blog tests**

```bash
cd ~/github/new-blog/apps/api-next/apps/blog
bun test 2>&1 | tail -20
```
Expected: 25 pass total (2 health + 4 books + 4 series + 15 articles), 0 fail.

If a neighbor test fails on string comparison ordering (`<` / `>` against ISO timestamps), the issue is that drizzle returned timestamps in a different format — verify the seeded `published_at` strings sort correctly as text.

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/blog/src/routes/articles.ts apps/api-next/apps/blog/src/app.ts
git commit -m "feat(api): add public /articles route (paginated list + detail + neighbors)"
```

---

## Task 11: Recover article-order endpoint in admin books route

**Files:**
- Modify: `apps/api-next/apps/admin/src/routes/books.ts`
- Modify: `apps/api-next/apps/admin/test/books.test.ts`

- [ ] **Step 1: Add the article-order handler to `routes/books.ts`**

Read `~/github/new-blog/apps/api-next/apps/admin/src/routes/books.ts`. Update the imports to add `articleFindById`, `articleUpdate`, and `bookFindById` (the latter is already imported via the bookCreate etc. block — confirm and add if missing). Replace the existing import block from `@api-next/core` with:

```ts
import {
  BookRequestSchema,
  bookFindAll,
  bookFindById,
  bookCreate,
  bookUpdate,
  bookDelete,
  articlesFindAllByBookId,
  articleFindById,
  articleUpdate,
} from "@api-next/core";
```

Define the order-request schema near the top, after `validationErrorMessage`:

```ts
const articleOrderRequestSchema = z.object({
  articleIds: z.array(z.number().int().positive()),
});
```

Append the new handler after the `delete` handler at the bottom:

```ts
booksAdminRoute.put(
  "/:id/article-order",
  zValidator("param", idParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  zValidator("json", articleOrderRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { id: bookId } = c.req.valid("param");
    const { articleIds } = c.req.valid("json");
    // Verify the book exists; throws BOOK_NOT_FOUND otherwise.
    await bookFindById(bookId);
    for (let i = 0; i < articleIds.length; i++) {
      const articleId = articleIds[i]!;
      const article = await articleFindById(articleId);
      await articleUpdate(articleId, {
        title: article.title,
        slug: article.slug,
        content: article.content,
        status: article.status,
        password: article.password,
        seriesId: article.seriesId,
        orderInSeries: article.orderInSeries,
        bookId,
        orderInBook: i + 1,
      });
    }
    return c.json({ data: "Article order updated successfully" });
  },
);
```

- [ ] **Step 2: Add test cases to `test/books.test.ts`**

Read `~/github/new-blog/apps/api-next/apps/admin/test/books.test.ts`. Inside the existing `describe("admin books endpoints", ...)` block, after the existing tests (and before the closing brace), add two more `it(...)` cases:

```ts
  // ----- article-order (recovered from Plan C deferred) -----
  it("PUT /admin/books/:id/article-order reorders articles", async () => {
    const id = await seedBook();
    const a1 = await seedArticle({ bookId: id, status: "PUBLIC", orderInBook: 99, slug: "a1" });
    const a2 = await seedArticle({ bookId: id, status: "PUBLIC", orderInBook: 99, slug: "a2" });
    const a3 = await seedArticle({ bookId: id, status: "PUBLIC", orderInBook: 99, slug: "a3" });
    const res = await app.request(`/admin/books/${id}/article-order`, {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ articleIds: [a3, a1, a2] }),
    });
    expect(res.status).toBe(200);
    const get = await app.request(`/admin/books/${id}`, { headers: authHeaders(token) });
    const body = (await get.json()) as { data: { articles: { slug: string }[] } };
    expect(body.data.articles.map((a) => a.slug)).toEqual(["a3", "a1", "a2"]);
  });

  it("PUT /admin/books/:id/article-order returns 404 for missing book", async () => {
    const res = await app.request(`/admin/books/9999/article-order`, {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ articleIds: [] }),
    });
    expect(res.status).toBe(404);
  });
```

- [ ] **Step 3: Run admin tests**

```bash
cd ~/github/new-blog/apps/api-next/apps/admin
bun test test/books.test.ts 2>&1 | tail -10
```
Expected: 17 pass / 0 fail (15 from Plan C + 2 new).

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/src/routes/books.ts apps/api-next/apps/admin/test/books.test.ts
git commit -m "feat(api): recover PUT /admin/books/:id/article-order (Plan C deferred)

Iterates the supplied articleIds and calls articleUpdate to set
bookId + orderInBook in the new order. Verifies book exists first."
```

---

## Task 12: Recover article-order endpoint in admin series route

**Files:**
- Modify: `apps/api-next/apps/admin/src/routes/series.ts`
- Modify: `apps/api-next/apps/admin/test/series.test.ts`

- [ ] **Step 1: Add the article-order handler to `routes/series.ts`**

Read `~/github/new-blog/apps/api-next/apps/admin/src/routes/series.ts`. Update the imports to include `articleFindById` and `articleUpdate`:

```ts
import {
  SeriesRequestSchema,
  seriesFindAll,
  seriesFindById,
  seriesCreate,
  seriesUpdate,
  seriesDelete,
  articlesFindAllBySeriesId,
  articleFindById,
  articleUpdate,
} from "@api-next/core";
```

Add the request schema after `validationErrorMessage`:

```ts
const articleOrderRequestSchema = z.object({
  articleIds: z.array(z.number().int().positive()),
});
```

Append the handler after the `delete` handler:

```ts
seriesAdminRoute.put(
  "/:id/article-order",
  zValidator("param", idParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  zValidator("json", articleOrderRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { id: seriesId } = c.req.valid("param");
    const { articleIds } = c.req.valid("json");
    await seriesFindById(seriesId);
    for (let i = 0; i < articleIds.length; i++) {
      const articleId = articleIds[i]!;
      const article = await articleFindById(articleId);
      await articleUpdate(articleId, {
        title: article.title,
        slug: article.slug,
        content: article.content,
        status: article.status,
        password: article.password,
        seriesId,
        orderInSeries: i + 1,
        bookId: article.bookId,
        orderInBook: article.orderInBook,
      });
    }
    return c.json({ data: "Article order updated successfully" });
  },
);
```

- [ ] **Step 2: Add test cases to `test/series.test.ts`**

Read `~/github/new-blog/apps/api-next/apps/admin/test/series.test.ts`. Add two cases inside the existing `describe`:

```ts
  // ----- article-order (recovered from Plan D deferred) -----
  it("PUT /admin/series/:id/article-order reorders articles", async () => {
    const id = await seedSeries();
    const a1 = await seedArticle({ seriesId: id, status: "PUBLIC", orderInSeries: 99, slug: "sa1" });
    const a2 = await seedArticle({ seriesId: id, status: "PUBLIC", orderInSeries: 99, slug: "sa2" });
    const a3 = await seedArticle({ seriesId: id, status: "PUBLIC", orderInSeries: 99, slug: "sa3" });
    const res = await app.request(`/admin/series/${id}/article-order`, {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ articleIds: [a3, a1, a2] }),
    });
    expect(res.status).toBe(200);
    const get = await app.request(`/admin/series/${id}`, { headers: authHeaders(token) });
    const body = (await get.json()) as { data: { articles: { slug: string }[] } };
    expect(body.data.articles.map((a) => a.slug)).toEqual(["sa3", "sa1", "sa2"]);
  });

  it("PUT /admin/series/:id/article-order returns 404 for missing series", async () => {
    const res = await app.request(`/admin/series/9999/article-order`, {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ articleIds: [] }),
    });
    expect(res.status).toBe(404);
  });
```

- [ ] **Step 3: Run admin series tests**

```bash
cd ~/github/new-blog/apps/api-next/apps/admin
bun test test/series.test.ts 2>&1 | tail -10
```
Expected: 17 pass / 0 fail (15 from Plan D + 2 new).

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/src/routes/series.ts apps/api-next/apps/admin/test/series.test.ts
git commit -m "feat(api): recover PUT /admin/series/:id/article-order (Plan D deferred)

Same shape as the books recovery: verifies series exists, then loops
articleIds and updates orderInSeries for each."
```

---

## Task 13: Monorepo verification + smoke test

**Files:** (no code changes unless errors surface)

- [ ] **Step 1: `turbo run lint`**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog
bunx turbo run lint --force 2>&1 | tail -10
```
Expected: 5/5 successful, 0 errors.

- [ ] **Step 2: `bun run test` (root, serial)**

```bash
cd ~/github/new-blog
bun run test 2>&1 | tail -20
```
Expected counts:

- `@api-next/core`: 6 (env + errors)
- `api-blog-next`: 25 (2 health + 4 books + 4 series + 15 articles)
- `api-admin-next`: 78 (5 jwtAuth + 2 health + 6 settings + 17 books + 17 series + 16 articles + 15 already-existing series + ...)

The exact admin count: 5 + 2 + 6 + 17 + 17 + 16 = 63. Plus the existing 15 settings detail tests already counted. Recompute: 5+2+6+17+17+16 = **63**. The actual number depends on Bun's reporting; the requirement is 0 fail.

- `admin` Next.js: 15 (vitest)

- [ ] **Step 3: Manual smoke — admin POST round trip**

Terminal 1:
```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/apps/admin
export $(grep -v '^#' ../../.env | xargs)
export ADMIN_PORT=9081
bun run src/index.ts
```

Terminal 2:
```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/apps/admin
export $(grep -v '^#' ../../.env | xargs)

TOKEN=$(bun -e '
import { SignJWT } from "jose";
const secret = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET);
const jwt = await new SignJWT({})
  .setProtectedHeader({ alg: "HS256" })
  .setSubject(process.env.ADMIN_GOOGLE_SUB.split(",")[0])
  .setIssuedAt()
  .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
  .sign(secret);
console.log(jwt);
')

echo "--- POST DRAFT ---"
curl -s -X POST -H "authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"title":"Smoke","slug":"smoke","content":"body","status":"DRAFT","password":null,"seriesId":null,"orderInSeries":null,"bookId":null,"orderInBook":null}' \
  http://localhost:9081/admin/articles
echo
echo "--- GET list ---"
curl -s -H "authorization: Bearer $TOKEN" http://localhost:9081/admin/articles
echo
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "TRUNCATE articles RESTART IDENTITY CASCADE"
```

Stop server (Ctrl+C in terminal 1).

Expected: POST returns 201 with `publishedAt: null`. GET returns the page envelope with that one article.

- [ ] **Step 4: Manual smoke — public blog read**

Terminal 1:
```bash
cd ~/github/new-blog/apps/api-next/apps/blog
export $(grep -v '^#' ../../.env | xargs)
export BLOG_PORT=9080
bun run src/index.ts
```

Terminal 2:
```bash
docker exec api-next-dev-db psql -U api_next -d api_next_dev <<'SQL'
INSERT INTO articles (title, slug, content, status, created_at, updated_at, published_at)
VALUES
  ('A1', 'a1', 'body', 'PUBLIC', NOW(), NOW(), NOW() - INTERVAL '2 days'),
  ('A2', 'a2', 'body', 'PUBLIC', NOW(), NOW(), NOW() - INTERVAL '1 day'),
  ('A3', 'a3', 'body', 'PUBLIC', NOW(), NOW(), NOW());
SQL
echo "--- GET /articles ---"
curl -s 'http://localhost:9080/articles' | head -c 400
echo
echo "--- GET /articles/a2/neighbors ---"
curl -s 'http://localhost:9080/articles/a2/neighbors'
echo
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "TRUNCATE articles RESTART IDENTITY CASCADE"
```

Stop server.

Expected: list contains 3 entries sorted by published_at desc; neighbors of `a2` are `previous: a1, next: a3`.

No commit.

---

## Plan E Completion Checklist

- [ ] `errors.ts` has 4 ARTICLE_* entries (Task 1)
- [ ] `pagination.ts` exists with `Page<T>` and `makePage` (Task 2)
- [ ] `domains/articles/types.ts` has Zod schemas, neighbor types, list-query schemas (Task 5)
- [ ] `domains/articles/repo.ts` has the 12 new functions (Task 6)
- [ ] `domains/articles/service.ts` exists with full domain logic (Task 7)
- [ ] `domains/articles/index.ts` re-exports the new article* function names alongside existing Plan C/D readers (Task 8)
- [ ] Core barrel re-exports the article surface (Task 8)
- [ ] `apps/admin/src/routes/articles.ts` mounted at `/admin/articles` (Task 9)
- [ ] `apps/blog/src/routes/articles.ts` mounted at `/articles` (Task 10)
- [ ] `apps/admin/src/routes/books.ts` has `PUT /:id/article-order` (Task 11)
- [ ] `apps/admin/src/routes/series.ts` has `PUT /:id/article-order` (Task 12)
- [ ] `apps/admin/test/articles.test.ts` 16 cases pass (Task 9)
- [ ] `apps/blog/test/articles.test.ts` 15 cases pass (Task 10)
- [ ] `apps/admin/test/books.test.ts` extended with 2 article-order cases (Task 11)
- [ ] `apps/admin/test/series.test.ts` extended with 2 article-order cases (Task 12)
- [ ] `bunx turbo run lint` 5/5 (Task 13)
- [ ] `bun run test` (root, serial) 4/4 (Task 13)
- [ ] Smoke test confirms POST → GET round trip + public list/neighbors (Task 13)

## Out of Scope (Handled by Later Plans)

- **Image processing** (`processNewImages`, `cleanupDeletedImages`, `cleanupAllImages`) — Plan J
- **Caching** (Spring CacheManager / Redis) — Plan G or later
- **Sort parameter parsing** (`?sort=field,direction`) — defaults only
- **Full Spring Data Page shape** (pageable, numberOfElements, sort sub-object) — minimum subset only
- `@api-next/core/middleware` extraction — still deferred
- `hono-pino` migration — still deferred
- Renaming Plan B's settings exports to namespaced style
