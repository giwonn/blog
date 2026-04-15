import { describe, it, expect } from "bun:test";
import { createApp } from "../src/app";

describe("admin GET /health", () => {
  const app = createApp();

  it("returns 200 with envelope", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { status: "ok" } });
  });
});
