# API Rewrite — Plan D: Series Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Kotlin `series` domain (7 of 8 endpoints — defers `PUT /admin/series/:id/article-order` to Plan E). Series is structurally identical to book but simpler (4 fields). This plan reuses every Plan C decision verbatim and extends the existing `domains/articles/` stub with two more reader functions.

**Architecture:** Same template as Plan B (settings) and Plan C (book). `domains/series/{types,repo,service,index}.ts` follows the standard layout with snake↔camel column mapping in the repo and Korean error messages mirroring the Kotlin `ErrorCode` enum. Tests use `resetDb()` + raw drizzle inserts in `beforeEach`.

**Tech Stack:** Hono 4, `@hono/zod-validator`, Drizzle ORM + `bun:sql`, Zod 4, `bun:test`, jose (test JWTs).

**Design reference:** `docs/superpowers/specs/2026-04-13-api-rewrite-plan-d-series-design.md`

---

## Scope Check

This plan ports one full domain (series) and extends the Plan C `domains/articles/` stub with two new reader functions. It does not touch any other domain, frontend, or Kotlin code, and does not modify Plan A–C files except: `errors.ts` (+2 codes), `schema.ts` (one-line widening), `domains/articles/{repo,index}.ts` (+2 functions and barrel updates), and `packages/core/src/index.ts` (barrel re-exports). Each `apps/api-next/apps/{blog,admin}/src/app.ts` change is one import + one mount line.

## File Structure

```
apps/api-next/
├── apps/
│   ├── admin/
│   │   ├── src/
│   │   │   ├── app.ts                         # +mount /admin/series
│   │   │   └── routes/
│   │   │       └── series.ts                  # NEW: 5 admin handlers
│   │   └── test/
│   │       └── series.test.ts                 # NEW: ~15 admin TDD cases
│   └── blog/
│       ├── src/
│       │   ├── app.ts                         # +mount /series
│       │   └── routes/
│       │       └── series.ts                  # NEW: 2 public handlers
│       └── test/
│           └── series.test.ts                 # NEW: 4 public TDD cases
└── packages/core/
    └── src/
        ├── db/
        │   └── schema.ts                      # +1-line: series.id mode bigint→number
        ├── domains/
        │   ├── series/                        # NEW
        │   │   ├── types.ts                   # Zod schemas + Series/SeriesRequest types
        │   │   ├── repo.ts                    # drizzle queries with snake↔camel mapping
        │   │   ├── service.ts                 # business rules: 404, slug dup
        │   │   └── index.ts                   # barrel with namespaced re-exports
        │   └── articles/                      # MODIFY
        │       ├── repo.ts                    # +findVisibleBySeriesId, +findAllBySeriesId
        │       └── index.ts                   # +2 namespaced re-exports
        ├── errors.ts                          # +SERIES_NOT_FOUND, SERIES_SLUG_DUPLICATE
        └── index.ts                           # +re-export domains/series + 2 article functions
```

---

## Task 1: Extend ErrorCode with SERIES_* entries

**Files:**
- Modify: `apps/api-next/packages/core/src/errors.ts`

- [ ] **Step 1: Add the two new entries**

Read `~/github/new-blog/apps/api-next/packages/core/src/errors.ts`. After the existing `BOOK_SLUG_DUPLICATE` line, add two lines so the `ErrorCode` const reads:

```ts
export const ErrorCode = {
  UNAUTHORIZED: { status: 401, message: "Unauthorized" },
  INTERNAL: { status: 500, message: "Internal server error" },
  BOOK_NOT_FOUND: { status: 404, message: "책을 찾을 수 없습니다" },
  BOOK_SLUG_DUPLICATE: { status: 400, message: "이미 사용 중인 책 slug입니다" },
  SERIES_NOT_FOUND: { status: 404, message: "시리즈를 찾을 수 없습니다" },
  SERIES_SLUG_DUPLICATE: { status: 400, message: "이미 사용 중인 시리즈 slug입니다" },
} as const satisfies Record<string, ErrorCodeValue>;
```

