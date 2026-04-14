# API Rewrite — Plan G2: Analytics Writes + Infra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the analytics write path, Redis visitor counter, external geo resolver, and nightly scheduler. Provides `POST /analytics/page-view` on blog and the `getVisitorSummary` function Plan I consumes.

**Architecture:** Native `Bun.redis` client (no deps), `croner` for scheduling, `ip-api.com` fetch with 3s timeout, drizzle ON CONFLICT upserts for visitor_sessions and daily_visitor_stats. Fire-and-forget page view recording via floating promise with error logging.

**Tech Stack:** Hono 4, `Bun.redis`, `croner`, Drizzle ON CONFLICT, `bun:test`, Zod 4.

**Design reference:** `docs/superpowers/specs/2026-04-13-api-rewrite-plan-g2-analytics-writes-design.md`

---

## File Structure

```
apps/api-next/
├── docker-compose.yml                          # +redis
├── .env.example                                # +REDIS_URL
├── .env.test                                   # +REDIS_URL
├── apps/
│   ├── admin/
│   │   ├── package.json                        # +croner
│   │   └── src/
│   │       └── index.ts                        # +Cron registration
│   └── blog/
│       ├── src/
│       │   ├── app.ts                          # +mount /analytics
│       │   └── routes/
│       │       └── analytics.ts                # NEW
│       └── test/
│           └── analytics-track.test.ts         # NEW
└── packages/core/
    └── src/
        ├── env.ts                              # +REDIS_URL
        ├── index.ts                            # +new analytics surface
        ├── domains/analytics/
        │   ├── types.ts                        # +PageViewInput, GeoLocation, VisitorSummary, Zod schema
        │   ├── repo.ts                         # +3 writer functions
        │   ├── geo.ts                          # NEW
        │   ├── visitorCounter.ts               # NEW
        │   ├── service.ts                      # +recordPageView, getVisitorSummary, visitorStatsAggregate
        │   └── index.ts                        # +new exports
        └── test-helpers/index.ts               # +resetRedis
    └── test/
        ├── visitorCounter.test.ts              # NEW
        ├── geo.test.ts                         # NEW
        └── visitorStats.test.ts                # NEW
```

---

## Task 1: Docker compose + env REDIS_URL

**Files:**
- Modify: `apps/api-next/docker-compose.yml`
- Modify: `apps/api-next/packages/core/src/env.ts`
- Modify: `apps/api-next/.env.example`
- Modify: `apps/api-next/.env.test`

- [ ] **Step 1: Add redis service to docker-compose.yml**

Read `~/github/new-blog/apps/api-next/docker-compose.yml`. It currently has a postgres service. Add a redis service inside the `services:` block (and confirm the file doesn't already declare `services:` twice — use one block):

```yaml
  redis:
    image: redis:7-alpine
    container_name: api-next-dev-redis
    ports:
      - "6380:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
```

- [ ] **Step 2: Start the redis container**

```bash
cd ~/github/new-blog/apps/api-next
docker compose up -d redis
sleep 2
docker compose ps redis
docker exec api-next-dev-redis redis-cli ping
```
Expected: `PONG`.

- [ ] **Step 3: Add REDIS_URL to env.ts**

Read `~/github/new-blog/apps/api-next/packages/core/src/env.ts`. Inside the Zod `schema`, add:

```ts
  REDIS_URL: z.string().default("redis://localhost:6380"),
```

- [ ] **Step 4: Update .env.example and .env.test**

Append to `~/github/new-blog/apps/api-next/.env.example`:

```
REDIS_URL=redis://localhost:6380
```

Append to `~/github/new-blog/apps/api-next/.env.test`:

```
REDIS_URL=redis://localhost:6380
```

- [ ] **Step 5: Type-check + tests**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
bun test
```
Expected: tsc exit 0, all existing core tests still pass (REDIS_URL has default, no fixture update needed).

- [ ] **Step 6: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/docker-compose.yml apps/api-next/packages/core/src/env.ts apps/api-next/.env.example apps/api-next/.env.test
git commit -m "feat(api): add local dev Redis + REDIS_URL env var

Redis 7 alpine on host port 6380 (avoids conflict with legacy
Kotlin Redis). Env defaults to redis://localhost:6380 so no .env
edit is strictly required for local dev."
```

---

## Task 2: Install croner in admin workspace

**Files:**
- Modify: `apps/api-next/apps/admin/package.json`
- Modify: `bun.lock` (auto)

- [ ] **Step 1: Install**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/apps/admin
bun add croner
```
Expected: resolves ~v9 or later, pinned in package.json.

- [ ] **Step 2: Verify**

```bash
grep croner ~/github/new-blog/apps/api-next/apps/admin/package.json
```
Expected: one line showing the dep.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/package.json bun.lock
git commit -m "chore(api): install croner in api-admin-next workspace

Used by Plan G2's visitor stats aggregator scheduler."
```

---

## Task 3: Analytics types extension

**Files:**
- Modify: `apps/api-next/packages/core/src/domains/analytics/types.ts`

- [ ] **Step 1: Append new types**

Read the current file. At the end, append:

```ts
import { z } from "zod";

export type GeoLocation = {
  latitude: number;
  longitude: number;
  country: string | null;
  city: string | null;
};

export type VisitorSummary = {
  total: number;
  today: number;
  yesterday: number;
};

export const PageViewRequestSchema = z.object({
  path: z.string().min(1),
  ipAddress: z.string().min(1),
  userAgent: z.string().nullable().optional(),
  referrer: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
});

export type PageViewInput = z.infer<typeof PageViewRequestSchema>;
```

If the file already imports `z` at the top, don't re-import — just add the type blocks. Otherwise the `import { z } from "zod"` at the end is fine (TS hoists imports).

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
git commit -m "feat(api): add analytics write-side types + Zod schema

GeoLocation, VisitorSummary, PageViewInput + PageViewRequestSchema
for the POST /analytics/page-view body validator."
```

---

## Task 4: Analytics repo write functions

**Files:**
- Modify: `apps/api-next/packages/core/src/domains/analytics/repo.ts`

- [ ] **Step 1: Verify the daily_visitor_stats unique constraint**

```bash
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "\d daily_visitor_stats"
```

Look for a UNIQUE constraint on `date`. If present, the ON CONFLICT in `saveDailyVisitorStats` will work. If not, check the output and adjust the SQL below to use a WHERE-based upsert or add a unique constraint via a one-off `ALTER TABLE`. Report any deviation in the task report.

- [ ] **Step 2: Add writer functions to repo.ts**

Read `~/github/new-blog/apps/api-next/packages/core/src/domains/analytics/repo.ts`. Append at the end (after the existing reader functions):

```ts
export type PageViewRow = {
  path: string;
  ipAddress: string;
  userAgent: string | null;
  referrer: string | null;
  sessionId: string | null;
  latitude: number | null;
  longitude: number | null;
  country: string | null;
  city: string | null;
};

export async function savePageView(row: PageViewRow): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(sql`
    INSERT INTO page_views (
      path, ip_address, user_agent, referrer, session_id,
      latitude, longitude, country, city, created_at
    ) VALUES (
      ${row.path}, ${row.ipAddress}, ${row.userAgent}, ${row.referrer}, ${row.sessionId},
      ${row.latitude}, ${row.longitude}, ${row.country}, ${row.city}, ${now}::timestamp
    )
  `);
}

