import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import {
  analyticsGetVisitorSummary,
  analyticsVisitorStatsAggregate,
  analyticsAddVisitor,
  analyticsSaveDailyVisitorStats,
  db,
  schema,
} from "@api/core";
import { resetDb, resetRedis } from "@api/core/test-helpers";

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
    const summary = await (await import("@api/core")).analyticsGetVisitorSummary();
    // The summary "total" includes this saved row; simpler: query daily_visitor_stats directly
    const rows = await db.select().from(schema.daily_visitor_stats);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.visitor_count).toBe(2);
    expect(summary.total).toBeGreaterThanOrEqual(2); // appease the import
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