- [ ] **Step 2: Type-check core**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 3: Run core tests**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bun test
```
Expected: 6 pass / 0 fail.

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/errors.ts
git commit -m "feat(api): add SERIES_NOT_FOUND and SERIES_SLUG_DUPLICATE error codes

Korean messages mirror the Kotlin ErrorCode enum verbatim."
```

---

## Task 2: Widen series.id mode in schema.ts to number

**Files:**
- Modify: `apps/api-next/packages/core/src/db/schema.ts`

- [ ] **Step 1: Find and edit the series.id line**

In `~/github/new-blog/apps/api-next/packages/core/src/db/schema.ts`, the `series` table declaration starts with:

```ts
export const series = pgTable("series", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
```

Change `"bigint"` to `"number"`:

```ts
export const series = pgTable("series", {
	id: bigserial({ mode: "number" }).primaryKey().notNull(),
```

That is the only edit. Do not touch any other line.

- [ ] **Step 2: Type-check**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/db/schema.ts
git commit -m "chore(api): widen series.id drizzle mode from bigint to number

Same rationale as the books.id widening in Plan C — JS number is
sufficient for a personal blog and keeps numeric IDs uniform."
```

---

## Task 3: Failing admin series integration test (TDD red)

**Files:**
- Create: `apps/api-next/apps/admin/test/series.test.ts`

- [ ] **Step 1: Write the full test file**

Write `~/github/new-blog/apps/api-next/apps/admin/test/series.test.ts`:

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
  let token: string;

  beforeAll(async () => {
    token = await mintValidToken();
  });

  beforeEach(async () => {
    await resetDb();
  });

  // ----- POST -----
  it("POST /admin/series creates a series", async () => {
    const res = await app.request("/admin/series", {
      method: "POST",
      headers: authHeaders(token),
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
      headers: authHeaders(token),
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
      headers: authHeaders(token),
      body: JSON.stringify(bodyNoTitle),
    });
    expect(res.status).toBe(400);
  });

  // ----- GET list -----
  it("GET /admin/series returns empty list", async () => {
    const res = await app.request("/admin/series", { headers: authHeaders(token) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [] });
  });

  it("GET /admin/series returns all seeded series", async () => {
    await seedSeries({ slug: "a", title: "A" });
    await seedSeries({ slug: "b", title: "B" });
    const res = await app.request("/admin/series", { headers: authHeaders(token) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SeriesListEnvelope;
    expect(body.data).toHaveLength(2);
    const slugs = body.data.map((s) => s.slug).sort();
    expect(slugs).toEqual(["a", "b"]);
  });

  // ----- GET by id -----
  it("GET /admin/series/:id returns series + empty articles", async () => {
    const id = await seedSeries();
    const res = await app.request(`/admin/series/${id}`, { headers: authHeaders(token) });
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
    const res = await app.request(`/admin/series/${id}`, { headers: authHeaders(token) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { series: SeriesResponse; articles: { slug: string }[] } };
    expect(body.data.articles.map((a) => a.slug)).toEqual(["s1", "s2", "s3"]);
  });

  it("GET /admin/series/:id returns 404 for missing id", async () => {
    const res = await app.request("/admin/series/9999", { headers: authHeaders(token) });
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
      headers: authHeaders(token),
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
      headers: authHeaders(token),
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(200);
  });

  it("PUT /admin/series/:id rejects a slug already used by another series", async () => {
    await seedSeries({ slug: "first" });
    const id = await seedSeries({ slug: "second" });
    const res = await app.request(`/admin/series/${id}`, {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ ...validBody, slug: "first" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.message).toBe("이미 사용 중인 시리즈 slug입니다");
  });

  it("PUT /admin/series/:id returns 404 for missing id", async () => {
    const res = await app.request("/admin/series/9999", {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(404);
  });

  // ----- DELETE -----
  it("DELETE /admin/series/:id removes the series", async () => {
    const id = await seedSeries();
    const del = await app.request(`/admin/series/${id}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
    expect(del.status).toBe(204);
    const getRes = await app.request(`/admin/series/${id}`, { headers: authHeaders(token) });
    expect(getRes.status).toBe(404);
  });

  it("DELETE /admin/series/:id returns 404 for missing id", async () => {
    const res = await app.request("/admin/series/9999", {
      method: "DELETE",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(404);
  });

  // ----- Auth -----
  it("all endpoints return 401 without a JWT", async () => {
    const list = await app.request("/admin/series");
    expect(list.status).toBe(401);
    const get = await app.request("/admin/series/1");
    expect(get.status).toBe(401);
    const post = await app.request("/admin/series", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(post.status).toBe(401);
    const put = await app.request("/admin/series/1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(put.status).toBe(401);
    const del = await app.request("/admin/series/1", { method: "DELETE" });
    expect(del.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

```bash
cd ~/github/new-blog/apps/api-next/apps/admin
bun test test/series.test.ts 2>&1 | tail -15
```
Expected: most tests fail. The 401 test plus a few 404 cases may pass coincidentally. Exit non-zero.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/test/series.test.ts
git commit -m "test(api): add failing admin series integration tests (TDD red)

15 cases mirroring the Plan C book test layout. Goes green incrementally
as Tasks 5–10 land the domain layer and route."
```

---

## Task 4: Failing public blog series integration test (TDD red)

**Files:**
- Create: `apps/api-next/apps/blog/test/series.test.ts`

- [ ] **Step 1: Write the test file**

Write `~/github/new-blog/apps/api-next/apps/blog/test/series.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "bun:test";
import { createApp } from "../src/app";
import { db, schema } from "@api-next/core";
import { resetDb } from "@api-next/core/test-helpers";

type SeriesListItem = {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  thumbnailUrl: string | null;
  articleCount: number;
};

type SeriesDetailResponse = {
  data: {
    series: { id: number; title: string; slug: string };
    articles: { id: number; slug: string; status: string }[];
  };
};

async function seedSeries(slug: string, title: string) {
  const now = new Date().toISOString();
  const inserted = await db
    .insert(schema.series)
    .values({
      title,
      slug,
      description: null,
      thumbnail_url: null,
      created_at: now,
      updated_at: now,
    })
    .returning({ id: schema.series.id });
  return inserted[0]!.id;
}

async function seedArticle(opts: {
  seriesId: number;
  status: "DRAFT" | "PUBLIC" | "LOCKED" | "PRIVATE";
  slug: string;
}) {
  const now = new Date().toISOString();
  await db.insert(schema.articles).values({
    title: opts.slug,
    slug: opts.slug,
    content: "body",
    status: opts.status,
    series_id: opts.seriesId,
    order_in_series: null,
    created_at: now,
    updated_at: now,
  });
}

describe("public GET /series", () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
  });

  it("returns empty list when no series exist", async () => {
    const res = await app.request("/series");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [] });
  });

  it("returns SeriesWithArticleCount[] with visible-article counts", async () => {
    const id1 = await seedSeries("alpha", "Alpha");
    const id2 = await seedSeries("beta", "Beta");
    await seedArticle({ seriesId: id1, status: "PUBLIC", slug: "p1" });
    await seedArticle({ seriesId: id1, status: "LOCKED", slug: "p2" });
    await seedArticle({ seriesId: id1, status: "DRAFT", slug: "p3" });
    await seedArticle({ seriesId: id1, status: "PRIVATE", slug: "p4" });

    const res = await app.request("/series");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: SeriesListItem[] };
    const byId = Object.fromEntries(body.data.map((s) => [s.id, s]));
    expect(byId[id1]?.articleCount).toBe(2);
    expect(byId[id2]?.articleCount).toBe(0);
  });
});

describe("public GET /series/:slug", () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
  });

  it("returns series + visible articles only", async () => {
    const id = await seedSeries("alpha", "Alpha");
    await seedArticle({ seriesId: id, status: "PUBLIC", slug: "v1" });
    await seedArticle({ seriesId: id, status: "LOCKED", slug: "v2" });
    await seedArticle({ seriesId: id, status: "DRAFT", slug: "h1" });
    await seedArticle({ seriesId: id, status: "PRIVATE", slug: "h2" });

    const res = await app.request("/series/alpha");
    expect(res.status).toBe(200);
    const body = (await res.json()) as SeriesDetailResponse;
    expect(body.data.series.slug).toBe("alpha");
    const articleSlugs = body.data.articles.map((a) => a.slug).sort();
    expect(articleSlugs).toEqual(["v1", "v2"]);
  });

  it("returns 404 for unknown slug", async () => {
    const res = await app.request("/series/nope");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("시리즈를 찾을 수 없습니다");
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

```bash
cd ~/github/new-blog/apps/api-next/apps/blog
bun test test/series.test.ts 2>&1 | tail -10
```
Expected: tests fail because the `/series` route does not exist yet.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/blog/test/series.test.ts
git commit -m "test(api): add failing public series integration tests (TDD red)

4 cases for the public blog endpoints. Goes green when Task 11 adds
the blog series route."
```

---

## Task 5: Extend articles stub with series readers

**Files:**
- Modify: `apps/api-next/packages/core/src/domains/articles/repo.ts`
- Modify: `apps/api-next/packages/core/src/domains/articles/index.ts`

- [ ] **Step 1: Add the two new repo functions**

Read `~/github/new-blog/apps/api-next/packages/core/src/domains/articles/repo.ts`. After the existing `findAllByBookId` function, append two new functions and update the imports if needed (the existing imports already cover everything needed):

```ts
export async function findVisibleBySeriesId(seriesId: number): Promise<Article[]> {
  const rows = await db
    .select(articleColumns)
    .from(schema.articles)
    .where(
      and(
        eq(schema.articles.series_id, seriesId),
        inArray(schema.articles.status, VISIBLE_STATUSES as unknown as string[]),
      ),
    );
  castStatus(rows);
  return rows as Article[];
}

export async function findAllBySeriesId(seriesId: number): Promise<Article[]> {
  const rows = await db
    .select(articleColumns)
    .from(schema.articles)
    .where(eq(schema.articles.series_id, seriesId))
    .orderBy(asc(schema.articles.order_in_series));
  castStatus(rows);
  return rows as Article[];
}
```

These mirror `findVisibleByBookId` / `findAllByBookId` exactly, just on `series_id` and ordered by `order_in_series` instead of `order_in_book`.

- [ ] **Step 2: Update the articles barrel**

Read `~/github/new-blog/apps/api-next/packages/core/src/domains/articles/index.ts`. The current re-export block:

```ts
export {
  findVisibleByBookId as articlesFindVisibleByBookId,
  findAllByBookId as articlesFindAllByBookId,
} from "./repo";
```

Replace with:

```ts
export {
  findVisibleByBookId as articlesFindVisibleByBookId,
  findAllByBookId as articlesFindAllByBookId,
  findVisibleBySeriesId as articlesFindVisibleBySeriesId,
  findAllBySeriesId as articlesFindAllBySeriesId,
} from "./repo";
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
git add apps/api-next/packages/core/src/domains/articles
git commit -m "feat(api): extend articles stub with series readers

Mirrors the book pattern: findVisibleBySeriesId filters to PUBLIC +
LOCKED status; findAllBySeriesId returns all articles in the series
sorted by order_in_series. Plan E will replace these with full
service-layer functions."
```

---

## Task 6: Series domain types (`types.ts`)

**Files:**
- Create: `apps/api-next/packages/core/src/domains/series/types.ts`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p ~/github/new-blog/apps/api-next/packages/core/src/domains/series
```

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/series/types.ts`:

```ts
import { z } from "zod";

export const SeriesRequestSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable().default(null),
  thumbnailUrl: z.string().nullable().default(null),
});