export async function upsertSession(
  sessionId: string,
  ipAddress: string,
  userAgent: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(sql`
    INSERT INTO visitor_sessions (
      session_id, ip_address, user_agent, first_visit_at, last_visit_at, page_view_count
    ) VALUES (
      ${sessionId}, ${ipAddress}, ${userAgent}, ${now}::timestamp, ${now}::timestamp, 1
    )
    ON CONFLICT (session_id) DO UPDATE SET
      last_visit_at = EXCLUDED.last_visit_at,
      page_view_count = visitor_sessions.page_view_count + 1
  `);
}

export async function saveDailyVisitorStats(date: string, visitorCount: number): Promise<void> {
  await db.execute(sql`
    INSERT INTO daily_visitor_stats (date, visitor_count)
    VALUES (${date}::date, ${visitorCount})
    ON CONFLICT (date) DO UPDATE SET visitor_count = EXCLUDED.visitor_count
  `);
}
```

If Step 1 revealed no unique constraint on `date`, the `saveDailyVisitorStats` ON CONFLICT won't work. In that case, add the constraint via:

```bash
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "ALTER TABLE daily_visitor_stats ADD CONSTRAINT daily_visitor_stats_date_key UNIQUE (date)"
```

and proceed with the ON CONFLICT version. Document the deviation in the commit message.

- [ ] **Step 3: Type-check**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/domains/analytics/repo.ts
git commit -m "feat(api): add analytics writer functions

savePageView (insert), upsertSession (ON CONFLICT DO UPDATE with
page_view_count increment), saveDailyVisitorStats (ON CONFLICT
DO UPDATE). Mirrors Kotlin JpaAnalyticsWriter behavior."
```

---

## Task 5: Geo resolver

**Files:**
- Create: `apps/api-next/packages/core/src/domains/analytics/geo.ts`

- [ ] **Step 1: Write `geo.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/analytics/geo.ts`:

```ts
import type { GeoLocation } from "./types";

type IpApiSuccess = {
  status: "success";
  lat: number;
  lon: number;
  country?: string;
  city?: string;
};

type IpApiFailure = {
  status: "fail" | string;
};

type IpApiResponse = IpApiSuccess | IpApiFailure;

const PRIVATE_IP_PREFIXES = ["127.", "192.168.", "10."];

/**
 * Resolves a public IPv4 address to lat/lng/country/city via ip-api.com.
 * Returns null for private/loopback IPs, network failures, non-success
 * responses, or timeouts. 3-second timeout keeps page-view recording
 * non-blocking even when ip-api is slow.
 *
 * Mirrors Kotlin IpApiGeoLocationResolver.resolve.
 */
export async function resolveGeoLocation(ipAddress: string): Promise<GeoLocation | null> {
  if (PRIVATE_IP_PREFIXES.some((prefix) => ipAddress.startsWith(prefix))) {
    return null;
  }
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ipAddress}?fields=status,lat,lon,country,city`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as IpApiResponse;
    if (json.status !== "success") return null;
    return {
      latitude: json.lat,
      longitude: json.lon,
      country: json.country ?? null,
      city: json.city ?? null,
    };
  } catch {
    return null;
  }
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
git add apps/api-next/packages/core/src/domains/analytics/geo.ts
git commit -m "feat(api): add geo location resolver (ip-api.com)

