# API Rewrite — Plan F: Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the single Kotlin dashboard endpoint `GET /admin/dashboard/popular-articles` to Hono, introducing a minimal `domains/analytics/` stub that Plan G (full analytics) and Plan I (sidebar) will expand/reuse.

**Architecture:** A single raw-SQL query aggregates page_views by article and returns the top N. No service layer in Plan F — the single function lives in the repo and is called directly by the route handler. The path-to-article-id extraction (`CAST(SUBSTRING(path, 11) AS bigint)`) mirrors the Kotlin QueryDSL implementation exactly.

**Tech Stack:** Hono 4, Drizzle ORM raw SQL, `bun:test`, jose (test JWTs).

**Design reference:** `docs/superpowers/specs/2026-04-13-api-rewrite-plan-f-dashboard-design.md`

---

## Scope Check

One endpoint. One new domain directory (minimal stub). One new route file. One test file. Does not touch any other plan's files except: `packages/core/src/index.ts` (barrel) and `apps/admin/src/app.ts` (mount line).

## File Structure

```
apps/api-next/
├── apps/admin/
│   ├── src/
│   │   ├── app.ts                             # +mount /admin/dashboard
│   │   └── routes/
│   │       └── dashboard.ts                   # NEW
│   └── test/
│       └── dashboard.test.ts                  # NEW
└── packages/core/
    └── src/
        ├── index.ts                           # +analytics re-export
        └── domains/analytics/
            ├── types.ts                       # NEW: PopularArticle
            ├── repo.ts                        # NEW: findPopularArticles
            └── index.ts                       # NEW: barrel
```

---

## Task 1: Failing dashboard integration test (TDD red)

**Files:**
- Create: `apps/api-next/apps/admin/test/dashboard.test.ts`

- [ ] **Step 1: Write the test file**

Write `~/github/new-blog/apps/api-next/apps/admin/test/dashboard.test.ts`:

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

type PopularArticleResponse = {
  id: number;
  title: string;
  viewCount: number;
};

type ListEnvelope = { data: PopularArticleResponse[] };

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

async function seedPageView(path: string, daysAgo = 0) {
  const created = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  await db.insert(schema.page_views).values({
    path,
    ip_address: "127.0.0.1",
    user_agent: null,
    referrer: null,
    session_id: null,
    latitude: null,
    longitude: null,
    country: null,
    city: null,
    created_at: created,
  });
}

