import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resetEnvCache } from "@api-next/core/env";

const TEST_STORAGE = path.join(process.cwd(), "storage-images-serve-test");
process.env.IMAGE_STORAGE_PATH = TEST_STORAGE;
resetEnvCache();

const { createApp } = await import("../src/app");

const app = createApp();

function pngBytes(size = 16): Uint8Array {
  const header = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const out = new Uint8Array(Math.max(size, header.length));
  out.set(header, 0);
  return out;
}

describe("GET /images/* (blog static serving)", () => {
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
});