Mirrors Kotlin IpApiGeoLocationResolver: skips 127.* / 192.168.* /
10.* private ranges, 3-second fetch timeout, returns null on any
failure so page view recording stays non-blocking."
```

---

## Task 6: Visitor counter (Redis)

**Files:**
- Create: `apps/api-next/packages/core/src/domains/analytics/visitorCounter.ts`

- [ ] **Step 1: Write `visitorCounter.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/analytics/visitorCounter.ts`:

```ts
import { redis } from "bun";

const TTL_DAYS = 2;

function keyFor(date: string): string {
  return `visitors:${date}`;
}

function expireTimestampFor(date: string): number {
  // Expire at midnight UTC TTL_DAYS days after the given date
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + TTL_DAYS);
  return Math.floor(d.getTime() / 1000);
}

/**
 * Adds a session id to the visitors set for the given date. Sets the
 * key to expire at midnight UTC two days later (mirrors Kotlin TTL).
 *
 * @returns true if newly added, false if already present
 */
export async function addVisitor(date: string, sessionId: string): Promise<boolean> {
  const key = keyFor(date);
  const added = await redis.sadd(key, sessionId);
  await redis.expireat(key, expireTimestampFor(date));
  return Number(added) > 0;
}

/**
 * Returns the number of distinct session ids recorded for the date.
 */
export async function getVisitorCount(date: string): Promise<number> {
  const count = await redis.scard(keyFor(date));
  return Number(count);
}
```

- [ ] **Step 2: Sanity check with real Redis**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/packages/core
export $(grep -v '^#' ../../.env | xargs 2>/dev/null || true)
bun -e '
import { addVisitor, getVisitorCount } from "./src/domains/analytics/visitorCounter";
const d = "2026-04-13";
console.log(await addVisitor(d, "s1"));  // true
console.log(await addVisitor(d, "s2"));  // true
console.log(await addVisitor(d, "s1"));  // false (already in set)
console.log(await getVisitorCount(d));   // 2
import { redis } from "bun";
await redis.del(`visitors:${d}`);
console.log("cleaned up");
'
```
Expected: `true`, `true`, `false`, `2`, `cleaned up`.

If `Bun.redis` can't connect, check that the redis container is up (`docker compose ps redis`) and that `REDIS_URL` in `.env` points at `redis://localhost:6380`.

- [ ] **Step 3: Type-check**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/domains/analytics/visitorCounter.ts
git commit -m "feat(api): add Redis visitor counter using Bun.redis

addVisitor uses SADD + EXPIREAT (2 day TTL) to build a daily distinct
session set; getVisitorCount uses SCARD. Native Bun.redis client so no
external dep."
```

---

## Task 7: Analytics service — recordPageView, getVisitorSummary, visitorStatsAggregate

**Files:**
- Modify: `apps/api-next/packages/core/src/domains/analytics/service.ts`

- [ ] **Step 1: Append new functions**

Read the current `service.ts`. At the end (after the existing getOverview/getTopPages/etc), append:

```ts
import { resolveGeoLocation } from "./geo";
import { addVisitor, getVisitorCount } from "./visitorCounter";
import type { PageViewInput, VisitorSummary } from "./types";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Records a page view. Resolves geo (if public IP), inserts the row,
 * upserts the session, and adds to the Redis visitor set.
 *
 * Callers typically invoke this in a fire-and-forget pattern:
 *   recordPageView(body).catch((err) => console.warn("...", err));
 */
export async function recordPageView(input: PageViewInput): Promise<void> {
  const geo = await resolveGeoLocation(input.ipAddress);
  await repo.savePageView({
    path: input.path,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent ?? null,
    referrer: input.referrer ?? null,
    sessionId: input.sessionId ?? null,
    latitude: geo?.latitude ?? null,
    longitude: geo?.longitude ?? null,
    country: geo?.country ?? null,
    city: geo?.city ?? null,
  });
  if (input.sessionId) {
    await repo.upsertSession(input.sessionId, input.ipAddress, input.userAgent ?? null);
    await addVisitor(isoDate(new Date()), input.sessionId);
  }
}

/**
 * Returns the total / today / yesterday visitor counts with a fallback
 * chain: Redis → daily_visitor_stats → raw COUNT(DISTINCT session_id).
 * Total is historical daily sum + today's live Redis count.
 *
 * Mirrors Kotlin VisitorStatsService.getVisitorSummary.
 */
export async function getVisitorSummary(): Promise<VisitorSummary> {
  const now = new Date();
  const todayStr = isoDate(now);
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = isoDate(yesterday);

  const todayCount = await getVisitorCountWithFallback(todayStr);
  const yesterdayCount = await getVisitorCountWithFallback(yesterdayStr);
  const historicalTotal = await repo.getTotalVisitorCount();
  return {
    total: historicalTotal + todayCount,
    today: todayCount,
    yesterday: yesterdayCount,
  };
}

async function getVisitorCountWithFallback(date: string): Promise<number> {
  const redisCount = await getVisitorCount(date);
  if (redisCount > 0) return redisCount;
  const dbCount = (await repo.getVisitorCountByDate(date)).count;
  if (dbCount > 0) return dbCount;
  const from = new Date(`${date}T00:00:00.000Z`);
  const to = new Date(`${date}T23:59:59.999Z`);
  return await repo.countDistinctSessions(from, to);
}