export type SeriesRequest = z.infer<typeof SeriesRequestSchema>;

export type Series = SeriesRequest & {
  id: number;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 2: Sanity check**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bun -e '
import { SeriesRequestSchema } from "./src/domains/series/types";
console.log(JSON.stringify(SeriesRequestSchema.parse({
  title: "T", slug: "t",
}), null, 2));
'
```

Expected output:
```json
{
  "title": "T",
  "slug": "t",
  "description": null,
  "thumbnailUrl": null
}
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
git add apps/api-next/packages/core/src/domains/series/types.ts
git commit -m "feat(api): add series Zod schemas and types"
```

---

## Task 7: Series repo (`repo.ts`)

**Files:**
- Create: `apps/api-next/packages/core/src/domains/series/repo.ts`

- [ ] **Step 1: Write `repo.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/series/repo.ts`:

```ts
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "../../db/client";
import type { Series, SeriesRequest } from "./types";

const seriesColumns = {
  id: schema.series.id,
  title: schema.series.title,
  slug: schema.series.slug,
  description: schema.series.description,
  thumbnailUrl: schema.series.thumbnail_url,
  createdAt: schema.series.created_at,
  updatedAt: schema.series.updated_at,
};

function toRow(req: SeriesRequest): {
  title: string;
  slug: string;
  description: string | null;
  thumbnail_url: string | null;
} {
  return {
    title: req.title,
    slug: req.slug,
    description: req.description,
    thumbnail_url: req.thumbnailUrl,
  };
}

export async function findAll(): Promise<Series[]> {
  return await db.select(seriesColumns).from(schema.series);
}

export async function findById(id: number): Promise<Series | null> {
  const rows = await db.select(seriesColumns).from(schema.series).where(eq(schema.series.id, id));
  return rows[0] ?? null;
}

export async function findBySlug(slug: string): Promise<Series | null> {
  const rows = await db.select(seriesColumns).from(schema.series).where(eq(schema.series.slug, slug));
  return rows[0] ?? null;
}

export async function existsBySlug(slug: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.series.id })
    .from(schema.series)
    .where(eq(schema.series.slug, slug))
    .limit(1);
  return rows.length > 0;
}

