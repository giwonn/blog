# API Rewrite — Plan C: Book Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Kotlin `book` domain (7 of 8 endpoints — defers `PUT /admin/books/:id/article-order` to Plan E) to Hono/Drizzle. Establishes the cross-domain stub pattern by adding a minimal read-only `domains/articles/` that Plan E will expand, and the namespaced barrel naming convention.

**Architecture:** `domains/books/{types,repo,service,index}.ts` follows the Plan B template. `domains/articles/{types,repo,index}.ts` is a stub containing only the two reader functions book needs. Schema column names stay snake_case (matching the introspected `schema.ts`); the repo aliases them to camelCase for the API surface. Tests use raw drizzle inserts in `beforeEach` (after `resetDb()`) to seed fixtures.

**Tech Stack:** Hono 4, `@hono/zod-validator`, Drizzle ORM + `bun:sql`, Zod 4, `bun:test`, jose (test JWTs).

**Design reference:** `docs/superpowers/specs/2026-04-13-api-rewrite-plan-c-book-design.md`

---

## Scope Check

This plan ports one full domain (book) plus a tiny stub of another (articles, read-only, two functions). It deliberately omits the article-order endpoint and the full article CRUD, both deferred to Plan E. It does NOT touch any other domain, frontend, or Kotlin code, and it does not modify Plan A or Plan B files except to extend `errors.ts`, `schema.ts` (one-line type widening), and `packages/core/src/index.ts` (barrel re-exports). Every `apps/api-next/apps/{blog,admin}/src/app.ts` change is a single line per app for the new route mount.

## File Structure

```
apps/api-next/
├── apps/
│   ├── admin/
│   │   ├── src/
│   │   │   ├── app.ts                         # +mount /admin/books
│   │   │   └── routes/
│   │   │       └── books.ts                   # NEW: 5 admin handlers
│   │   └── test/
│   │       └── books.test.ts                  # NEW: ~15 admin TDD cases
│   └── blog/
│       ├── src/
│       │   ├── app.ts                         # +mount /books
│       │   └── routes/
│       │       └── books.ts                   # NEW: 2 public handlers
│       └── test/
│           └── books.test.ts                  # NEW: ~5 public TDD cases
└── packages/core/
    └── src/
        ├── db/
        │   └── schema.ts                      # +1-line: books.id mode bigint→number
        ├── domains/
        │   ├── books/                         # NEW
        │   │   ├── types.ts                   # Zod schemas + Book/BookRequest types
        │   │   ├── repo.ts                    # drizzle queries with snake↔camel mapping
        │   │   ├── service.ts                 # business rules: 404, slug dup
        │   │   └── index.ts                   # barrel with namespaced re-exports
        │   └── articles/                      # NEW (stub, read-only)
        │       ├── types.ts                   # Article TS type + status enum + visibility constant
        │       ├── repo.ts                    # findVisibleByBookId, findAllByBookId
        │       └── index.ts                   # barrel with namespaced re-exports
        ├── errors.ts                          # +BOOK_NOT_FOUND, BOOK_SLUG_DUPLICATE
        └── index.ts                           # +re-exports of domains/books and domains/articles
```

**Responsibilities recap:**

- `domains/articles/` (Plan C scope): Article TS type and the two reader functions book needs. Plan E expands it.
- `domains/books/`: full CRUD, business rules, public surface.
- Repo files do all snake↔camel mapping. Service and route layers see only camelCase.
- Tests live in the workspace whose route they cover (admin tests in admin workspace, public tests in blog workspace).

---

## Task 1: Extend ErrorCode with BOOK_* entries

**Files:**
- Modify: `apps/api-next/packages/core/src/errors.ts`

- [ ] **Step 1: Add the two new entries**

Read `~/github/new-blog/apps/api-next/packages/core/src/errors.ts` first. The `ErrorCode` const currently has only `UNAUTHORIZED` and `INTERNAL`. Replace its body with:

```ts
export const ErrorCode = {
  UNAUTHORIZED: { status: 401, message: "Unauthorized" },
  INTERNAL: { status: 500, message: "Internal server error" },
  BOOK_NOT_FOUND: { status: 404, message: "책을 찾을 수 없습니다" },
  BOOK_SLUG_DUPLICATE: { status: 400, message: "이미 사용 중인 책 slug입니다" },
} as const satisfies Record<string, ErrorCodeValue>;
```

The Korean messages match the Kotlin `ErrorCode` enum exactly so the cutover is invisible to the frontend.

