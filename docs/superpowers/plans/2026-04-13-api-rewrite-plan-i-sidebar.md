# API Rewrite — Plan I: Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the 3 public sidebar endpoints as thin aggregators over Plan F / H / G2 core functions.

**Architecture:** One route file with 3 passthrough handlers. No new core exports, no new tests beyond the route's own integration test. Relies entirely on existing `@api-next/core` surface.

**Tech Stack:** Hono 4, existing `@api-next/core` exports, `bun:test`.

**Design reference:** `docs/superpowers/specs/2026-04-13-api-rewrite-plan-i-sidebar-design.md`

---

## Scope Check

Three handlers, one test file, one route file, one line in `app.ts`. Smallest plan in the rewrite sequence.

## File Structure

```
apps/api-next/apps/blog/
├── src/
│   ├── app.ts                        # +mount /sidebar
│   └── routes/
│       └── sidebar.ts                # NEW: 3 handlers
└── test/
    └── sidebar.test.ts               # NEW: 6 integration cases
```

---

## Task 1: Failing sidebar integration test (TDD red)

**Files:**
- Create: `apps/api-next/apps/blog/test/sidebar.test.ts`

- [ ] **Step 1: Write the test file**

Write `~/github/new-blog/apps/api-next/apps/blog/test/sidebar.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { createApp } from "../src/app";
import { db, schema, sql, analyticsAddVisitor, analyticsSaveDailyVisitorStats } from "@api-next/core";
import { resetDb, resetRedis } from "@api-next/core/test-helpers";
import { __clearCommentsCache } from "@api-next/core/src/domains/comments/service";

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
```

**Note on the `__clearCommentsCache` import**: Plan H left that helper accessible via the file-relative subpath. If the import path breaks, the alternative is to add a short wait between test runs (>60s) or restart the test runner — but the direct file import is faster. If Bun can't resolve `@api-next/core/src/...`, use a relative path from the test file: `../../../packages/core/src/domains/comments/service` — whichever Bun accepts.

- [ ] **Step 2: Run and verify red**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/apps/blog
bun test test/sidebar.test.ts 2>&1 | tail -15
```
Expected: tests fail because `/sidebar` route doesn't exist yet. Exit non-zero.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/blog/test/sidebar.test.ts
git commit -m "test(api): add failing sidebar integration tests (TDD red)

6 cases: popular-articles empty + with data, recent-comments with
fetch mock (success + 503 fallback), visitors empty + Redis+DB mix."
```

---

## Task 2: Sidebar route + wire-up

**Files:**
- Create: `apps/api-next/apps/blog/src/routes/sidebar.ts`
- Modify: `apps/api-next/apps/blog/src/app.ts`

- [ ] **Step 1: Write `routes/sidebar.ts`**

Write `~/github/new-blog/apps/api-next/apps/blog/src/routes/sidebar.ts`:

```ts
import { Hono } from "hono";
import {
  analyticsFindTopPages,
  commentsGetRecent,
  analyticsGetVisitorSummary,
  type PopularArticle,
} from "@api-next/core";

export const sidebarRoute = new Hono();

sidebarRoute.get("/popular-articles", async (c) => {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 30);
  const topPages = await analyticsFindTopPages(from, to);
  const data: PopularArticle[] = topPages.slice(0, 5).map((p) => ({
    id: p.articleId,
    title: p.title,
    viewCount: p.viewCount,
  }));
  return c.json({ data });
});

sidebarRoute.get("/recent-comments", async (c) => {
  const data = await commentsGetRecent(5);
  return c.json({ data });
});

sidebarRoute.get("/visitors", async (c) => {
  const data = await analyticsGetVisitorSummary();
  return c.json({ data });
});
```

- [ ] **Step 2: Mount in blog app.ts**

Read `~/github/new-blog/apps/api-next/apps/blog/src/app.ts`. Add the import alongside existing route imports:

```ts
import { sidebarRoute } from "./routes/sidebar";
```

Inside `createApp()`, after the last existing `app.route(...)` call (likely `/analytics` from Plan G2), add:

```ts
app.route("/sidebar", sidebarRoute);
```

- [ ] **Step 3: Run blog tests**

```bash
cd ~/github/new-blog/apps/api-next/apps/blog
bun test 2>&1 | tail -20
```
Expected: all blog tests pass (existing 30 + 6 sidebar = 36).

