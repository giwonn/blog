import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import path from "node:path";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { SignJWT } from "jose";
import { resetEnvCache } from "@api-next/core/env";

const TEST_STORAGE = path.join(process.cwd(), "storage-images-test");
process.env.IMAGE_STORAGE_PATH = TEST_STORAGE;
process.env.IMAGE_PUBLIC_URL = "http://localhost:8081/images";
resetEnvCache();

const { createApp } = await import("../src/app");
const { env } = await import("@api-next/core");

const app = createApp();

async function makeToken() {
  const secret = new TextEncoder().encode(env.ADMIN_JWT_SECRET);
  return await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(env.ADMIN_GOOGLE_SUB[0]!)
    .setExpirationTime("1h")
    .sign(secret);
}

function pngBytes(size = 16): Uint8Array {
  // Minimal valid-ish PNG header + filler. Content check is by header only.
  const header = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const out = new Uint8Array(Math.max(size, header.length));
  out.set(header, 0);
  return out;
}

describe("POST /admin/images", () => {
  let token: string;

  beforeAll(async () => {
    token = await makeToken();
  });

  beforeEach(async () => {
    await rm(TEST_STORAGE, { recursive: true, force: true });
  });

  afterAll(async () => {
    await rm(TEST_STORAGE, { recursive: true, force: true });
  });

  it("accepts a valid PNG", async () => {
    const fd = new FormData();
    fd.append("file", new Blob([pngBytes(32)], { type: "image/png" }), "test.png");
    const res = await app.request("/admin/images", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: fd,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { url: string } };
    expect(body.data.url.startsWith("http://localhost:8081/images/temp/")).toBe(true);
    expect(body.data.url.endsWith(".png")).toBe(true);
  });

  it("accepts a valid JPEG and uses .jpg extension", async () => {
    const fd = new FormData();
    fd.append("file", new Blob([pngBytes(32)], { type: "image/jpeg" }), "test.jpg");
    const res = await app.request("/admin/images", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: fd,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { url: string } };
    expect(body.data.url.endsWith(".jpg")).toBe(true);
  });

  it("rejects non-image content type", async () => {
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array([1, 2, 3])], { type: "text/plain" }), "x.txt");
    const res = await app.request("/admin/images", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: fd,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("지원하지 않는 이미지 형식입니다");
  });

  it("rejects oversized file", async () => {
    const big = new Uint8Array(11 * 1024 * 1024);
    const fd = new FormData();
    fd.append("file", new Blob([big], { type: "image/png" }), "big.png");
    const res = await app.request("/admin/images", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: fd,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("이미지 크기가 10MB를 초과합니다");
  });

  it("rejects missing file field", async () => {
    const fd = new FormData();
    const res = await app.request("/admin/images", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: fd,
    });
    expect(res.status).toBe(400);
  });

  it("requires a valid JWT", async () => {
    const fd = new FormData();
    fd.append("file", new Blob([pngBytes(32)], { type: "image/png" }), "test.png");
    const res = await app.request("/admin/images", { method: "POST", body: fd });
    expect(res.status).toBe(401);
  });
});

describe("GET /images/* (admin static serving)", () => {
  beforeEach(async () => {
    await rm(TEST_STORAGE, { recursive: true, force: true });
    await mkdir(TEST_STORAGE, { recursive: true });
  });

  afterAll(async () => {
    await rm(TEST_STORAGE, { recursive: true, force: true });
  });

  it("serves an existing file", async () => {
    await writeFile(path.join(TEST_STORAGE, "a.png"), pngBytes(32));
    const res = await app.request("/images/a.png");
    expect(res.status).toBe(200);
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf.length).toBe(32);
    expect(buf[0]).toBe(0x89);
  });

  it("returns 404 for missing file", async () => {
    const res = await app.request("/images/nope.png");
    expect(res.status).toBe(404);
  });

  it("blocks path traversal", async () => {
    const res = await app.request("/images/../secret");
    expect(res.status).toBe(404);
  });
});
