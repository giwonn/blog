import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import path from "node:path";
import { mkdir, writeFile, utimes, rm, stat } from "node:fs/promises";

const TEST_ROOT = path.join(process.cwd(), "storage-cleanup-test");
process.env.IMAGE_STORAGE_PATH = TEST_ROOT;
process.env.IMAGE_PUBLIC_URL = "http://localhost:8081/images";

// Import after env override so the lazy env proxy reads the correct path.
// Domain barrel (not core root) — avoids pulling in db/client.ts, which
// would initialise the env cache before our override above takes effect.
const { imageCleanupTempImages } = await import("../src/domains/image");

async function seedFile(name: string, mtimeMs: number) {
  const dir = path.join(TEST_ROOT, "temp");
  await mkdir(dir, { recursive: true });
  const p = path.join(dir, name);
  await writeFile(p, "data");
  const t = new Date(mtimeMs);
  await utimes(p, t, t);
  return p;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

describe("imageCleanupTempImages", () => {
  beforeEach(async () => {
    await rm(TEST_ROOT, { recursive: true, force: true });
  });

  afterAll(async () => {
    await rm(TEST_ROOT, { recursive: true, force: true });
  });

  it("deletes files older than the cutoff", async () => {
    const oldPath = await seedFile("old.png", Date.now() - 25 * 60 * 60 * 1000);
    const deleted = await imageCleanupTempImages();
    expect(deleted).toBe(1);
    expect(await exists(oldPath)).toBe(false);
  });

  it("keeps recent files", async () => {
    const freshPath = await seedFile("fresh.png", Date.now());
    const deleted = await imageCleanupTempImages();
    expect(deleted).toBe(0);
    expect(await exists(freshPath)).toBe(true);
  });

  it("returns 0 when temp dir is missing", async () => {
    const deleted = await imageCleanupTempImages();
    expect(deleted).toBe(0);
  });
});
