import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { SignJWT } from "jose";
import { jwtAuth } from "../src/middleware/jwtAuth";
import { env } from "@api-next/core";

const secret = new TextEncoder().encode(env.ADMIN_JWT_SECRET);

async function mintToken(opts: {
  sub: string;
  expSecondsFromNow?: number;
  secretOverride?: Uint8Array;
}) {
  return await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(opts.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + (opts.expSecondsFromNow ?? 300))
    .sign(opts.secretOverride ?? secret);
}

function buildTestApp() {
  const app = new Hono();
  app.use("*", jwtAuth);
  app.get("/ping", (c) => c.json({ data: { sub: c.get("userSub") } }));
  return app;
}

describe("jwtAuth middleware", () => {
  let validToken: string;
  const allowedSub = env.ADMIN_GOOGLE_SUB[0]!;

  beforeAll(async () => {
    validToken = await mintToken({ sub: allowedSub });
  });

  it("allows a valid token whose sub is in the allowlist", async () => {
    const app = buildTestApp();
    const res = await app.request("/ping", {
      headers: { authorization: `Bearer ${validToken}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { sub: allowedSub } });
  });

  it("rejects a missing Authorization header", async () => {
    const app = buildTestApp();
    const res = await app.request("/ping");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ message: "Unauthorized" });
  });

  it("rejects a token signed with the wrong secret", async () => {
    const wrongSecret = new TextEncoder().encode("w".repeat(32));
    const bad = await mintToken({ sub: allowedSub, secretOverride: wrongSecret });
    const app = buildTestApp();
    const res = await app.request("/ping", {
      headers: { authorization: `Bearer ${bad}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a valid signature with a sub not in the allowlist", async () => {
    const bad = await mintToken({ sub: "not-you" });
    const app = buildTestApp();
    const res = await app.request("/ping", {
      headers: { authorization: `Bearer ${bad}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects an expired token", async () => {
    const bad = await mintToken({ sub: allowedSub, expSecondsFromNow: -10 });
    const app = buildTestApp();
    const res = await app.request("/ping", {
      headers: { authorization: `Bearer ${bad}` },
    });
    expect(res.status).toBe(401);
  });
});