/**
 * Nightly aggregation: compute yesterday's distinct session count and
 * write it to daily_visitor_stats. Idempotent (ON CONFLICT overwrites).
 * Mirrors Kotlin VisitorStatsAggregator.aggregateDaily.
 */
export async function visitorStatsAggregate(): Promise<void> {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yStr = isoDate(yesterday);
  const from = new Date(`${yStr}T00:00:00.000Z`);
  const to = new Date(`${yStr}T23:59:59.999Z`);
  const count = await repo.countDistinctSessions(from, to);
  await repo.saveDailyVisitorStats(yStr, count);
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
git add apps/api-next/packages/core/src/domains/analytics/service.ts
git commit -m "feat(api): add recordPageView, getVisitorSummary, visitorStatsAggregate

recordPageView: geo resolve + page_view insert + session upsert + Redis
set add (fire-and-forget compatible).
getVisitorSummary: Redis → DB → raw fallback chain matching Kotlin
VisitorStatsService, plus historical total from daily_visitor_stats.
visitorStatsAggregate: scheduler target — computes yesterday's
distinct session count and upserts daily_visitor_stats."
```

---

## Task 8: test-helpers resetRedis

**Files:**
- Modify: `apps/api-next/packages/core/src/test-helpers/index.ts`

- [ ] **Step 1: Append `resetRedis` export**

Read the current file. Append at the end:

```ts
import { redis } from "bun";

/**
 * Clears all `visitors:*` keys from Redis. Call in beforeEach alongside
 * resetDb() for tests that touch the visitor counter.
 */
export async function resetRedis(): Promise<void> {
  const keys = await redis.keys("visitors:*");
  if (keys && keys.length > 0) {
    await redis.del(...keys);
  }
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
git add apps/api-next/packages/core/src/test-helpers/index.ts
git commit -m "feat(api): add resetRedis test helper for visitor counter tests"
```

---

## Task 9: Barrel updates

**Files:**
- Modify: `apps/api-next/packages/core/src/domains/analytics/index.ts`
- Modify: `apps/api-next/packages/core/src/index.ts`

- [ ] **Step 1: Extend analytics domain barrel**

Read `~/github/new-blog/apps/api-next/packages/core/src/domains/analytics/index.ts`. Add new type and function exports. The final file should have (in addition to existing Plan G exports):

```ts
// ... existing Plan G type + repo + service re-exports ...

export {
  type GeoLocation,
  type VisitorSummary,
  type PageViewInput,
  PageViewRequestSchema,
} from "./types";

export {
  savePageView as analyticsSavePageView,
  upsertSession as analyticsUpsertSession,
  saveDailyVisitorStats as analyticsSaveDailyVisitorStats,
} from "./repo";

export { resolveGeoLocation as analyticsResolveGeoLocation } from "./geo";
export { addVisitor as analyticsAddVisitor, getVisitorCount as analyticsGetVisitorCount } from "./visitorCounter";

export {
  recordPageView as analyticsRecordPageView,
  getVisitorSummary as analyticsGetVisitorSummary,
  visitorStatsAggregate as analyticsVisitorStatsAggregate,
} from "./service";
```

(Keep the existing Plan G exports untouched; these are additions.)

- [ ] **Step 2: Extend core barrel**

Read `~/github/new-blog/apps/api-next/packages/core/src/index.ts`. Find the existing analytics re-export block (added in Plan G) and add the new names to the list:

```ts
export {
  // existing Plan G exports
  type Article, // or whatever's there
  // ...
  // new Plan G2 exports
  type GeoLocation,
  type VisitorSummary,
  type PageViewInput,
  PageViewRequestSchema,
  analyticsSavePageView,
  analyticsUpsertSession,
  analyticsSaveDailyVisitorStats,
  analyticsResolveGeoLocation,
  analyticsAddVisitor,
  analyticsGetVisitorCount,
  analyticsRecordPageView,
  analyticsGetVisitorSummary,
  analyticsVisitorStatsAggregate,
} from "./domains/analytics";
```

Also ensure `resetRedis` is exported alongside `resetDb` via the test-helpers subpath — no change needed to core barrel, it's already reachable via `@api-next/core/test-helpers`.

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
git commit -m "feat(api): export analytics write + infra surface from @api-next/core

New exports: GeoLocation, VisitorSummary, PageViewInput,
PageViewRequestSchema, analyticsSavePageView, analyticsUpsertSession,
analyticsSaveDailyVisitorStats, analyticsResolveGeoLocation,
analyticsAddVisitor, analyticsGetVisitorCount, analyticsRecordPageView,
analyticsGetVisitorSummary, analyticsVisitorStatsAggregate."
```

---

## Task 10: Unit tests — visitorCounter, geo, visitorStats

**Files:**
- Create: `apps/api-next/packages/core/test/visitorCounter.test.ts`
- Create: `apps/api-next/packages/core/test/geo.test.ts`
- Create: `apps/api-next/packages/core/test/visitorStats.test.ts`

- [ ] **Step 1: Write `visitorCounter.test.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/test/visitorCounter.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { redis } from "bun";
import {
  analyticsAddVisitor,
  analyticsGetVisitorCount,
} from "@api-next/core";
import { resetRedis } from "@api-next/core/test-helpers";

const TEST_DATE = "2026-04-13";

describe("visitor counter (Redis)", () => {
  beforeEach(async () => {
    await resetRedis();
  });

  afterAll(async () => {
    await resetRedis();
  });

  it("addVisitor returns true for new id", async () => {
    expect(await analyticsAddVisitor(TEST_DATE, "s1")).toBe(true);
  });

  it("addVisitor returns false for existing id", async () => {
    await analyticsAddVisitor(TEST_DATE, "s1");
    expect(await analyticsAddVisitor(TEST_DATE, "s1")).toBe(false);
  });

  it("getVisitorCount matches SADD size", async () => {
    await analyticsAddVisitor(TEST_DATE, "s1");
    await analyticsAddVisitor(TEST_DATE, "s2");
    await analyticsAddVisitor(TEST_DATE, "s3");
    expect(await analyticsGetVisitorCount(TEST_DATE)).toBe(3);
  });

  it("getVisitorCount returns 0 for unknown date", async () => {
    expect(await analyticsGetVisitorCount("1999-01-01")).toBe(0);
  });

  it("addVisitor sets a TTL on the key", async () => {
    await analyticsAddVisitor(TEST_DATE, "s1");
    const ttl = await redis.ttl(`visitors:${TEST_DATE}`);
    expect(Number(ttl)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Write `geo.test.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/test/geo.test.ts`:

```ts
import { describe, it, expect, afterEach } from "bun:test";
import { analyticsResolveGeoLocation } from "@api-next/core";

type FetchSignature = typeof globalThis.fetch;
const realFetch: FetchSignature = globalThis.fetch;

function mockFetchWith(resolver: () => Response | Promise<Response>) {
  globalThis.fetch = (async () => resolver()) as unknown as FetchSignature;
}

function restoreFetch() {
  globalThis.fetch = realFetch;
}

describe("resolveGeoLocation", () => {
  afterEach(() => {
    restoreFetch();
  });

  it("returns null for 127.0.0.1 without fetching", async () => {
    let called = false;
    mockFetchWith(() => {
      called = true;
      return new Response("[]", { status: 200 });
    });
    const result = await analyticsResolveGeoLocation("127.0.0.1");
    expect(result).toBeNull();
    expect(called).toBe(false);
  });

  it("returns null for 192.168.x.x", async () => {
    expect(await analyticsResolveGeoLocation("192.168.1.5")).toBeNull();
  });

  it("returns null for 10.x.x.x", async () => {
    expect(await analyticsResolveGeoLocation("10.0.0.1")).toBeNull();
  });

  it("returns parsed location on success", async () => {
    mockFetchWith(() =>
      new Response(
        JSON.stringify({
          status: "success",
          lat: 37.5,
          lon: 127.0,
          country: "South Korea",
          city: "Seoul",
        }),
        { status: 200 },
      ),
    );
    const result = await analyticsResolveGeoLocation("8.8.8.8");
    expect(result).toEqual({
      latitude: 37.5,
      longitude: 127.0,
      country: "South Korea",
      city: "Seoul",
    });
  });

  it("returns null on status=fail", async () => {
    mockFetchWith(() =>
      new Response(JSON.stringify({ status: "fail", message: "invalid query" }), { status: 200 }),
    );
    expect(await analyticsResolveGeoLocation("8.8.8.8")).toBeNull();
  });

  it("returns null on HTTP error", async () => {
    mockFetchWith(() => new Response("server down", { status: 503 }));
    expect(await analyticsResolveGeoLocation("8.8.8.8")).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as unknown as FetchSignature;
    expect(await analyticsResolveGeoLocation("8.8.8.8")).toBeNull();
  });
});
```

- [ ] **Step 3: Write `visitorStats.test.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/test/visitorStats.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import {
  analyticsGetVisitorSummary,
  analyticsVisitorStatsAggregate,
  analyticsAddVisitor,
  analyticsSaveDailyVisitorStats,
  db,
  schema,
} from "@api-next/core";
import { resetDb, resetRedis } from "@api-next/core/test-helpers";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function seedPageView(opts: {
  path?: string;
  sessionId: string;
  createdAt?: string;
}) {
  const now = opts.createdAt ?? new Date().toISOString();
  await db.insert(schema.page_views).values({
    path: opts.path ?? "/",
    ip_address: "1.2.3.4",
    user_agent: null,
    referrer: null,
    session_id: opts.sessionId,
    latitude: null,
    longitude: null,
    country: null,
    city: null,
    created_at: now,
  });
}

describe("visitor stats service", () => {
  beforeEach(async () => {
    await resetDb();
    await resetRedis();
  });

  afterAll(async () => {
    await resetRedis();
  });

  it("empty state returns zeros", async () => {
    const summary = await analyticsGetVisitorSummary();
    expect(summary).toEqual({ total: 0, today: 0, yesterday: 0 });
  });

  it("today count comes from Redis when set", async () => {
    const todayStr = isoDate(new Date());
    await analyticsAddVisitor(todayStr, "s1");
    await analyticsAddVisitor(todayStr, "s2");
    const summary = await analyticsGetVisitorSummary();
    expect(summary.today).toBe(2);
  });

  it("today count falls back to raw page_views count when Redis empty and DB empty", async () => {
    await seedPageView({ sessionId: "s1" });
    await seedPageView({ sessionId: "s2" });
    await seedPageView({ sessionId: "s1" }); // duplicate session — distinct count = 2
    const summary = await analyticsGetVisitorSummary();
    expect(summary.today).toBe(2);
  });

  it("historical total includes daily_visitor_stats rows", async () => {
    await analyticsSaveDailyVisitorStats("2026-04-10", 5);
    await analyticsSaveDailyVisitorStats("2026-04-11", 7);
    const summary = await analyticsGetVisitorSummary();
    expect(summary.total).toBe(12);
  });
});

describe("visitorStatsAggregate", () => {
  beforeEach(async () => {
    await resetDb();
    await resetRedis();
  });

  it("writes yesterday's distinct session count to daily_visitor_stats", async () => {
    const yesterday = new Date(Date.now() - 86400_000).toISOString();
    await seedPageView({ sessionId: "s1", createdAt: yesterday });
    await seedPageView({ sessionId: "s2", createdAt: yesterday });
    await seedPageView({ sessionId: "s1", createdAt: yesterday });
    await analyticsVisitorStatsAggregate();
    // Verify via the same reader function
    const { count } = await (await import("@api-next/core")).analyticsGetVisitorSummary();
    // The summary "total" includes this saved row; simpler: query daily_visitor_stats directly
    const rows = await db.select().from(schema.daily_visitor_stats);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.visitor_count).toBe(2);
    expect(count).toBeDefined(); // appease the import
  });

  it("is idempotent (second run overwrites with same value)", async () => {
    const yesterday = new Date(Date.now() - 86400_000).toISOString();
    await seedPageView({ sessionId: "s1", createdAt: yesterday });
    await analyticsVisitorStatsAggregate();
    await analyticsVisitorStatsAggregate();
    const rows = await db.select().from(schema.daily_visitor_stats);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.visitor_count).toBe(1);
  });
});
```

Note: the test uses `schema.daily_visitor_stats` — drizzle schema key is `daily_visitor_stats` (snake_case from introspect). Verify this matches `packages/core/src/db/schema.ts` before running; adjust the identifier if introspect used a different key.

- [ ] **Step 4: Run all core tests**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bun test 2>&1 | tail -30
```
Expected: all tests pass (env 3, errors 3, comments 6, visitorCounter 5, geo 7, visitorStats ~5 = ~29 total).