- [ ] **Step 2: Type-check core**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 3: Run core tests (errors.test.ts must still pass)**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bun test
```
Expected: 6 tests pass (3 env + 3 errors). The errors test asserts `ErrorCode.INTERNAL` and `BusinessError.from("UNAUTHORIZED")` — adding new entries does not break it.

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/errors.ts
git commit -m "feat(api): add BOOK_NOT_FOUND and BOOK_SLUG_DUPLICATE error codes

Korean messages match the Kotlin ErrorCode enum verbatim so the
frontend's existing toasts continue to render the same text after
cutover."
```

---

## Task 2: Widen books.id mode in schema.ts to number

**Files:**
- Modify: `apps/api-next/packages/core/src/db/schema.ts`

The introspected `books.id` is declared as `bigserial({ mode: "bigint" })` which forces JS `BigInt` literals (`1n`) at every call site. The `articles.id` line in the same file uses `mode: "number"` and contains the introspect comment "you can use number when not exceeding JS limits." A personal blog will never approach `Number.MAX_SAFE_INTEGER` (2^53), so widening to `number` is safe and keeps the API surface uniform.

- [ ] **Step 1: Find and edit the books.id line**

In `~/github/new-blog/apps/api-next/packages/core/src/db/schema.ts`, the `books` table declaration starts with:

```ts
export const books = pgTable("books", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
```

Change `"bigint"` to `"number"`:

```ts
export const books = pgTable("books", {
	id: bigserial({ mode: "number" }).primaryKey().notNull(),
```

That is the only edit. Do not touch any other line in `schema.ts`.

