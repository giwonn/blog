# API Rewrite — Plan G2: Analytics Writes + Infra Design

**Date:** 2026-04-13
**Status:** Approved for planning
**Parent design:** `docs/superpowers/specs/2026-04-13-api-rewrite-design.md`
**Depends on:** Plan G (analytics reads) — shared `domains/analytics/` directory and repo functions

## Goal

Port the write path, Redis visitor counter, geo resolver, and nightly scheduler from Kotlin's analytics domain. Introduces the first Redis dependency to the rewrite. Provides the `VisitorStatsService.getVisitorSummary` function that Plan I (sidebar) consumes.

## Why This Is a Separate Plan from G

Originally Plan G was going to cover the full analytics port, but the scope was ~20 tasks mixing reads, writes, external HTTP, Redis, and a cron scheduler. Splitting at the read/write boundary keeps each plan focused:

- **Plan G** (done) — stateless drizzle queries against existing tables
- **Plan G2** (this plan) — write path, Redis, external geo, scheduler

During the rewrite period, production traffic still goes to Kotlin which owns all writes and runs the scheduler. Plan G2 is ready-to-use but not production-critical until cutover (Plan K).

## Endpoint Inventory

| Method | Path | App | Notes |
|---|---|---|---|
| POST | `/analytics/page-view` | blog | Public (no auth). Body: `{ path, ipAddress, userAgent?, referrer?, sessionId? }`. Fire-and-forget processing. Returns 204. |

## Architectural Decisions

### Redis — Native `Bun.redis`

Bun 1.3 ships a native Redis client (`Bun.redis`) that is Promise-based, auto-reconnecting, and ~8x faster than `ioredis`. No dependency to install. Auto-connects to the `REDIS_URL` env variable or falls back to `redis://localhost:6379`.

For Plan G2 we use it directly:

```ts
import { redis } from "bun";

await redis.sadd("visitors:2026-04-13", "session-abc");
await redis.expireat("visitors:2026-04-13", expireTimestamp);
const count = await redis.scard("visitors:2026-04-13");
```

No wrapper library, no connection pool code, no callbacks.

### Docker Compose — Dedicated Dev Redis

Extend `apps/api-next/docker-compose.yml` with a new service:

```yaml
services:
  postgres: # existing
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

Host port `6380` to avoid collision with any other Redis the dev machine might be running. The legacy Kotlin app has its own Redis (`giwon-blog-redis` on `6379`) — keeping them separate avoids dev environment cross-contamination.

### Env Variable

Add `REDIS_URL` to `env.ts`:

```ts
REDIS_URL: z.string().default("redis://localhost:6380"),
```

Plus update `.env.example` and `.env.test` with `REDIS_URL=redis://localhost:6380`.

### Cron Scheduler — `croner`

Bun doesn't have a built-in cron. Options considered:

- **`setInterval` + time check** — fragile, imprecise, hard to test
- **`node-cron`** — older, smaller community
- **`croner`** — ~15KB, cron syntax, TZ support, well-maintained, TypeScript native