export async function existsBySlugExcludingId(slug: string, excludeId: number): Promise<boolean> {
  const rows = await db
    .select({ id: schema.series.id })
    .from(schema.series)
    .where(and(eq(schema.series.slug, slug), ne(schema.series.id, excludeId)))
    .limit(1);
  return rows.length > 0;
}

export async function insert(req: SeriesRequest, now: string): Promise<Series> {
  const inserted = await db
    .insert(schema.series)
    .values({ ...toRow(req), created_at: now, updated_at: now })
    .returning(seriesColumns);
  return inserted[0]!;
}

export async function update(id: number, req: SeriesRequest, now: string): Promise<Series> {
  const updated = await db
    .update(schema.series)
    .set({ ...toRow(req), updated_at: now })
    .where(eq(schema.series.id, id))
    .returning(seriesColumns);
  return updated[0]!;
}

export async function deleteById(id: number): Promise<void> {
  await db.delete(schema.series).where(eq(schema.series.id, id));
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
git add apps/api-next/packages/core/src/domains/series/repo.ts
git commit -m "feat(api): add series repo with snake↔camel column mapping"
```

---

## Task 8: Series service (`service.ts`)

**Files:**
- Create: `apps/api-next/packages/core/src/domains/series/service.ts`

- [ ] **Step 1: Write `service.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/series/service.ts`:

```ts
import { BusinessError } from "../../errors";
import * as repo from "./repo";
import type { Series, SeriesRequest } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

export async function findAll(): Promise<Series[]> {
  return await repo.findAll();
}

export async function findById(id: number): Promise<Series> {
  const series = await repo.findById(id);
  if (!series) throw BusinessError.from("SERIES_NOT_FOUND");
  return series;
}

export async function findBySlug(slug: string): Promise<Series> {
  const series = await repo.findBySlug(slug);
  if (!series) throw BusinessError.from("SERIES_NOT_FOUND");
  return series;
}

export async function create(req: SeriesRequest): Promise<Series> {
  if (await repo.existsBySlug(req.slug)) {
    throw BusinessError.from("SERIES_SLUG_DUPLICATE");
  }
  return await repo.insert(req, nowIso());
}

export async function update(id: number, req: SeriesRequest): Promise<Series> {
  const existing = await repo.findById(id);
  if (!existing) throw BusinessError.from("SERIES_NOT_FOUND");
  if (req.slug !== existing.slug) {
    if (await repo.existsBySlugExcludingId(req.slug, id)) {
      throw BusinessError.from("SERIES_SLUG_DUPLICATE");
    }
  }
  return await repo.update(id, req, nowIso());
}

export async function deleteSeries(id: number): Promise<void> {
  const existing = await repo.findById(id);
  if (!existing) throw BusinessError.from("SERIES_NOT_FOUND");
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
git add apps/api-next/packages/core/src/domains/series/service.ts
git commit -m "feat(api): add series service with 404 + slug-duplicate rules"
```

---

## Task 9: Series barrel + core barrel re-export

**Files:**
- Create: `apps/api-next/packages/core/src/domains/series/index.ts`
- Modify: `apps/api-next/packages/core/src/index.ts`

- [ ] **Step 1: Create `domains/series/index.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/series/index.ts`:

```ts
export { SeriesRequestSchema, type SeriesRequest, type Series } from "./types";
export {
  findAll as seriesFindAll,
  findById as seriesFindById,
  findBySlug as seriesFindBySlug,
  create as seriesCreate,
  update as seriesUpdate,
  deleteSeries as seriesDelete,
} from "./service";
```

`repo.ts` is intentionally not re-exported.

- [ ] **Step 2: Extend the core barrel**

Read `~/github/new-blog/apps/api-next/packages/core/src/index.ts`. Two edits:

(a) After the existing books re-export block, append a new series block:

```ts
export {
  SeriesRequestSchema,
  type SeriesRequest,
  type Series,
  seriesFindAll,
  seriesFindById,
  seriesFindBySlug,
  seriesCreate,
  seriesUpdate,
  seriesDelete,
} from "./domains/series";
```

(b) The existing articles re-export block currently lists 5 names; replace it with 7 names so it includes the new series functions:

```ts
export {
  type Article,
  type ArticleStatus,
  VISIBLE_STATUSES,
  articlesFindVisibleByBookId,
  articlesFindAllByBookId,
  articlesFindVisibleBySeriesId,
  articlesFindAllBySeriesId,
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
git add apps/api-next/packages/core/src/domains/series/index.ts apps/api-next/packages/core/src/index.ts
git commit -m "feat(api): export series public surface from @api-next/core

Also extends the articles re-export block with the two new series
reader functions added in Task 5."
```

---

## Task 10: Admin series route + wire-up (admin tests should go green)

**Files:**
- Create: `apps/api-next/apps/admin/src/routes/series.ts`
- Modify: `apps/api-next/apps/admin/src/app.ts`

- [ ] **Step 1: Write `routes/series.ts`**

Write `~/github/new-blog/apps/api-next/apps/admin/src/routes/series.ts`:

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  SeriesRequestSchema,
  seriesFindAll,
  seriesFindById,
  seriesCreate,
  seriesUpdate,
  seriesDelete,
  articlesFindAllBySeriesId,
} from "@api-next/core";

// Local copy of the Plan B/C Zod-error → message mapper. Extraction to a
// shared module is still deferred per Plan A spec.
type ZodIssueLike = { path: PropertyKey[]; message: string };
type ZodErrorLike = { issues: ZodIssueLike[] };

function validationErrorMessage(error: ZodErrorLike): string {
  const first = error.issues[0];
  if (!first) return "Invalid request body";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const seriesAdminRoute = new Hono();

seriesAdminRoute.get("/", async (c) => {
  const data = await seriesFindAll();
  return c.json({ data });
});

seriesAdminRoute.get(
  "/:id",
  zValidator("param", idParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const series = await seriesFindById(id);
    const articles = await articlesFindAllBySeriesId(id);
    return c.json({ data: { series, articles } });
  },
);

seriesAdminRoute.post(
  "/",
  zValidator("json", SeriesRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const data = await seriesCreate(c.req.valid("json"));
    return c.json({ data }, 201);
  },
);

seriesAdminRoute.put(
  "/:id",
  zValidator("param", idParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  zValidator("json", SeriesRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const data = await seriesUpdate(id, c.req.valid("json"));
    return c.json({ data });
  },
);

seriesAdminRoute.delete(
  "/:id",
  zValidator("param", idParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    await seriesDelete(id);
    return c.body(null, 204);
  },
);
```

- [ ] **Step 2: Mount in `apps/admin/src/app.ts`**

Read the current `~/github/new-blog/apps/api-next/apps/admin/src/app.ts`. After the existing `import { booksAdminRoute } from "./routes/books";` line, add:

```ts
import { seriesAdminRoute } from "./routes/series";
```

Inside `createApp()`, after `app.route("/admin/books", booksAdminRoute);`, add:

```ts
app.route("/admin/series", seriesAdminRoute);
```

- [ ] **Step 3: Run all admin tests**

```bash
cd ~/github/new-blog/apps/api-next/apps/admin
bun test 2>&1 | tail -25
```

Expected: 43 tests pass total (5 jwtAuth + 2 health + 6 settings + 15 books + 15 series), 0 fail.

If a series test fails, debug guide:
- POST 201 wrong: confirm `c.json({ data }, 201)` second-arg
- slug duplicate test wrong message: confirm Korean string in errors.ts matches exactly
- PUT same-slug fails 400: confirm service.ts only checks slug uniqueness when slug actually changes
- GET sorted articles wrong order: confirm articles repo uses `asc(schema.articles.order_in_series)` for the new series function
- DB error in beforeEach: confirm bootstrap-dev-db.sh has been run

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/src/routes/series.ts apps/api-next/apps/admin/src/app.ts
git commit -m "feat(api): add /admin/series route (CRUD + series detail with articles)"
```

---

## Task 11: Public blog series route + wire-up (blog tests should go green)

**Files:**
- Create: `apps/api-next/apps/blog/src/routes/series.ts`
- Modify: `apps/api-next/apps/blog/src/app.ts`

- [ ] **Step 1: Write `routes/series.ts`**

Write `~/github/new-blog/apps/api-next/apps/blog/src/routes/series.ts`:

```ts
import { Hono } from "hono";
import {
  seriesFindAll,
  seriesFindBySlug,
  articlesFindVisibleBySeriesId,
  type Series,
} from "@api-next/core";

type SeriesWithArticleCount = {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  thumbnailUrl: string | null;
  articleCount: number;
};

export const seriesRoute = new Hono();

seriesRoute.get("/", async (c) => {
  const series = await seriesFindAll();
  // N+1 mirrors Kotlin behavior. Optimization deferred.
  const data: SeriesWithArticleCount[] = await Promise.all(
    series.map(async (s: Series) => {
      const articles = await articlesFindVisibleBySeriesId(s.id);
      return {
        id: s.id,
        title: s.title,
        slug: s.slug,
        description: s.description,
        thumbnailUrl: s.thumbnailUrl,
        articleCount: articles.length,
      };
    }),
  );
  return c.json({ data });
});

seriesRoute.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const series = await seriesFindBySlug(slug);
  const articles = await articlesFindVisibleBySeriesId(series.id);
  return c.json({ data: { series, articles } });
});
```

- [ ] **Step 2: Mount in `apps/blog/src/app.ts`**

Read the current `~/github/new-blog/apps/api-next/apps/blog/src/app.ts`. Add the import:

```ts
import { seriesRoute } from "./routes/series";
```

Inside `createApp()`, after `app.route("/books", booksRoute);`, add:

```ts
app.route("/series", seriesRoute);
```

- [ ] **Step 3: Run all blog tests**

```bash
cd ~/github/new-blog/apps/api-next/apps/blog
bun test 2>&1 | tail -15
```

Expected: 10 pass / 0 fail (2 health + 4 books + 4 series).

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/blog/src/routes/series.ts apps/api-next/apps/blog/src/app.ts
git commit -m "feat(api): add public /series route (list with article counts + detail)"
```

---

## Task 12: Monorepo verification + smoke test

**Files:** (no changes unless errors surface)

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
bun run test 2>&1 | tail -15
```
Expected: 4 successful tasks. Counts: `@api-next/core` 6, `api-blog-next` 10 (2 health + 4 books + 4 series), `api-admin-next` 43 (5 jwtAuth + 2 health + 6 settings + 15 books + 15 series), `admin` Next.js 15.

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

echo "--- POST /admin/series ---"
curl -s -X POST -H "authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"title":"Smoke","slug":"smoke","description":null,"thumbnailUrl":null}' \
  http://localhost:9081/admin/series
echo
echo "--- GET /admin/series ---"
curl -s -H "authorization: Bearer $TOKEN" http://localhost:9081/admin/series
echo
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "TRUNCATE series RESTART IDENTITY CASCADE"
```

Stop server (Ctrl+C in terminal 1).

Expected: POST returns 201 + data envelope, GET returns the same row in a list, TRUNCATE cleans up.

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
INSERT INTO series (title, slug, created_at, updated_at)
VALUES ('Smoke', 'smoke', NOW(), NOW())
RETURNING id;
SQL
curl -s http://localhost:9080/series
echo
curl -s http://localhost:9080/series/smoke
echo
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:9080/series/nope
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "TRUNCATE series RESTART IDENTITY CASCADE"
```

Stop server.

Expected: list with 1 entry whose `articleCount: 0`, detail response with `articles: []`, 404 for unknown slug.

No commit — verification only.

---

## Plan D Completion Checklist

- [ ] `errors.ts` has `SERIES_NOT_FOUND` and `SERIES_SLUG_DUPLICATE` (Task 1)
- [ ] `schema.ts` `series.id` is `mode: "number"` (Task 2)
- [ ] `domains/articles/repo.ts` has `findVisibleBySeriesId` and `findAllBySeriesId`; `index.ts` re-exports them (Task 5)
- [ ] `domains/series/{types,repo,service,index}.ts` exist with full CRUD (Tasks 6–9)
- [ ] Core barrel re-exports series + the two new article functions (Task 9)
- [ ] `apps/admin/src/routes/series.ts` mounted at `/admin/series` (Task 10)
- [ ] `apps/blog/src/routes/series.ts` mounted at `/series` (Task 11)
- [ ] `apps/admin/test/series.test.ts` 15 cases pass (Task 10)
- [ ] `apps/blog/test/series.test.ts` 4 cases pass (Task 11)
- [ ] `bunx turbo run lint` 5/5 (Task 12)
- [ ] `bun run test` (root, serial) 4/4 (Task 12)
- [ ] Smoke test confirms POST → GET round trip + public blog read (Task 12)

## Out of Scope (Handled by Later Plans)

- `PUT /admin/series/:id/article-order` — Plan E (article)
- Full article domain — Plan E
- Pagination, search, filter — not in Kotlin
- N+1 optimization on `GET /series` — preserved for parity
- `@api-next/core/middleware` extraction — still deferred
- `hono-pino` migration — still deferred
- Renaming Plan B's settings exports to namespaced style