- [ ] **Step 2: Type-check**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0. (Plan B's `domains/settings/repo.ts` uses `schema.settings.id` not `schema.books.id`, so this change does not affect existing code.)

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/db/schema.ts
git commit -m "chore(api): widen books.id drizzle mode from bigint to number

The introspected file defaulted to bigint mode for bigserial. A personal
blog will never exceed Number.MAX_SAFE_INTEGER (2^53), and matching
articles.id (number mode) keeps the API surface uniform — every numeric
ID in the codebase is a JS number."
```

---

## Task 3: Failing admin books integration test (TDD red)

**Files:**
- Create: `apps/api-next/apps/admin/test/books.test.ts`

This test references types and functions that do not yet exist (`createApp` already does, but the routes and core exports for books do not). It will fail on import resolution + 404 for the routes that exist after `createApp` succeeds.

- [ ] **Step 1: Write the full test file**

Write `~/github/new-blog/apps/api-next/apps/admin/test/books.test.ts`:

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
  let token: string;

  beforeAll(async () => {
    token = await mintValidToken();
  });

  beforeEach(async () => {
    await resetDb();
  });

  // ----- POST -----
  it("POST /admin/books creates a book", async () => {
    const res = await app.request("/admin/books", {
      method: "POST",
      headers: authHeaders(token),
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
      headers: authHeaders(token),
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
      headers: authHeaders(token),
      body: JSON.stringify(bodyNoTitle),
    });
    expect(res.status).toBe(400);
  });

  // ----- GET list -----
  it("GET /admin/books returns empty list", async () => {
    const res = await app.request("/admin/books", { headers: authHeaders(token) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [] });
  });

  it("GET /admin/books returns all seeded books", async () => {
    await seedBook({ slug: "a", title: "A" });
    await seedBook({ slug: "b", title: "B" });
    const res = await app.request("/admin/books", { headers: authHeaders(token) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as BookListEnvelope;
    expect(body.data).toHaveLength(2);
    const slugs = body.data.map((b) => b.slug).sort();
    expect(slugs).toEqual(["a", "b"]);
  });

  // ----- GET by id -----
  it("GET /admin/books/:id returns book + empty articles", async () => {
    const id = await seedBook();
    const res = await app.request(`/admin/books/${id}`, { headers: authHeaders(token) });
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
    const res = await app.request(`/admin/books/${id}`, { headers: authHeaders(token) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { book: BookResponse; articles: { slug: string }[] } };
    expect(body.data.articles.map((a) => a.slug)).toEqual(["a1", "a2", "a3"]);
  });

  it("GET /admin/books/:id returns 404 for missing id", async () => {
    const res = await app.request("/admin/books/9999", { headers: authHeaders(token) });
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
      headers: authHeaders(token),
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
      headers: authHeaders(token),
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(200);
  });

  it("PUT /admin/books/:id rejects a slug already used by another book", async () => {
    await seedBook({ slug: "first" });
    const id = await seedBook({ slug: "second" });
    const res = await app.request(`/admin/books/${id}`, {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ ...validBody, slug: "first" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.message).toBe("이미 사용 중인 책 slug입니다");
  });

  it("PUT /admin/books/:id returns 404 for missing id", async () => {
    const res = await app.request("/admin/books/9999", {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(404);
  });

  // ----- DELETE -----
  it("DELETE /admin/books/:id removes the book", async () => {
    const id = await seedBook();
    const del = await app.request(`/admin/books/${id}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
    expect(del.status).toBe(204);
    const getRes = await app.request(`/admin/books/${id}`, { headers: authHeaders(token) });
    expect(getRes.status).toBe(404);
  });

  it("DELETE /admin/books/:id returns 404 for missing id", async () => {
    const res = await app.request("/admin/books/9999", {
      method: "DELETE",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(404);
  });

  // ----- Auth -----
  it("all endpoints return 401 without a JWT", async () => {
    const list = await app.request("/admin/books");
    expect(list.status).toBe(401);
    const get = await app.request("/admin/books/1");
    expect(get.status).toBe(401);
    const post = await app.request("/admin/books", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(post.status).toBe(401);
    const put = await app.request("/admin/books/1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(put.status).toBe(401);
    const del = await app.request("/admin/books/1", { method: "DELETE" });
    expect(del.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

```bash
cd ~/github/new-blog/apps/api-next/apps/admin
bun test test/books.test.ts 2>&1 | tail -15
```

Expected: most tests fail. Some may fail at runtime due to missing routes (404 expectations not matching the auth-first 401 return), some may fail in `beforeEach` because the test inserts via `db.insert(schema.articles)` with `book_id` referencing a column the dev DB has. Either way, the test exits non-zero.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/test/books.test.ts
git commit -m "test(api): add failing admin books integration tests (TDD red)

15 cases covering POST/GET list/GET by id/PUT/DELETE plus slug
duplication, 404, and 401 cases. Goes green incrementally as Tasks
5–10 add domain layer and route."
```

---

## Task 4: Failing blog public books integration test (TDD red)

**Files:**
- Create: `apps/api-next/apps/blog/test/books.test.ts`

- [ ] **Step 1: Write the test file**

Write `~/github/new-blog/apps/api-next/apps/blog/test/books.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "bun:test";
import { createApp } from "../src/app";
import { db, schema } from "@api-next/core";
import { resetDb } from "@api-next/core/test-helpers";

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
```

- [ ] **Step 2: Run it and verify it fails**

```bash
cd ~/github/new-blog/apps/api-next/apps/blog
bun test test/books.test.ts 2>&1 | tail -10
```

Expected: failures. The `app.request("/books")` returns 404 because no `/books` route exists yet, or the `db.insert(schema.articles)` errors because the test DB schema is bootstrapped (it should be — Plan A.5 ran the bootstrap script). If the DB tables are missing, run `~/github/new-blog/apps/api-next/scripts/bootstrap-dev-db.sh` first.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/blog/test/books.test.ts
git commit -m "test(api): add failing public books integration tests (TDD red)

5 cases for the public blog endpoints: empty list, with-counts list,
visible-only article filter on detail, and 404. Goes green when
Task 11 adds the blog books route."
```

---

## Task 5: Articles stub (types + repo + barrel)

**Files:**
- Create: `apps/api-next/packages/core/src/domains/articles/types.ts`
- Create: `apps/api-next/packages/core/src/domains/articles/repo.ts`
- Create: `apps/api-next/packages/core/src/domains/articles/index.ts`

- [ ] **Step 1: Create the directory and write `types.ts`**

```bash
mkdir -p ~/github/new-blog/apps/api-next/packages/core/src/domains/articles
```

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/articles/types.ts`:

```ts
export type ArticleStatus = "DRAFT" | "PUBLIC" | "LOCKED" | "PRIVATE";

export const VISIBLE_STATUSES: readonly ArticleStatus[] = ["PUBLIC", "LOCKED"];

// Camel-cased projection of the articles table row used by the API surface.
// Plan E will expand this with full Zod schemas for create/update bodies.
export type Article = {
  id: number;
  title: string;
  slug: string;
  content: string;
  status: ArticleStatus;
  password: string | null;
  seriesId: number | null;
  orderInSeries: number | null;
  bookId: number | null;
  orderInBook: number | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 2: Write `repo.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/articles/repo.ts`:

```ts
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "../../db/client";
import { type Article, type ArticleStatus, VISIBLE_STATUSES } from "./types";

const articleColumns = {
  id: schema.articles.id,
  title: schema.articles.title,
  slug: schema.articles.slug,
  content: schema.articles.content,
  status: schema.articles.status,
  password: schema.articles.password,
  seriesId: schema.articles.series_id,
  orderInSeries: schema.articles.order_in_series,
  bookId: schema.articles.book_id,
  orderInBook: schema.articles.order_in_book,
  publishedAt: schema.articles.published_at,
  createdAt: schema.articles.created_at,
  updatedAt: schema.articles.updated_at,
};

function castStatus(rows: { status: string }[]): void {
  // The drizzle column is typed as `string` because the introspected schema uses
  // varchar with a CHECK constraint. We narrow to ArticleStatus at the boundary.
  for (const r of rows) {
    if (!["DRAFT", "PUBLIC", "LOCKED", "PRIVATE"].includes(r.status)) {
      throw new Error(`Unexpected article status: ${r.status}`);
    }
  }
}

export async function findVisibleByBookId(bookId: number): Promise<Article[]> {
  const rows = await db
    .select(articleColumns)
    .from(schema.articles)
    .where(
      and(
        eq(schema.articles.book_id, bookId),
        inArray(schema.articles.status, VISIBLE_STATUSES as unknown as string[]),
      ),
    );
  castStatus(rows);
  return rows as Article[];
}

export async function findAllByBookId(bookId: number): Promise<Article[]> {
  const rows = await db
    .select(articleColumns)
    .from(schema.articles)
    .where(eq(schema.articles.book_id, bookId))
    .orderBy(asc(schema.articles.order_in_book));
  castStatus(rows);
  return rows as Article[];
}

export type { ArticleStatus };
```

- [ ] **Step 3: Write `index.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/articles/index.ts`:

```ts
export { type Article, type ArticleStatus, VISIBLE_STATUSES } from "./types";
export {
  findVisibleByBookId as articlesFindVisibleByBookId,
  findAllByBookId as articlesFindAllByBookId,
} from "./repo";
```

- [ ] **Step 4: Type-check**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0. If there are errors about `inArray`'s type expecting `string[]` vs `readonly ArticleStatus[]`, the cast in the function call (`as unknown as string[]`) handles it.

- [ ] **Step 5: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/domains/articles
git commit -m "feat(api): add articles stub (read-only repo) for cross-domain queries

Plan C scope: only the two reader functions book needs.
findVisibleByBookId filters to PUBLIC + LOCKED status; findAllByBookId
returns everything sorted by order_in_book. Plan E will expand this
directory with full Zod schemas, write functions, service, and route."
```

---

## Task 6: Book domain types (`types.ts`)

**Files:**
- Create: `apps/api-next/packages/core/src/domains/books/types.ts`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p ~/github/new-blog/apps/api-next/packages/core/src/domains/books
```

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/books/types.ts`:

```ts
import { z } from "zod";

export const BookRequestSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  author: z.string().min(1),
  publisher: z.string().nullable().default(null),
  thumbnailUrl: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  isbn: z.string().nullable().default(null),
  readStartDate: z.string().date().nullable().default(null),
  readEndDate: z.string().date().nullable().default(null),
  rating: z.number().int().min(1).max(5).nullable().default(null),
});

export type BookRequest = z.infer<typeof BookRequestSchema>;

export type Book = BookRequest & {
  id: number;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 2: Sanity check the schema parses defaults**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bun -e '
import { BookRequestSchema } from "./src/domains/books/types";
console.log(JSON.stringify(BookRequestSchema.parse({
  title: "T", slug: "t", author: "A",
}), null, 2));
'
```
Expected output:
```json
{
  "title": "T",
  "slug": "t",
  "author": "A",
  "publisher": null,
  "thumbnailUrl": null,
  "description": null,
  "isbn": null,
  "readStartDate": null,
  "readEndDate": null,
  "rating": null
}
```

If Zod v4 complains about `.string().date()` not being a function, the API in Zod v4 is `z.iso.date()` — substitute it. Re-run the sanity check until output matches.

- [ ] **Step 3: Type-check**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/domains/books/types.ts
git commit -m "feat(api): add book Zod schemas and types"
```

---

## Task 7: Book repo (`repo.ts`)

**Files:**
- Create: `apps/api-next/packages/core/src/domains/books/repo.ts`

- [ ] **Step 1: Write `repo.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/books/repo.ts`:

```ts
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "../../db/client";
import type { Book, BookRequest } from "./types";

const bookColumns = {
  id: schema.books.id,
  title: schema.books.title,
  slug: schema.books.slug,
  author: schema.books.author,
  publisher: schema.books.publisher,
  thumbnailUrl: schema.books.thumbnail_url,
  description: schema.books.description,
  isbn: schema.books.isbn,
  readStartDate: schema.books.read_start_date,
  readEndDate: schema.books.read_end_date,
  rating: schema.books.rating,
  createdAt: schema.books.created_at,
  updatedAt: schema.books.updated_at,
};

function toRow(req: BookRequest): {
  title: string;
  slug: string;
  author: string;
  publisher: string | null;
  thumbnail_url: string | null;
  description: string | null;
  isbn: string | null;
  read_start_date: string | null;
  read_end_date: string | null;
  rating: number | null;
} {
  return {
    title: req.title,
    slug: req.slug,
    author: req.author,
    publisher: req.publisher,
    thumbnail_url: req.thumbnailUrl,
    description: req.description,
    isbn: req.isbn,
    read_start_date: req.readStartDate,
    read_end_date: req.readEndDate,
    rating: req.rating,
  };
}

export async function findAll(): Promise<Book[]> {
  return await db.select(bookColumns).from(schema.books);
}

export async function findById(id: number): Promise<Book | null> {
  const rows = await db.select(bookColumns).from(schema.books).where(eq(schema.books.id, id));
  return rows[0] ?? null;
}

export async function findBySlug(slug: string): Promise<Book | null> {
  const rows = await db.select(bookColumns).from(schema.books).where(eq(schema.books.slug, slug));
  return rows[0] ?? null;
}

export async function existsBySlug(slug: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.books.id })
    .from(schema.books)
    .where(eq(schema.books.slug, slug))
    .limit(1);
  return rows.length > 0;
}

export async function existsBySlugExcludingId(slug: string, excludeId: number): Promise<boolean> {
  const rows = await db
    .select({ id: schema.books.id })
    .from(schema.books)
    .where(and(eq(schema.books.slug, slug), ne(schema.books.id, excludeId)))
    .limit(1);
  return rows.length > 0;
}

export async function insert(req: BookRequest, now: string): Promise<Book> {
  const inserted = await db
    .insert(schema.books)
    .values({ ...toRow(req), created_at: now, updated_at: now })
    .returning(bookColumns);
  return inserted[0]!;
}

export async function update(id: number, req: BookRequest, now: string): Promise<Book> {
  const updated = await db
    .update(schema.books)
    .set({ ...toRow(req), updated_at: now })
    .where(eq(schema.books.id, id))
    .returning(bookColumns);
  return updated[0]!;
}

export async function deleteById(id: number): Promise<void> {
  await db.delete(schema.books).where(eq(schema.books.id, id));
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
git add apps/api-next/packages/core/src/domains/books/repo.ts
git commit -m "feat(api): add book repo with snake↔camel column mapping"
```

---

## Task 8: Book service (`service.ts`)

**Files:**
- Create: `apps/api-next/packages/core/src/domains/books/service.ts`

- [ ] **Step 1: Write `service.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/books/service.ts`:

```ts
import { BusinessError } from "../../errors";
import * as repo from "./repo";
import type { Book, BookRequest } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

export async function findAll(): Promise<Book[]> {
  return await repo.findAll();
}

export async function findById(id: number): Promise<Book> {
  const book = await repo.findById(id);
  if (!book) throw BusinessError.from("BOOK_NOT_FOUND");
  return book;
}

export async function findBySlug(slug: string): Promise<Book> {
  const book = await repo.findBySlug(slug);
  if (!book) throw BusinessError.from("BOOK_NOT_FOUND");
  return book;
}

export async function create(req: BookRequest): Promise<Book> {
  if (await repo.existsBySlug(req.slug)) {
    throw BusinessError.from("BOOK_SLUG_DUPLICATE");
  }
  return await repo.insert(req, nowIso());
}

export async function update(id: number, req: BookRequest): Promise<Book> {
  const existing = await repo.findById(id);
  if (!existing) throw BusinessError.from("BOOK_NOT_FOUND");
  if (req.slug !== existing.slug) {
    if (await repo.existsBySlugExcludingId(req.slug, id)) {
      throw BusinessError.from("BOOK_SLUG_DUPLICATE");
    }
  }
  return await repo.update(id, req, nowIso());
}

export async function deleteBook(id: number): Promise<void> {
  const existing = await repo.findById(id);
  if (!existing) throw BusinessError.from("BOOK_NOT_FOUND");
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
git add apps/api-next/packages/core/src/domains/books/service.ts
git commit -m "feat(api): add book service with 404 + slug-duplicate rules"
```

---

## Task 9: Book domain barrel + core barrel re-export

**Files:**
- Create: `apps/api-next/packages/core/src/domains/books/index.ts`
- Modify: `apps/api-next/packages/core/src/index.ts`

- [ ] **Step 1: Create `domains/books/index.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/books/index.ts`:

```ts
export { BookRequestSchema, type BookRequest, type Book } from "./types";
export {
  findAll as bookFindAll,
  findById as bookFindById,
  findBySlug as bookFindBySlug,
  create as bookCreate,
  update as bookUpdate,
  deleteBook as bookDelete,
} from "./service";
```

`repo.ts` is intentionally not re-exported.

- [ ] **Step 2: Extend the core barrel**

Edit `~/github/new-blog/apps/api-next/packages/core/src/index.ts`. After the existing settings re-exports block, append:

```ts
export {
  BookRequestSchema,
  type BookRequest,
  type Book,
  bookFindAll,
  bookFindById,
  bookFindBySlug,
  bookCreate,
  bookUpdate,
  bookDelete,
} from "./domains/books";

export {
  type Article,
  type ArticleStatus,
  VISIBLE_STATUSES,
  articlesFindVisibleByBookId,
  articlesFindAllByBookId,
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
git add apps/api-next/packages/core/src/domains/books/index.ts apps/api-next/packages/core/src/index.ts
git commit -m "feat(api): export book + articles public surface from @api-next/core

Function names are namespaced with the domain prefix at the barrel
layer so the core surface stays collision-free as more domains land
in Plans D–J."
```

---

## Task 10: Admin books route + wire-up (admin tests should go green)

**Files:**
- Create: `apps/api-next/apps/admin/src/routes/books.ts`
- Modify: `apps/api-next/apps/admin/src/app.ts`

- [ ] **Step 1: Write `routes/books.ts`**

Write `~/github/new-blog/apps/api-next/apps/admin/src/routes/books.ts`:

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  BookRequestSchema,
  bookFindAll,
  bookFindById,
  bookCreate,
  bookUpdate,
  bookDelete,
  articlesFindAllByBookId,
} from "@api-next/core";

// Local copy of the Plan B Zod-error → message mapper. Kept inline until
// the shared middleware extraction (deferred per Plan A spec).
type ZodIssueLike = { path: PropertyKey[]; message: string };
type ZodErrorLike = { issues: ZodIssueLike[] };

function validationErrorMessage(error: ZodErrorLike): string {
  const first = error.issues[0];
  if (!first) return "Invalid request body";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const booksAdminRoute = new Hono();

booksAdminRoute.get("/", async (c) => {
  const data = await bookFindAll();
  return c.json({ data });
});

booksAdminRoute.get(
  "/:id",
  zValidator("param", idParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const book = await bookFindById(id);
    const articles = await articlesFindAllByBookId(id);
    return c.json({ data: { book, articles } });
  },
);

booksAdminRoute.post(
  "/",
  zValidator("json", BookRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const data = await bookCreate(c.req.valid("json"));
    return c.json({ data }, 201);
  },
);

booksAdminRoute.put(
  "/:id",
  zValidator("param", idParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  zValidator("json", BookRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const data = await bookUpdate(id, c.req.valid("json"));
    return c.json({ data });
  },
);

booksAdminRoute.delete(
  "/:id",
  zValidator("param", idParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    await bookDelete(id);
    return c.body(null, 204);
  },
);
```

- [ ] **Step 2: Mount in `apps/admin/src/app.ts`**

Read the current `~/github/new-blog/apps/api-next/apps/admin/src/app.ts`. After the `import { settingsRoute } from "./routes/settings";` line, add:

```ts
import { booksAdminRoute } from "./routes/books";
```

Inside `createApp()`, after `app.route("/admin/settings", settingsRoute);`, add:

```ts
app.route("/admin/books", booksAdminRoute);
```

- [ ] **Step 3: Run all admin tests**

```bash
cd ~/github/new-blog/apps/api-next/apps/admin
bun test 2>&1 | tail -25
```

Expected: 28 tests pass total (5 jwtAuth + 2 health + 6 settings + 15 books) with 0 fail. If a books test fails:

- **POST 201 wrong**: confirm `c.json({ data }, 201)` is the second-arg status code on the POST handler.
- **slug duplicate test returns wrong message**: confirm the Korean string in `errors.ts` matches exactly.
- **PUT same-slug test fails with 400 unexpectedly**: confirm `service.ts` only checks slug uniqueness when `req.slug !== existing.slug`.
- **GET sorted articles wrong order**: confirm `repo.ts` of articles uses `asc(schema.articles.order_in_book)`.
- **DB error in beforeEach**: confirm `bootstrap-dev-db.sh` has been run on the local container (`docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "\dt"` should list `books` and `articles`).

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/src/routes/books.ts apps/api-next/apps/admin/src/app.ts
git commit -m "feat(api): add /admin/books route (CRUD + book detail with articles)

Wires bookFindAll/ById/Create/Update/Delete plus articlesFindAllByBookId
into the admin Hono app. Path :id coerced to number via zValidator;
all endpoints share the Plan B error-envelope hook locally."
```

---

## Task 11: Public blog books route + wire-up (blog tests should go green)

**Files:**
- Create: `apps/api-next/apps/blog/src/routes/books.ts`
- Modify: `apps/api-next/apps/blog/src/app.ts`

- [ ] **Step 1: Write `routes/books.ts`**

Write `~/github/new-blog/apps/api-next/apps/blog/src/routes/books.ts`:

```ts
import { Hono } from "hono";
import {
  bookFindAll,
  bookFindBySlug,
  articlesFindVisibleByBookId,
  type Book,
} from "@api-next/core";

type BookWithArticleCount = {
  id: number;
  title: string;
  slug: string;
  author: string;
  thumbnailUrl: string | null;
  rating: number | null;
  articleCount: number;
};

export const booksRoute = new Hono();

booksRoute.get("/", async (c) => {
  const books = await bookFindAll();
  // N+1 mirrors Kotlin behavior. Optimization deferred to a later plan.
  const data: BookWithArticleCount[] = await Promise.all(
    books.map(async (book: Book) => {
      const articles = await articlesFindVisibleByBookId(book.id);
      return {
        id: book.id,
        title: book.title,
        slug: book.slug,
        author: book.author,
        thumbnailUrl: book.thumbnailUrl,
        rating: book.rating,
        articleCount: articles.length,
      };
    }),
  );
  return c.json({ data });
});

booksRoute.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const book = await bookFindBySlug(slug);
  const articles = await articlesFindVisibleByBookId(book.id);
  return c.json({ data: { book, articles } });
});
```

- [ ] **Step 2: Mount in `apps/blog/src/app.ts`**

Read the current `~/github/new-blog/apps/api-next/apps/blog/src/app.ts`. Add the import:

```ts
import { booksRoute } from "./routes/books";
```

Inside `createApp()`, after `app.route("/health", healthRoute);`, add:

```ts
app.route("/books", booksRoute);
```

- [ ] **Step 3: Wire the book service errors into the blog error handler**

The existing `apps/blog/src/middleware/errorHandler.ts` already catches `BusinessError` and emits `{ message }` with the right status. No changes needed — verify by reading the file. If `BOOK_NOT_FOUND` test returns 500 instead of 404, the handler is missing `instanceof BusinessError`; fix it before continuing.

- [ ] **Step 4: Run all blog tests**

```bash
cd ~/github/new-blog/apps/api-next/apps/blog
bun test 2>&1 | tail -15
```

Expected: 7 tests pass (2 health + 5 books) with 0 fail. If a test fails:

- **Empty list test fails**: confirm `bookFindAll()` returns `[]` rather than throwing.
- **BookWithArticleCount counts wrong**: confirm `articlesFindVisibleByBookId` filters status to `["PUBLIC", "LOCKED"]` only (verify in `domains/articles/repo.ts`).
- **Visible-only filter test fails**: same — articles repo must use `inArray(status, VISIBLE_STATUSES)`.
- **404 returns 500**: error handler not catching `BusinessError`.

- [ ] **Step 5: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/blog/src/routes/books.ts apps/api-next/apps/blog/src/app.ts
git commit -m "feat(api): add public /books route (list with article counts + detail)

Two endpoints mirroring the Kotlin BookController. The N+1 query in
GET / is preserved exactly — optimization is a separate concern handled
in a later perf-focused plan."
```

---

## Task 12: Monorepo verification + smoke test

**Files:** (no changes unless a lint or type error surfaces)

- [ ] **Step 1: `turbo run lint`**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog
bunx turbo run lint --force 2>&1 | tail -15
```
Expected: all 5 workspaces pass, 0 errors. Frontends (admin, blog) may emit pre-existing warnings — those are acceptable.

- [ ] **Step 2: `turbo run test`**

```bash
cd ~/github/new-blog
NODE_ENV=test bunx turbo run test --force 2>&1 | tail -20
```
Expected: 4 successful tasks (`@api-next/core`, `api-blog-next`, `api-admin-next`, `admin` Next.js). Test counts:

- `@api-next/core`: 6 (env + errors)
- `api-blog-next`: 7 (2 health + 5 books)
- `api-admin-next`: 28 (5 jwtAuth + 2 health + 6 settings + 15 books)
- `admin` Next.js: 15 (vitest)

- [ ] **Step 3: Manual smoke — admin POST round trip**

Terminal 1 (admin server):
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

echo "--- POST /admin/books ---"
curl -s -X POST -H "authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"title":"Smoke","slug":"smoke","author":"Me","publisher":null,"thumbnailUrl":null,"description":null,"isbn":null,"readStartDate":null,"readEndDate":null,"rating":null}' \
  http://localhost:9081/admin/books
echo

echo "--- GET /admin/books ---"
curl -s -H "authorization: Bearer $TOKEN" http://localhost:9081/admin/books
echo

echo "--- DB row ---"
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "SELECT id, slug, title FROM books"

echo "--- cleanup ---"
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "TRUNCATE books RESTART IDENTITY CASCADE"
```

Stop the admin server (Ctrl+C in terminal 1).

Expected: POST returns 201 with the book envelope, GET returns the list with that one book, DB row shows the inserted row.

- [ ] **Step 4: Manual smoke — public blog read**

Terminal 1 (blog server):
```bash
cd ~/github/new-blog/apps/api-next/apps/blog
export $(grep -v '^#' ../../.env | xargs)
export BLOG_PORT=9080
bun run src/index.ts
```

Terminal 2:
```bash
docker exec api-next-dev-db psql -U api_next -d api_next_dev <<'SQL'
INSERT INTO books (title, slug, author, created_at, updated_at)
VALUES ('Smoke', 'smoke', 'Me', NOW(), NOW())
RETURNING id;
SQL

curl -s http://localhost:9080/books
echo
curl -s http://localhost:9080/books/smoke
echo

docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "TRUNCATE books RESTART IDENTITY CASCADE"
```

Stop the blog server.

Expected: `GET /books` returns the list with `articleCount: 0`, `GET /books/smoke` returns `{ data: { book, articles: [] } }`.

No commit — verification only.

---

## Plan C Completion Checklist

- [ ] `errors.ts` has `BOOK_NOT_FOUND` and `BOOK_SLUG_DUPLICATE` (Task 1)
- [ ] `schema.ts` `books.id` is `mode: "number"` (Task 2)
- [ ] `domains/articles/{types,repo,index}.ts` exist with read-only stub (Task 5)
- [ ] `domains/books/{types,repo,service,index}.ts` exist with full CRUD (Tasks 6–9)
- [ ] Core barrel re-exports both new domains with namespaced names (Task 9)
- [ ] `apps/admin/src/routes/books.ts` mounted at `/admin/books` (Task 10)
- [ ] `apps/blog/src/routes/books.ts` mounted at `/books` (Task 11)
- [ ] `apps/admin/test/books.test.ts` 15 cases pass (Task 10)
- [ ] `apps/blog/test/books.test.ts` 5 cases pass (Task 11)
- [ ] `bunx turbo run lint` passes 5/5 (Task 12)
- [ ] `NODE_ENV=test bunx turbo run test` passes 4/4 (Task 12)
- [ ] Smoke test confirms POST → GET round trip and DB persistence (Task 12)

## Out of Scope (Handled by Later Plans)

- `PUT /admin/books/:id/article-order` — Plan E (article)
- Full article domain (Zod schemas for create/update, write functions, service, route) — Plan E
- Pagination, search, filter — not in Kotlin either
- N+1 query optimization on `GET /books` — preserved for parity
- `@api-next/core/middleware` extraction — still deferred per Plan A spec
- `hono-pino` migration — still deferred
- Renaming Plan B's `getSiteSettings` etc to namespaced style — separate refactor when collisions appear
