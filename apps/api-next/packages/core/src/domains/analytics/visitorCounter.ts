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
