import { describe, it, expect } from "bun:test";
import { loadEnv } from "../src/env";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  ADMIN_JWT_SECRET: "x".repeat(32),
  ADMIN_GOOGLE_SUB: "google-sub-1,google-sub-2",
};

describe("loadEnv", () => {
  it("parses a valid env and applies defaults", () => {
    const env = loadEnv(base as NodeJS.ProcessEnv);
    expect(env.DATABASE_URL).toBe(base.DATABASE_URL);
    expect(env.ADMIN_GOOGLE_SUB).toEqual(["google-sub-1", "google-sub-2"]);
    expect(env.NODE_ENV).toBe("development");
    expect(env.BLOG_PORT).toBe(8080);
    expect(env.ADMIN_PORT).toBe(8081);
  });

  it("rejects a short ADMIN_JWT_SECRET", () => {
    expect(() =>
      loadEnv({ ...base, ADMIN_JWT_SECRET: "short" } as NodeJS.ProcessEnv),
    ).toThrow(/ADMIN_JWT_SECRET/);
  });

  it("rejects a missing DATABASE_URL", () => {
    const { DATABASE_URL: _, ...rest } = base;
    expect(() => loadEnv(rest as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });
});