**Chosen: `croner`.** Install in `api-admin-next` workspace (admin process owns the schedulers per Plan A's design).

Kotlin's `@Scheduled(cron = "0 5 3 * * *")` uses Spring's 6-field format (seconds, minutes, hours, day, month, dayOfWeek). Croner uses the standard 5-field format: `"5 3 * * *"` = 03:05 daily. With timezone option set to match the legacy JVM's configured TZ:

```ts
new Cron("5 3 * * *", { timezone: "Asia/Seoul" }, async () => { ... });
```

### Scheduler Location — Admin Process `index.ts`

The cron job is registered in `apps/api-next/apps/admin/src/index.ts` after the Hono app is created, before `Bun.serve` is called. This means the scheduler starts when the admin server starts, stops when the admin server stops, and has no effect on the blog process (which only handles user traffic).

```ts
import { Cron } from "croner";
import { visitorStatsAggregate } from "@api-next/core";

// ... existing imports, createApp, etc

new Cron("5 3 * * *", { timezone: "Asia/Seoul" }, async () => {
  try {
    await visitorStatsAggregate();
    console.info("[scheduler] visitor stats aggregate ok");
  } catch (err) {
    console.error("[scheduler] visitor stats aggregate failed", err);
  }
});
```

The `visitorStatsAggregate` function is exported from `@api-next/core` and is unit-testable in isolation. The cron registration itself is smoke-tested at startup only (console log verifies registration).

### Fire-and-Forget Recording

Kotlin uses `@Async` to schedule `recordPageView` on a thread pool. JS doesn't have the same primitive, but a floating promise with error catching is equivalent:

```ts
analyticsRoute.post("/page-view", zValidator("json", PageViewRequestSchema), async (c) => {
  const body = c.req.valid("json");
  analyticsRecordPageView(body).catch((err) =>
    console.warn("[analytics] page view recording failed", err),
  );
  return c.body(null, 204);
});
```

The handler returns 204 immediately. The fire-and-forget promise runs in the background with `.catch` logging any failure. Lost page views on transient errors are acceptable for analytics; we don't block the user.

### Geo Resolution — `ip-api.com` Fetch

Kotlin uses Spring `RestClient` against `http://ip-api.com/json/<ip>?fields=status,lat,lon,country,city`. Mirror it with `fetch`:

```ts
export async function resolveGeoLocation(ipAddress: string): Promise<GeoLocation | null> {
  // Private / loopback IPs have no geo data, don't hit the external service
  if (
    ipAddress === "127.0.0.1" ||
    ipAddress.startsWith("192.168.") ||
    ipAddress.startsWith("10.")
  ) {
    return null;
  }
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ipAddress}?fields=status,lat,lon,country,city`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status: string;
      lat?: number;
      lon?: number;
      country?: string;
      city?: string;
    };
    if (json.status !== "success") return null;
    return {
      latitude: json.lat!,
      longitude: json.lon!,
      country: json.country ?? null,
      city: json.city ?? null,
    };
  } catch {
    return null;
  }
}
```

3-second timeout via `AbortSignal.timeout` so a slow/hung ip-api doesn't block page view recording.

`GeoLocation` type lives in `domains/analytics/types.ts` (new type added by Plan G2).

### Writer Repo Functions

Extend `domains/analytics/repo.ts` with three new functions:

**`savePageView`**: single INSERT into `page_views` using drizzle's fluent builder. Accepts a `PageViewInput` with all the fields the table needs.

**`upsertSession`**: INSERT into `visitor_sessions` with ON CONFLICT DO UPDATE incrementing `page_view_count` and refreshing `last_visit_at`.

```ts
export async function upsertSession(sessionId: string, ipAddress: string, userAgent: string | null): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(sql`
    INSERT INTO visitor_sessions (session_id, ip_address, user_agent, first_visit_at, last_visit_at, page_view_count)
    VALUES (${sessionId}, ${ipAddress}, ${userAgent}, ${now}::timestamp, ${now}::timestamp, 1)
    ON CONFLICT (session_id) DO UPDATE SET
      last_visit_at = EXCLUDED.last_visit_at,
      page_view_count = visitor_sessions.page_view_count + 1
  `);
}
```

**`saveDailyVisitorStats`**: UPSERT into `daily_visitor_stats` for a single date.

```ts
export async function saveDailyVisitorStats(date: string, visitorCount: number): Promise<void> {
  await db.execute(sql`
    INSERT INTO daily_visitor_stats (date, visitor_count)
    VALUES (${date}::date, ${visitorCount})
    ON CONFLICT (date) DO UPDATE SET visitor_count = EXCLUDED.visitor_count
  `);
}
```

Note on `daily_visitor_stats` schema: confirm it has a unique constraint on `date` before writing the ON CONFLICT. If not, the upsert needs a different form — the implementer should verify via `docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "\d daily_visitor_stats"` during Task 4 and adjust.

### Visitor Counter Module

`packages/core/src/domains/analytics/visitorCounter.ts`:

```ts
import { redis } from "bun";

const TTL_DAYS = 2;