Troubleshooting:
- Redis connection errors: check `docker compose ps redis` and `REDIS_URL` in local `.env`
- `daily_visitor_stats` ON CONFLICT fails: the table may lack the unique constraint (see Task 4 Step 1)
- Test isolation issues: confirm `beforeEach` calls both `resetDb()` and `resetRedis()` where needed

- [ ] **Step 5: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/test/visitorCounter.test.ts apps/api-next/packages/core/test/geo.test.ts apps/api-next/packages/core/test/visitorStats.test.ts
git commit -m "test(api): add unit tests for analytics writes

visitorCounter: SADD/SCARD/TTL semantics against real local Redis.
geo: inline fetch mock for private-ip/success/fail/error/timeout.
visitorStats: fallback chain (Redis → DB → raw) and aggregate
idempotency against real DB + Redis."
```

---

## Task 11: Public blog analytics route + failing integration test

**Files:**
- Create: `apps/api-next/apps/blog/test/analytics-track.test.ts`

- [ ] **Step 1: Write the failing test**

Write `~/github/new-blog/apps/api-next/apps/blog/test/analytics-track.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { createApp } from "../src/app";
import { db, schema } from "@api-next/core";
import { resetDb, resetRedis } from "@api-next/core/test-helpers";

async function countPageViews(): Promise<number> {
  const rows = (await db.execute(
    (await import("drizzle-orm")).sql`SELECT COUNT(*)::int AS n FROM page_views`,
  )) as unknown as { n: number }[];
  return Number(rows[0]?.n ?? 0);
}

