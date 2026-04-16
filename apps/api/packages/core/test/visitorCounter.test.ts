import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { redis } from "bun";
import {
  analyticsAddVisitor,
  analyticsGetVisitorCount,
} from "@api/core";
import { resetRedis } from "@api/core/test-helpers";

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