function keyFor(date: string): string {
  return `visitors:${date}`;
}

function expireTimestampFor(date: string): number {
  // Expire at midnight UTC `TTL_DAYS` days after the given date
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + TTL_DAYS);
  return Math.floor(d.getTime() / 1000);
}

/**
 * Adds a session id to the visitors set for the given date.
 * Returns true if the id was newly added, false if it was already present.
 */
export async function addVisitor(date: string, sessionId: string): Promise<boolean> {
  const key = keyFor(date);
  const added = await redis.sadd(key, sessionId);
  await redis.expireat(key, expireTimestampFor(date));
  return added > 0;
}

export async function getVisitorCount(date: string): Promise<number> {
  const count = await redis.scard(keyFor(date));
  return Number(count);
}
```

### Collection Service

`domains/analytics/service.ts` adds:

```ts
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
    const today = new Date().toISOString().slice(0, 10);
    await addVisitor(today, input.sessionId);
  }
}
```

### Visitor Stats Service

Same file, `getVisitorSummary` with the fallback chain:

```ts
export type VisitorSummary = {
  total: number;
  today: number;
  yesterday: number;
};

export async function getVisitorSummary(): Promise<VisitorSummary> {
  const now = new Date();
  const todayStr = isoDate(now);
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = isoDate(yesterday);

  const todayCount = await getVisitorCountWithFallback(todayStr);
  const yesterdayCount = await getVisitorCountWithFallback(yesterdayStr);
  // Total = sum of all past daily_visitor_stats rows + today's live count.
  // Mirrors the Kotlin logic: total is the aggregated historical + today-from-Redis.
  const historicalTotal = await repo.getTotalVisitorCount();
  return { total: historicalTotal + todayCount, today: todayCount, yesterday: yesterdayCount };
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

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
```

### Scheduler Function

Same file:

```ts
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

Unit-testable in isolation — tests seed page_views, call `visitorStatsAggregate()`, and assert the `daily_visitor_stats` row.

### Zod Schema for POST Body

```ts
export const PageViewRequestSchema = z.object({
  path: z.string().min(1),
  ipAddress: z.string().min(1),
  userAgent: z.string().nullable().optional(),
  referrer: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
});

export type PageViewInput = z.infer<typeof PageViewRequestSchema>;
```

In `types.ts` alongside the existing analytics types.

### `resetRedis` Test Helper

Plan B's `resetDb()` clears Postgres. Plan G2 adds `resetRedis()` for the Redis visitor counter state:

```ts
// packages/core/src/test-helpers/index.ts — append
import { redis } from "bun";

export async function resetRedis(): Promise<void> {
  const keys = await redis.keys("visitors:*");
  if (keys && keys.length > 0) {
    await redis.del(...keys);
  }
}
```

Tests that touch Redis call both `resetDb()` and `resetRedis()` in `beforeEach`.

### Route

`apps/api-next/apps/blog/src/routes/analytics.ts` (new file):

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { PageViewRequestSchema, analyticsRecordPageView } from "@api-next/core";

// ... same zValidator error hook pattern as other route files

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
    analyticsRecordPageView(body).catch((err) =>
      console.warn("[analytics] page view recording failed", err),
    );
    return c.body(null, 204);
  },
);
```

Mount in `apps/blog/src/app.ts`: `app.route("/analytics", analyticsTrackRoute);` (the public blog endpoint is exactly `POST /analytics/page-view`, matching Kotlin's `AnalyticsTrackController`).

### File Structure

```
apps/api-next/
├── docker-compose.yml                          # +redis service
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
        ├── domains/analytics/
        │   ├── types.ts                        # +PageViewInput, GeoLocation, VisitorSummary
        │   ├── repo.ts                         # +savePageView, upsertSession, saveDailyVisitorStats
        │   ├── geo.ts                          # NEW
        │   ├── visitorCounter.ts               # NEW
        │   ├── service.ts                      # +recordPageView, getVisitorSummary, visitorStatsAggregate
        │   └── index.ts                        # +all new exports
        ├── test-helpers/index.ts               # +resetRedis
        └── index.ts                            # +new analytics surface
    └── test/
        ├── visitorCounter.test.ts              # NEW unit test
        ├── geo.test.ts                         # NEW unit test
        └── visitorStats.test.ts                # NEW unit test
