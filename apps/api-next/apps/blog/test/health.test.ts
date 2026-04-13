import { describe, it, expect } from "bun:test";
import { createApp } from "../src/app";

describe("GET /health", () => {
  const app = createApp();

  it("returns 200 with the success envelope after querying the DB", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: { status: "ok" } });
  });

  it("does not leak stack traces on unknown routes", async () => {
    const res = await app.request("/does-not-exist");
    expect(res.status).toBe(404);
  });
});