async function getSession(sessionId: string) {
  const rows = (await db.execute(
    (await import("drizzle-orm")).sql`
      SELECT session_id, ip_address, page_view_count
      FROM visitor_sessions
      WHERE session_id = ${sessionId}
    `,
  )) as unknown as { session_id: string; ip_address: string; page_view_count: number }[];
  return rows[0] ?? null;
}

// Wait for the fire-and-forget promise chain to finish.
async function flush() {
  await new Promise((r) => setTimeout(r, 50));
}

describe("POST /analytics/page-view", () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
    await resetRedis();
  });

  afterAll(async () => {
    await resetRedis();
  });

  it("with sessionId: inserts row, upserts session, updates Redis", async () => {
    const res = await app.request("/analytics/page-view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: "/articles/1",
        ipAddress: "127.0.0.1",
        userAgent: "bun-test",
        referrer: null,
        sessionId: "s-abc",
      }),
    });
    expect(res.status).toBe(204);
    await flush();
    expect(await countPageViews()).toBe(1);
    const session = await getSession("s-abc");
    expect(session?.page_view_count).toBe(1);
  });

  it("without sessionId: inserts row, does not touch session/Redis", async () => {
    const res = await app.request("/analytics/page-view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: "/articles/1",
        ipAddress: "127.0.0.1",
      }),
    });
    expect(res.status).toBe(204);
    await flush();
    expect(await countPageViews()).toBe(1);
    expect(await getSession("s-nobody")).toBeNull();
  });

  it("repeated POST with same sessionId increments page_view_count", async () => {
    const body = JSON.stringify({
      path: "/articles/1",
      ipAddress: "127.0.0.1",
      sessionId: "s-repeat",
    });
    await app.request("/analytics/page-view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    await flush();
    await app.request("/analytics/page-view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    await flush();
    const session = await getSession("s-repeat");
    expect(session?.page_view_count).toBe(2);
  });

  it("rejects invalid body (missing path) with 400", async () => {
    const res = await app.request("/analytics/page-view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ipAddress: "127.0.0.1" }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run and confirm red**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/apps/blog
bun test test/analytics-track.test.ts 2>&1 | tail -15
```
Expected: tests fail (route doesn't exist). 400 case may pass coincidentally.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/blog/test/analytics-track.test.ts
git commit -m "test(api): add failing POST /analytics/page-view integration tests"
```

---

## Task 12: Implement the public analytics route

**Files:**
- Create: `apps/api-next/apps/blog/src/routes/analytics.ts`
- Modify: `apps/api-next/apps/blog/src/app.ts`

- [ ] **Step 1: Write `routes/analytics.ts`**

Write `~/github/new-blog/apps/api-next/apps/blog/src/routes/analytics.ts`:

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { PageViewRequestSchema, analyticsRecordPageView } from "@api-next/core";

type ZodIssueLike = { path: PropertyKey[]; message: string };
type ZodErrorLike = { issues: ZodIssueLike[] };

function validationErrorMessage(error: ZodErrorLike): string {
  const first = error.issues[0];
  if (!first) return "Invalid request body";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}

export const analyticsTrackRoute = new Hono();

analyticsTrackRoute.post(
  "/page-view",
  zValidator("json", PageViewRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const body = c.req.valid("json");
    // Fire-and-forget: do not await the recording. The user gets 204 immediately.
    analyticsRecordPageView(body).catch((err) =>
      console.warn("[analytics] page view recording failed", err),
    );
    return c.body(null, 204);
  },
);
```

- [ ] **Step 2: Mount in blog `app.ts`**

Read `~/github/new-blog/apps/api-next/apps/blog/src/app.ts`. Add the import:

```ts
import { analyticsTrackRoute } from "./routes/analytics";
```

Inside `createApp()`, after `app.route("/articles", articlesRoute);` (or equivalent position after existing mounts), add:

```ts
app.route("/analytics", analyticsTrackRoute);
```

- [ ] **Step 3: Run blog tests**

```bash
cd ~/github/new-blog/apps/api-next/apps/blog
bun test 2>&1 | tail -25
```
Expected: all blog tests pass, including the 4 new `POST /analytics/page-view` cases.

Troubleshooting:
- 204 vs 200: confirm `c.body(null, 204)`
- Session count wrong: check the fire-and-forget chain actually completes (the `flush()` helper in the test waits 50ms — may need to be longer under load; try 100ms if flaky)
- Session not upserted: verify `input.sessionId` check in service before calling `upsertSession`
- geo timeout blocks: confirm `AbortSignal.timeout(3000)` is used so the test doesn't hang

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/blog/src/routes/analytics.ts apps/api-next/apps/blog/src/app.ts
git commit -m "feat(api): add public POST /analytics/page-view route

Fire-and-forget page view recording. Handler returns 204 immediately
while analyticsRecordPageView runs in the background with .catch logging."
```

---

## Task 13: Register scheduler in admin index.ts

**Files:**
- Modify: `apps/api-next/apps/admin/src/index.ts`

- [ ] **Step 1: Add Cron registration**

Read `~/github/new-blog/apps/api-next/apps/admin/src/index.ts`. Currently exports the Bun server config. Modify it so the cron registers on import (module-level side effect). The file should look like:

```ts
import { Cron } from "croner";
import { createApp } from "./app";
import { env, analyticsVisitorStatsAggregate } from "@api-next/core";

const app = createApp();

// Nightly visitor stats aggregation. Mirrors Kotlin @Scheduled(cron = "0 5 3 * * *").
// Croner is 5-field standard cron, no seconds. Timezone matches legacy JVM.
new Cron("5 3 * * *", { timezone: "Asia/Seoul" }, async () => {
  try {
    await analyticsVisitorStatsAggregate();
    console.info("[scheduler] visitor stats aggregate ok");
  } catch (err) {
    console.error("[scheduler] visitor stats aggregate failed", err);
  }
});
console.info("[scheduler] visitor stats aggregate cron registered (5 3 * * * Asia/Seoul)");

export default {
  fetch: app.fetch,
  port: env.ADMIN_PORT,
};
```

- [ ] **Step 2: Smoke-test the scheduler registration**

Start the admin server briefly and confirm the log appears:

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/apps/admin
export $(grep -v '^#' ../../.env | xargs)
export ADMIN_PORT=9081
bun run src/index.ts > /tmp/admin-g2.log 2>&1 &
ADMIN_PID=$!
sleep 1
grep '\[scheduler\]' /tmp/admin-g2.log
kill $ADMIN_PID 2>/dev/null
wait 2>/dev/null
```
Expected: `[scheduler] visitor stats aggregate cron registered (5 3 * * * Asia/Seoul)` in the log.

- [ ] **Step 3: Run admin tests**

```bash
cd ~/github/new-blog/apps/api-next/apps/admin
bun test 2>&1 | tail -15
```
Expected: all existing admin tests still pass. Loading `src/index.ts` via tests would register the cron, but tests import `src/app` directly, not `src/index`, so the cron is not registered during test runs.

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/src/index.ts
git commit -m "feat(api): register visitor stats aggregator cron on admin startup

Runs analyticsVisitorStatsAggregate daily at 03:05 KST via croner.
Matches Kotlin @Scheduled(cron='0 5 3 * * *') behavior. Errors are
logged and swallowed so one bad run doesn't kill the scheduler."
```

---

## Task 14: Monorepo verification + smoke test

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
- `@api-next/core`: ~29 (env 3 + errors 3 + comments 6 + visitorCounter 5 + geo 7 + visitorStats ~5)
- `api-blog-next`: ~30 (existing 26 + 4 analytics track)
- `api-admin-next`: 80 (unchanged)
- `admin` Next.js: 15

- [ ] **Step 3: Manual smoke test — page view round trip**

Start the blog server:
```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/apps/blog
export $(grep -v '^#' ../../.env | xargs)
export BLOG_PORT=9080
bun run src/index.ts > /tmp/blog-g2.log 2>&1 &
BLOG_PID=$!
sleep 1

# Fire a page view with sessionId
curl -s -X POST -H "content-type: application/json" \
  -d '{"path":"/articles/1","ipAddress":"127.0.0.1","userAgent":"smoke","sessionId":"s-smoke"}' \
  -w "\nstatus: %{http_code}\n" \
  http://localhost:9080/analytics/page-view
sleep 1

# Verify the row is there
echo "--- page_views row ---"
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "SELECT path, ip_address, session_id FROM page_views"
echo "--- visitor_sessions row ---"
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "SELECT session_id, page_view_count FROM visitor_sessions"
echo "--- Redis ---"
docker exec api-next-dev-redis redis-cli SMEMBERS "visitors:$(date +%F)"

kill $BLOG_PID 2>/dev/null
wait 2>/dev/null

# Cleanup
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "TRUNCATE page_views, visitor_sessions RESTART IDENTITY"
docker exec api-next-dev-redis redis-cli DEL "visitors:$(date +%F)"
```

Expected:
- `status: 204`
- `page_views` row: `/articles/1 | 127.0.0.1 | s-smoke`
- `visitor_sessions` row: `s-smoke | 1`
- Redis: `"s-smoke"` in the set

- [ ] **Step 4: Direct scheduler function test**

Run the aggregator directly to verify it writes:

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/apps/admin
export $(grep -v '^#' ../../.env | xargs)

# Seed a yesterday page view
YEST=$(date -u -d 'yesterday' +%Y-%m-%dT12:00:00.000Z 2>/dev/null || date -u -v-1d +%Y-%m-%dT12:00:00.000Z)
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "
INSERT INTO page_views (path, ip_address, session_id, created_at)
VALUES ('/articles/1', '1.1.1.1', 'yday1', '$YEST'),
       ('/articles/1', '1.1.1.1', 'yday2', '$YEST');
"

bun -e '
import { analyticsVisitorStatsAggregate } from "@api-next/core";
await analyticsVisitorStatsAggregate();
console.log("aggregate ok");
'

docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "SELECT date, visitor_count FROM daily_visitor_stats"

# Cleanup
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "TRUNCATE page_views, daily_visitor_stats RESTART IDENTITY"
```

Expected: `daily_visitor_stats` has a row for yesterday's date with `visitor_count = 2`.

No commit.

---

## Plan G2 Completion Checklist

- [ ] Docker compose Redis service running; `REDIS_URL` env var added (Task 1)
- [ ] `croner` installed in api-admin-next (Task 2)
- [ ] Analytics types extended with `GeoLocation`, `VisitorSummary`, `PageViewInput`, `PageViewRequestSchema` (Task 3)
- [ ] Repo has `savePageView`, `upsertSession`, `saveDailyVisitorStats` (Task 4)
- [ ] `geo.ts` with `resolveGeoLocation` (Task 5)
- [ ] `visitorCounter.ts` with `addVisitor`, `getVisitorCount` against Bun.redis (Task 6)
- [ ] Service has `recordPageView`, `getVisitorSummary`, `visitorStatsAggregate` (Task 7)
- [ ] `test-helpers/index.ts` exports `resetRedis` (Task 8)
- [ ] Analytics + core barrels export all new functions (Task 9)
- [ ] 3 core unit test files pass (Task 10)
- [ ] `apps/blog/src/routes/analytics.ts` mounted at `/analytics`; 4 integration tests pass (Tasks 11, 12)
- [ ] Admin `src/index.ts` registers the cron job; smoke log confirms registration (Task 13)
- [ ] `bunx turbo run lint` 5/5 (Task 14)
- [ ] `bun run test` 4/4 (Task 14)
- [ ] Manual smoke: POST /analytics/page-view round trip lands in DB + Redis (Task 14)
- [ ] Direct `visitorStatsAggregate()` call writes to `daily_visitor_stats` (Task 14)

## Out of Scope

- `findTopArticleStats` / `article_stats` / `daily_article_stats` writes — still dead code, not ported
- GitHub auth token for comments — Plan H non-goal stands
- `@api-next/core/middleware` extraction — still deferred
- `hono-pino` migration — still deferred
- Cron job testing infrastructure — the function is unit-tested, cron timing isn't
