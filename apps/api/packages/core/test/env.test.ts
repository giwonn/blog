import { describe, it, expect } from "bun:test";
import { loadEnv } from "../src/env";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
};

describe("loadEnv", () => {
  it("parses a valid env and applies defaults", () => {
    const env = loadEnv(base as NodeJS.ProcessEnv);
    expect(env.DATABASE_URL).toBe(base.DATABASE_URL);
    expect(env.NODE_ENV).toBe("development");
    expect(env.BLOG_PORT).toBe(8080);
    expect(env.ADMIN_PORT).toBe(8081);
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() => loadEnv({} as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });
});
