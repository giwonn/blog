import { sql } from "drizzle-orm";
import { redis } from "bun";
import { db } from "../db/client";

// App-owned tables only. `flyway_schema_history` is deliberately excluded —
// it is managed by the legacy JPA app's Flyway migrations and resetting it
// would break any dev loop that relies on Flyway tracking.
const APP_TABLES = [
  "settings",
  "articles",
  "series",
  "books",
  "visitor_sessions",
  "page_views",
  "daily_visitor_stats",
  "batch_job_log",
] as const;

/**
 * Truncates all app-owned tables and resets identity sequences.
 * Intended for `beforeEach` in integration tests that share the local dev DB.
 *
 * Uses a single TRUNCATE statement with CASCADE so foreign-key order doesn't
 * matter. Runs in a few milliseconds against an empty schema.
 */
export async function resetDb(): Promise<void> {
  await db.execute(
    sql.raw(`TRUNCATE ${APP_TABLES.join(", ")} RESTART IDENTITY CASCADE`),
  );
}

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
