import { describe, it, expect, beforeAll } from "bun:test";
import { SignJWT } from "jose";
import { createApp } from "../src/app";
import { env } from "@api-next/core";

const secret = new TextEncoder().encode(env.ADMIN_JWT_SECRET);

async function mintValidToken() {
  return await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(env.ADMIN_GOOGLE_SUB[0]!)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
    .sign(secret);
}

describe("admin GET /health", () => {
  const app = createApp();
  let token: string;

  beforeAll(async () => {
    token = await mintValidToken();
  });

  it("returns 200 with envelope when the JWT is valid", async () => {
    const res = await app.request("/health", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { status: "ok" } });
  });

  it("returns 200 without a JWT (health is public)", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { status: "ok" } });
  });
});