describe("admin GET /admin/dashboard/popular-articles", () => {
  const app = createApp();
  let token: string;

  beforeAll(async () => {
    token = await mintValidToken();
  });

  beforeEach(async () => {
    await resetDb();
  });

  it("empty page_views returns empty list", async () => {
    const res = await app.request("/admin/dashboard/popular-articles", {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [] });
  });

  it("returns top articles sorted by viewCount desc", async () => {
    const id1 = await seedArticle("A1");
    const id2 = await seedArticle("A2");
    const id3 = await seedArticle("A3");
    // A2 has 3 views, A1 has 2, A3 has 1
    await seedPageView(`/articles/${id2}`);
    await seedPageView(`/articles/${id2}`);
    await seedPageView(`/articles/${id2}`);
    await seedPageView(`/articles/${id1}`);
    await seedPageView(`/articles/${id1}`);
    await seedPageView(`/articles/${id3}`);
    const res = await app.request("/admin/dashboard/popular-articles", {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ListEnvelope;
    expect(body.data).toHaveLength(3);
    expect(body.data[0]?.id).toBe(id2);
    expect(body.data[0]?.viewCount).toBe(3);
    expect(body.data[1]?.id).toBe(id1);
    expect(body.data[1]?.viewCount).toBe(2);
    expect(body.data[2]?.id).toBe(id3);
    expect(body.data[2]?.viewCount).toBe(1);
  });

  it("excludes page_views older than 30 days", async () => {
    const id = await seedArticle("Old");
    await seedPageView(`/articles/${id}`, 31);
    const res = await app.request("/admin/dashboard/popular-articles", {
      headers: authHeaders(token),
    });
    const body = (await res.json()) as ListEnvelope;
    expect(body.data).toEqual([]);
  });

  it("excludes non-/articles paths", async () => {
    const id = await seedArticle("Real");
    await seedPageView(`/articles/${id}`);
    await seedPageView("/about");
    await seedPageView("/series/some");
    const res = await app.request("/admin/dashboard/popular-articles", {
      headers: authHeaders(token),
    });
    const body = (await res.json()) as ListEnvelope;
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.id).toBe(id);
    expect(body.data[0]?.viewCount).toBe(1);
  });

  it("returns 401 without JWT", async () => {
    const res = await app.request("/admin/dashboard/popular-articles");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run and verify red**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/apps/admin
bun test test/dashboard.test.ts 2>&1 | tail -15
```
Expected: most tests fail (route doesn't exist). The 401 test may coincidentally pass because jwtAuth middleware runs before routing.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/test/dashboard.test.ts
git commit -m "test(api): add failing dashboard integration tests (TDD red)

5 cases: empty, sorted top articles, 30-day window, non-/articles
path exclusion, and 401."
```

---

## Task 2: Create `domains/analytics/types.ts`

**Files:**
- Create: `apps/api-next/packages/core/src/domains/analytics/types.ts`

- [ ] **Step 1: Write the file**

```bash
mkdir -p ~/github/new-blog/apps/api-next/packages/core/src/domains/analytics
```

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/analytics/types.ts`:

```ts
export type PopularArticle = {
  id: number;
  title: string;
  viewCount: number;
};
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
git add apps/api-next/packages/core/src/domains/analytics/types.ts
git commit -m "feat(api): add analytics domain stub with PopularArticle type"
```

---

## Task 3: Create `domains/analytics/repo.ts` with raw SQL query

**Files:**
- Create: `apps/api-next/packages/core/src/domains/analytics/repo.ts`

- [ ] **Step 1: Write the file**

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/analytics/repo.ts`:

```ts
import { sql } from "drizzle-orm";
import { db } from "../../db/client";
import type { PopularArticle } from "./types";

/**
 * Returns the top N articles by page view count within the last `days` days.
 *
 * Mirrors Kotlin's QueryDslAnalyticsReader.findTopPages. The frontend tracks
 * article views with `path = '/articles/<numeric-id>'`, so we strip the
 * `/articles/` prefix (10 chars) and CAST the remainder to bigint to join
 * against articles.id.
 *
 * Uses raw SQL because drizzle's fluent query builder can't express a JOIN
 * on a derived SUBSTRING/CAST expression without escape hatches anyway.
 */
export async function findPopularArticles(limit: number, days: number): Promise<PopularArticle[]> {
  const rows = await db.execute(sql`
    SELECT a.id AS id, a.title AS title, COUNT(pv.id)::bigint AS view_count
    FROM page_views pv
    JOIN articles a ON a.id = CAST(SUBSTRING(pv.path FROM 11) AS bigint)
    WHERE pv.created_at >= NOW() - (${days} || ' days')::interval
      AND pv.path LIKE '/articles/%'
    GROUP BY a.id, a.title
    ORDER BY view_count DESC
    LIMIT ${limit}
  `);
  return (rows as unknown as { id: number | bigint; title: string; view_count: number | bigint }[]).map(
    (r) => ({
      id: Number(r.id),
      title: r.title,
      viewCount: Number(r.view_count),
    }),
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0. If drizzle's `db.execute` return type doesn't match the cast shape, adjust the inner type assertion — but the runtime shape is what matters, and postgres returns `{ id, title, view_count }` keys.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/domains/analytics/repo.ts
git commit -m "feat(api): add analytics.findPopularArticles via raw SQL

Aggregates page_views by article id (extracted from path via substring
+ cast) over a time window. Uses raw sql\`\` template because drizzle's
query builder has no clean way to express JOIN on a derived expression."
```

---

## Task 4: Analytics barrel + core re-export

**Files:**
- Create: `apps/api-next/packages/core/src/domains/analytics/index.ts`
- Modify: `apps/api-next/packages/core/src/index.ts`

- [ ] **Step 1: Create the domain barrel**

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/analytics/index.ts`:

```ts
export { type PopularArticle } from "./types";
export { findPopularArticles as analyticsFindPopularArticles } from "./repo";
```

- [ ] **Step 2: Extend the core barrel**

Read `~/github/new-blog/apps/api-next/packages/core/src/index.ts`. Append at the end of the file:

```ts
export { type PopularArticle, analyticsFindPopularArticles } from "./domains/analytics";
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
git add apps/api-next/packages/core/src/domains/analytics/index.ts apps/api-next/packages/core/src/index.ts
git commit -m "feat(api): export analytics stub from @api-next/core"
```

---

## Task 5: Admin dashboard route + wire-up

**Files:**
- Create: `apps/api-next/apps/admin/src/routes/dashboard.ts`
- Modify: `apps/api-next/apps/admin/src/app.ts`

- [ ] **Step 1: Write `routes/dashboard.ts`**

Write `~/github/new-blog/apps/api-next/apps/admin/src/routes/dashboard.ts`:

```ts
import { Hono } from "hono";
import { analyticsFindPopularArticles } from "@api-next/core";

export const dashboardRoute = new Hono();

dashboardRoute.get("/popular-articles", async (c) => {
  const data = await analyticsFindPopularArticles(5, 30);
  return c.json({ data });
});
```

- [ ] **Step 2: Mount in `apps/admin/src/app.ts`**

Read `~/github/new-blog/apps/api-next/apps/admin/src/app.ts`. Add import alongside existing route imports:

```ts
import { dashboardRoute } from "./routes/dashboard";
```

Inside `createApp()`, after `app.route("/admin/articles", articlesAdminRoute);`, add:

```ts
app.route("/admin/dashboard", dashboardRoute);
```

- [ ] **Step 3: Run dashboard tests**

```bash
cd ~/github/new-blog/apps/api-next/apps/admin
bun test test/dashboard.test.ts 2>&1 | tail -15
```
Expected: 5 pass / 0 fail.

If failing:
- Empty result wrong: drizzle's `db.execute` return shape may differ — log `rows` and inspect
- Sort order wrong: confirm `ORDER BY view_count DESC` in the SQL
- 30-day test fails: confirm the `days || ' days'` interval casting works in postgres 17 (it should)
- Non-/articles path test fails: verify the `LIKE '/articles/%'` clause

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/src/routes/dashboard.ts apps/api-next/apps/admin/src/app.ts
git commit -m "feat(api): add /admin/dashboard/popular-articles route"
```

---

## Task 6: Monorepo verification + smoke test

**Files:** (no code changes unless errors)

- [ ] **Step 1: `turbo run lint`**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog
bunx turbo run lint --force 2>&1 | tail -10
```
Expected: 5/5, 0 errors.

- [ ] **Step 2: `bun run test` (root, serial)**

```bash
cd ~/github/new-blog
bun run test 2>&1 | tail -10
```
Expected: 4/4 successful. api-admin-next tests now include dashboard (5 more).

- [ ] **Step 3: Manual smoke test**

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
# Seed data
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "
INSERT INTO articles (title, slug, content, status, created_at, updated_at, published_at)
VALUES ('Smoke', 'smoke', 'body', 'PUBLIC', NOW(), NOW(), NOW()) RETURNING id;
"
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "
INSERT INTO page_views (path, ip_address, created_at)
VALUES ('/articles/1', '127.0.0.1', NOW()),
       ('/articles/1', '127.0.0.1', NOW()),
       ('/articles/1', '127.0.0.1', NOW());
"

# Mint token and curl
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

curl -s -H "authorization: Bearer $TOKEN" http://localhost:9081/admin/dashboard/popular-articles
echo

# Cleanup
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "
TRUNCATE page_views, articles RESTART IDENTITY CASCADE;
"
```

Stop server.

Expected: `{"data":[{"id":1,"title":"Smoke","viewCount":3}]}`.

No commit.

---

## Plan F Completion Checklist

- [ ] `domains/analytics/types.ts` with `PopularArticle` (Task 2)
- [ ] `domains/analytics/repo.ts` with `findPopularArticles` raw SQL (Task 3)
- [ ] `domains/analytics/index.ts` barrel (Task 4)
- [ ] Core barrel re-exports `PopularArticle` + `analyticsFindPopularArticles` (Task 4)
- [ ] `apps/admin/src/routes/dashboard.ts` mounted at `/admin/dashboard` (Task 5)
- [ ] `apps/admin/test/dashboard.test.ts` 5 cases pass (Task 5)
- [ ] `bunx turbo run lint` 5/5 (Task 6)
- [ ] `bun run test` 4/4 (Task 6)
- [ ] Smoke test confirms real SQL query round trip (Task 6)

## Out of Scope (Handled by Later Plans)

- **Full analytics domain** (remaining 10+ reader functions, schedulers, write path, visitor stats) — Plan G
- **Redis caching** — Plan G or later
- **Public sidebar endpoint** using the same function — Plan I