If failing:
- sidebar/popular-articles shape wrong: verify the `.slice(0, 5).map(...)` block produces `id` (not `articleId`)
- sidebar/visitors wrong total: Plan G2's `getVisitorSummary` sums `daily_visitor_stats` + today's Redis count, which the test seeds exactly
- sidebar/recent-comments returns real GitHub data instead of mock: a prior test case may have populated the in-memory cache — confirm `__clearCommentsCache()` ran in `beforeEach`
- Fetch mock bleed: `restoreFetch()` in each `it` and in `afterAll`

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/blog/src/routes/sidebar.ts apps/api-next/apps/blog/src/app.ts
git commit -m "feat(api): add public /sidebar route (popular-articles, recent-comments, visitors)

Three passthrough handlers over Plan F (findTopPages), Plan H
(commentsGetRecent), Plan G2 (getVisitorSummary). popular-articles
duplicates the dashboard's 3-line slice+rename; DRY extraction is
deferred until a third usage."
```

---

## Task 3: Monorepo verification + smoke test

**Files:** (no changes)

- [ ] **Step 1: `turbo run lint`**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog
bunx turbo run lint --force 2>&1 | tail -10
```
Expected: 5/5 success, 0 errors.

- [ ] **Step 2: `bun run test`**

```bash
cd ~/github/new-blog
bun run test 2>&1 | tail -15
```
Expected: 4/4 successful. Counts:
- `@api-next/core`: 30 (unchanged)
- `api-blog-next`: 36 (30 + 6 sidebar)
- `api-admin-next`: 80 (unchanged)
- `admin` Next.js: 15

- [ ] **Step 3: Manual smoke — all 3 sidebar endpoints**

```bash
# Seed page view + article + daily stats
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "
INSERT INTO articles (title, slug, content, status, created_at, updated_at, published_at)
VALUES ('Smoke', 'smoke', 'body', 'PUBLIC', NOW(), NOW(), NOW()) RETURNING id;
"
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "
INSERT INTO page_views (path, ip_address, session_id, created_at)
VALUES ('/articles/1', '1.1.1.1', 's1', NOW()),
       ('/articles/1', '1.1.1.1', 's1', NOW());
"
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "
INSERT INTO daily_visitor_stats (date, visitor_count) VALUES ('2026-04-10', 3);
"
docker exec api-next-dev-redis redis-cli SADD "visitors:$(date +%F)" "s1"

# Start blog server
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/apps/blog
export $(grep -v '^#' ../../.env | xargs)
export BLOG_PORT=9080
bun run src/index.ts > /tmp/blog-i.log 2>&1 &
BLOG_PID=$!
sleep 1

echo "--- popular-articles ---"
curl -s http://localhost:9080/sidebar/popular-articles
echo
echo "--- recent-comments ---"
curl -s http://localhost:9080/sidebar/recent-comments
echo
echo "--- visitors ---"
curl -s http://localhost:9080/sidebar/visitors
echo

kill $BLOG_PID 2>/dev/null
wait 2>/dev/null

# Cleanup
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "
TRUNCATE page_views, articles, daily_visitor_stats RESTART IDENTITY CASCADE;
"
docker exec api-next-dev-redis redis-cli DEL "visitors:$(date +%F)"
```

Expected:
- **popular-articles**: `{"data":[{"id":1,"title":"Smoke","viewCount":2}]}`
- **recent-comments**: some array from real GitHub (or `[]` if offline / rate-limited)
- **visitors**: `{"data":{"total":4,"today":1,"yesterday":0}}` (3 historical + 1 today)

No commit.

---

## Plan I Completion Checklist

- [ ] `apps/blog/src/routes/sidebar.ts` created and mounted at `/sidebar` (Task 2)
- [ ] `apps/blog/test/sidebar.test.ts` 6 cases pass (Tasks 1, 2)
- [ ] `bunx turbo run lint` 5/5 (Task 3)
- [ ] `bun run test` 4/4 (Task 3)
- [ ] Smoke test confirms all 3 endpoints return expected shapes (Task 3)

## Out of Scope

- Extracting shared popular-articles helper between dashboard and sidebar — deferred until a third caller
- Authentication (sidebar is public, matches Kotlin)
- New core exports — Plan I adds zero
- Modifications to Plan F/H/G2 functionality
