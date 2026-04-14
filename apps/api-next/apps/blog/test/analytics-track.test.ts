import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { createApp } from "../src/app";
import { db, schema, sql } from "@api-next/core";
import { resetDb, resetRedis } from "@api-next/core/test-helpers";

async function countPageViews(): Promise<number> {
  const rows = (await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM page_views`,
  )) as unknown as { n: number }[];
  return Number(rows[0]?.n ?? 0);
}

async function getSession(sessionId: string) {
  const rows = (await db.execute(
    sql`
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