```

### Test Plan

**`packages/core/test/visitorCounter.test.ts`** — uses real local Redis (must be running):
- `addVisitor` new id returns true
- `addVisitor` existing id returns false
- `getVisitorCount` returns correct size
- Key expiration set correctly (check TTL)
- `resetRedis` clears all `visitors:*` keys

**`packages/core/test/geo.test.ts`** — mock `global.fetch`:
- Private IP `127.0.0.1` → null (no fetch call)
- Private IP `192.168.1.1` → null
- Private IP `10.0.0.1` → null
- External IP, `{ status: "success", lat, lon, country, city }` → object
- External IP, `{ status: "fail" }` → null
- fetch throws → null
- Timeout (mock AbortError) → null

**`packages/core/test/visitorStats.test.ts`** — uses real local DB + Redis:
- Empty state: `getVisitorSummary` returns `{ total: 0, today: 0, yesterday: 0 }`
- Redis has today → `today` comes from Redis
- Redis empty, DB has today → `today` comes from DB
- Redis empty, DB empty, page_views exist → `today` comes from raw count
- `visitorStatsAggregate()` writes yesterday's distinct session count to `daily_visitor_stats`
- `visitorStatsAggregate()` is idempotent (running twice doesn't double-count)

**`apps/blog/test/analytics-track.test.ts`** — integration with real DB + Redis:
- `POST /analytics/page-view` with full body → 204, `page_views` row present, session row upserted, Redis key has entry
- POST without sessionId → page_view inserted, no session touched, no Redis update
- POST with private IP → geo fields null (no external call)
- POST twice with same sessionId → single session row with `page_view_count = 2`
- POST with invalid body (missing `path`) → 400
- POST with valid body where geo service times out → page_view still saved, geo fields null (mock fetch to simulate)

**Note on test environment**: all tests assume `docker compose up -d postgres redis` has been run for `apps/api-next/docker-compose.yml`. The plan's Task 1 documents this.

## Plan G2 Deliverables

1. Docker compose extended with Redis; `bootstrap-dev-db.sh` updated if needed
2. `REDIS_URL` env var added
3. `croner` installed in `api-admin-next`
4. `domains/analytics/geo.ts` created with `resolveGeoLocation`
5. `domains/analytics/visitorCounter.ts` created with `addVisitor`/`getVisitorCount`
6. `domains/analytics/repo.ts` extended with `savePageView`, `upsertSession`, `saveDailyVisitorStats`
7. `domains/analytics/service.ts` extended with `recordPageView`, `getVisitorSummary`, `visitorStatsAggregate`
8. `domains/analytics/types.ts` extended with `PageViewRequestSchema`, `PageViewInput`, `GeoLocation`, `VisitorSummary`
9. `domains/analytics/index.ts` + core barrel updated
10. `test-helpers/index.ts` adds `resetRedis`
11. 3 core unit test files (visitorCounter, geo, visitorStats) — pass
12. `apps/blog/src/routes/analytics.ts` mounted at `/analytics`
13. `apps/blog/test/analytics-track.test.ts` integration tests pass
14. `apps/admin/src/index.ts` registers the cron job (smoke log on startup)
15. `bunx turbo run lint` 5/5 (0 errors)
16. `bun run test` 4/4
17. Manual smoke: `curl POST /analytics/page-view` on blog → row appears in page_views + Redis key set

## Plan G2 Non-Goals

- Changing any existing Plan B–H functionality
- `findTopArticleStats` / `article_stats` / `daily_article_stats` writes — still dead code
- GitHub auth token for comments (Plan H non-goal)
- `@api-next/core/middleware` extraction
- `hono-pino` migration
- Renaming Plan B settings exports
- Cron job registration unit test — the function itself is unit-tested; cron timing isn't
