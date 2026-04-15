import { describe, it, expect, beforeEach } from "bun:test";
import { createApp } from "../src/app";
import { resetDb } from "@api-next/core/test-helpers";

function jsonHeaders(): Record<string, string> {
  return { "content-type": "application/json" };
}

type SettingsBody = {
  data: {
    blog: { name: string; description: string; profileImage: string | null };
    analytics: { trackingEnabled: boolean };
  };
};

describe("admin settings endpoints", () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
  });

  it("GET /admin/settings returns defaults when no row exists", async () => {
    const res = await app.request("/admin/settings");
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
      headers: jsonHeaders(),
      body: JSON.stringify({
        name: "Giwon's Blog",
        description: "dev notes",
        profileImage: "https://example.com/me.jpg",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SettingsBody;
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
      headers: jsonHeaders(),
      body: JSON.stringify({ trackingEnabled: false }),
    });
    expect(analyticsRes.status).toBe(200);

    // Then, update blog. Analytics must survive.
    const blogRes = await app.request("/admin/settings/blog", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ name: "N", description: "D", profileImage: null }),
    });
    expect(blogRes.status).toBe(200);
    const body = (await blogRes.json()) as SettingsBody;
    expect(body.data.blog).toEqual({ name: "N", description: "D", profileImage: null });
    expect(body.data.analytics).toEqual({ trackingEnabled: false });
  });

  it("PUT /admin/settings/blog rejects a malformed body with 400", async () => {
    const res = await app.request("/admin/settings/blog", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ name: 123 }), // wrong type for name
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body).toHaveProperty("message");
    expect(typeof body.message).toBe("string");
  });

  it("PUT /admin/settings/analytics updates only analytics", async () => {
    const res = await app.request("/admin/settings/analytics", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ trackingEnabled: false }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SettingsBody;
    expect(body.data.analytics).toEqual({ trackingEnabled: false });
    expect(body.data.blog).toEqual({ name: "Blog", description: "", profileImage: null });
  });

});

