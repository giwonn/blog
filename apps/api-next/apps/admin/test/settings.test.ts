import { describe, it, expect, beforeEach, beforeAll } from "bun:test";
import { SignJWT } from "jose";
import { createApp } from "../src/app";
import { env } from "@api-next/core";
import { resetDb } from "@api-next/core/test-helpers";

const secret = new TextEncoder().encode(env.ADMIN_JWT_SECRET);

async function mintValidToken() {
  return await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(env.ADMIN_GOOGLE_SUB[0]!)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
    .sign(secret);
}

function authHeaders(token: string): HeadersInit {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

describe("admin settings endpoints", () => {
  const app = createApp();
  let token: string;

  beforeAll(async () => {
    token = await mintValidToken();
  });

  beforeEach(async () => {
    await resetDb();
  });

  it("GET /admin/settings returns defaults when no row exists", async () => {
    const res = await app.request("/admin/settings", { headers: authHeaders(token) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: {
        blog: { name: "Blog", description: "", profileImage: null },
        analytics: { trackingEnabled: true },
      },
    });
  });

  it("PUT /admin/settings/blog stores and returns the updated config", async () => {
    const res = await app.request("/admin/settings/blog", {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({
        name: "Giwon's Blog",
        description: "dev notes",
        profileImage: "https://example.com/me.jpg",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.blog).toEqual({
      name: "Giwon's Blog",
      description: "dev notes",
      profileImage: "https://example.com/me.jpg",
    });
    expect(body.data.analytics).toEqual({ trackingEnabled: true });
  });

  it("PUT /admin/settings/blog preserves a previously-updated analytics config", async () => {
    // First, update analytics to a non-default value.
    const analyticsRes = await app.request("/admin/settings/analytics", {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ trackingEnabled: false }),
    });
    expect(analyticsRes.status).toBe(200);

    // Then, update blog. Analytics must survive.
    const blogRes = await app.request("/admin/settings/blog", {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ name: "N", description: "D", profileImage: null }),
    });
    expect(blogRes.status).toBe(200);
    const body = await blogRes.json();
    expect(body.data.blog).toEqual({ name: "N", description: "D", profileImage: null });
    expect(body.data.analytics).toEqual({ trackingEnabled: false });
  });

  it("PUT /admin/settings/blog rejects a malformed body with 400", async () => {
    const res = await app.request("/admin/settings/blog", {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ name: 123 }), // wrong type for name
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("message");
    expect(typeof body.message).toBe("string");
  });

  it("PUT /admin/settings/analytics updates only analytics", async () => {
    const res = await app.request("/admin/settings/analytics", {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ trackingEnabled: false }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.analytics).toEqual({ trackingEnabled: false });
    expect(body.data.blog).toEqual({ name: "Blog", description: "", profileImage: null });
  });

  it("all three endpoints return 401 without a JWT", async () => {
    const g = await app.request("/admin/settings");
    expect(g.status).toBe(401);
    const pb = await app.request("/admin/settings/blog", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X", description: "", profileImage: null }),
    });
    expect(pb.status).toBe(401);
    const pa = await app.request("/admin/settings/analytics", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trackingEnabled: true }),
    });
    expect(pa.status).toBe(401);
  });
});
