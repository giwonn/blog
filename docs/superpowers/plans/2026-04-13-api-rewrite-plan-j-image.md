# API Rewrite — Plan J: Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port image upload, filesystem storage, static serving, cleanup cron, and Plan E article integration from Kotlin.

**Architecture:** A new `domains/image` module in `@api-next/core` with storage + service layers. POST `/admin/images` on admin (JWT-protected multipart). GET `/images/*` public on both blog and admin. Plan E article service gains `processNewImages` / `cleanupDeletedImages` / `cleanupAllImages` hooks. Hourly temp cleanup cron alongside the existing visitor-stats cron.

**Tech Stack:** Bun 1.3 (`Bun.file`, `Bun.write`), `node:fs/promises`, Hono multipart, croner, `bun:test`.

**Design reference:** `docs/superpowers/specs/2026-04-13-api-rewrite-plan-j-image-design.md`

---

## Scope Check

One domain, two route touches (admin POST + both apps GET), one article-service integration, one cron. Plan E tests stay green because their fixture content has no image markdown. Within a single plan.

## File Structure

```
apps/api-next/
├── .env.example                              # +IMAGE_STORAGE_PATH, IMAGE_PUBLIC_URL
├── .env                                      # +IMAGE_STORAGE_PATH, IMAGE_PUBLIC_URL (dev)
├── .env.test                                 # +IMAGE_STORAGE_PATH, IMAGE_PUBLIC_URL (test)
├── .gitignore                                # +storage/
├── apps/
│   ├── admin/
│   │   ├── src/
│   │   │   ├── app.ts                        # MODIFY: scope jwtAuth to /admin/*, mount /admin/images + GET /images/*
│   │   │   ├── index.ts                      # MODIFY: +hourly temp cleanup cron
│   │   │   └── routes/
│   │   │       └── images.ts                 # NEW: POST /admin/images multipart
│   │   └── test/
│   │       ├── images.test.ts                # NEW: upload + serve (~9 cases)
│   │       └── articles.test.ts              # MODIFY: +3 image-integration cases
│   └── blog/
│       ├── src/
│       │   └── app.ts                        # MODIFY: +GET /images/*
│       └── test/
│           └── images-serve.test.ts          # NEW: 2 serve cases
└── packages/core/
    ├── src/
    │   ├── env.ts                            # MODIFY: +IMAGE_STORAGE_PATH, IMAGE_PUBLIC_URL
    │   ├── errors.ts                         # MODIFY: +INVALID_IMAGE_TYPE, IMAGE_TOO_LARGE
    │   ├── index.ts                          # MODIFY: +image barrel exports
    │   └── domains/
    │       ├── image/                        # NEW
    │       │   ├── types.ts                  # ImageUploadResponse
    │       │   ├── storage.ts                # write, move, deleteFile, listTempFiles
    │       │   ├── service.ts                # uploadToTemp, processNewImages, cleanupDeletedImages, cleanupAllImages, cleanupTempImages
    │       │   └── index.ts                  # barrel
    │       └── articles/
    │           └── service.ts                # MODIFY: image hooks into create/update/deleteArticle
    └── test/
        └── imageCleanup.test.ts              # NEW: 3 cleanup cron cases
```

---

## Task 1: Env vars, error codes, gitignore

**Files:**
- Modify: `apps/api-next/packages/core/src/env.ts`
- Modify: `apps/api-next/packages/core/src/errors.ts`
- Modify: `apps/api-next/.env.example`
- Modify: `apps/api-next/.env`
- Modify: `apps/api-next/.env.test`
- Modify: `apps/api-next/.gitignore`

- [ ] **Step 1: Add error codes**

Edit `apps/api-next/packages/core/src/errors.ts`. Add two entries after `ARTICLE_SLUG_DUPLICATE`:

```ts
  ARTICLE_SLUG_DUPLICATE: { status: 400, message: "이미 사용 중인 slug입니다" },
  INVALID_IMAGE_TYPE: { status: 400, message: "지원하지 않는 이미지 형식입니다" },
  IMAGE_TOO_LARGE: { status: 400, message: "이미지 크기가 10MB를 초과합니다" },
```

- [ ] **Step 2: Add env vars**

Edit `apps/api-next/packages/core/src/env.ts`. Add two fields to the schema after `REDIS_URL`:

```ts
  REDIS_URL: z.string().default("redis://localhost:6380"),
  IMAGE_STORAGE_PATH: z.string().default("./storage/images"),
  IMAGE_PUBLIC_URL: z.string().default("http://localhost:8081/images"),
});
```

- [ ] **Step 3: Update env files**

Append to `apps/api-next/.env`:
```
IMAGE_STORAGE_PATH=./storage/images
IMAGE_PUBLIC_URL=http://localhost:8081/images
```

Append to `apps/api-next/.env.example` the same pair (if the file exists — create if missing with just those two lines).

Append to `apps/api-next/.env.test`:
```
IMAGE_STORAGE_PATH=./storage/images-test
IMAGE_PUBLIC_URL=http://localhost:8081/images
```

- [ ] **Step 4: Gitignore**

Append to `apps/api-next/.gitignore`:
```
storage/
```

- [ ] **Step 5: Verify lint clean**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog
bunx turbo run lint --filter=@api-next/core 2>&1 | tail -10
```
Expected: core passes lint.

- [ ] **Step 6: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/env.ts apps/api-next/packages/core/src/errors.ts apps/api-next/.env apps/api-next/.env.example apps/api-next/.env.test apps/api-next/.gitignore
git commit -m "feat(core): add image env vars and error codes

IMAGE_STORAGE_PATH, IMAGE_PUBLIC_URL with dev/test defaults.
INVALID_IMAGE_TYPE, IMAGE_TOO_LARGE errors mirror Kotlin Korean
messages verbatim for cutover parity."
```

---

## Task 2: Image storage module (Bun.write/move/delete)

**Files:**
- Create: `apps/api-next/packages/core/src/domains/image/types.ts`
- Create: `apps/api-next/packages/core/src/domains/image/storage.ts`

- [ ] **Step 1: Write `types.ts`**

```ts
export type ImageUploadResponse = {
  url: string;
};
```

- [ ] **Step 2: Write `storage.ts`**

```ts
import path from "node:path";
import { mkdir, readdir, stat, unlink, rename } from "node:fs/promises";
import { env } from "../../env";

/**
 * Writes bytes to `{IMAGE_STORAGE_PATH}/{relPath}` and returns the absolute
 * path. Creates parent dirs as needed.
 */
export async function write(relPath: string, data: Uint8Array): Promise<string> {
  const full = path.join(env.IMAGE_STORAGE_PATH, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await Bun.write(full, data);
  return full;
}

/**
 * Given a public URL (e.g. `http://host/images/temp/abc.png`), moves the
 * underlying file from temp to `targetSubdir` (relative to storage root)
 * and returns the new public URL.
 */
export async function move(publicUrl: string, targetSubdir: string): Promise<string> {
  const rel = urlToRelPath(publicUrl);
  if (!rel) throw new Error(`not a managed image url: ${publicUrl}`);
  const filename = path.basename(rel);
  const srcAbs = path.join(env.IMAGE_STORAGE_PATH, rel);
  const destRel = path.join(targetSubdir, filename);
  const destAbs = path.join(env.IMAGE_STORAGE_PATH, destRel);
  await mkdir(path.dirname(destAbs), { recursive: true });
  await rename(srcAbs, destAbs);
  return `${env.IMAGE_PUBLIC_URL}/${destRel.split(path.sep).join("/")}`;
}

/**
 * Deletes the file backing a public URL. No-op if the URL is not managed
 * or the file is already missing.
 */
export async function deleteFile(publicUrl: string): Promise<void> {
  const rel = urlToRelPath(publicUrl);
  if (!rel) return;
  const abs = path.join(env.IMAGE_STORAGE_PATH, rel);
  try {
    await unlink(abs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

export async function listTempFiles(): Promise<{ name: string; mtimeMs: number }[]> {
  const tempDir = path.join(env.IMAGE_STORAGE_PATH, "temp");
  let entries: string[];
  try {
    entries = await readdir(tempDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: { name: string; mtimeMs: number }[] = [];
  for (const name of entries) {
    try {
      const s = await stat(path.join(tempDir, name));
      if (s.isFile()) out.push({ name, mtimeMs: s.mtimeMs });
    } catch {
      // ignore missing/racing files
    }
  }
  return out;
}

export async function deleteTempFile(name: string): Promise<void> {
  const abs = path.join(env.IMAGE_STORAGE_PATH, "temp", name);
  try {
    await unlink(abs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/**
 * Returns the storage-root-relative path if the URL is prefixed with
 * `IMAGE_PUBLIC_URL`; otherwise null (external URL, leave alone).
 */
function urlToRelPath(publicUrl: string): string | null {
  const prefix = `${env.IMAGE_PUBLIC_URL}/`;
  if (!publicUrl.startsWith(prefix)) return null;
  return publicUrl.slice(prefix.length);
}
```

- [ ] **Step 3: Lint**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog
bunx turbo run lint --filter=@api-next/core 2>&1 | tail -10
```
Expected: pass.

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/domains/image/types.ts apps/api-next/packages/core/src/domains/image/storage.ts
git commit -m "feat(core): add image storage module

Wraps Bun.write and node:fs/promises for write/move/delete operations
rooted at IMAGE_STORAGE_PATH. URL <-> rel-path conversion so callers
can pass public URLs without knowing the filesystem layout."
```

---

## Task 3: Image service + cleanup (uploadToTemp, processNewImages, cleanups)

**Files:**
- Create: `apps/api-next/packages/core/src/domains/image/service.ts`
- Create: `apps/api-next/packages/core/src/domains/image/index.ts`
- Modify: `apps/api-next/packages/core/src/index.ts`

- [ ] **Step 1: Write `service.ts`**

```ts
import { BusinessError } from "../../errors";
import { env } from "../../env";
import * as storage from "./storage";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_SIZE = 10 * 1024 * 1024;
const TYPE_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

const TEMP_URL_PATTERN = /!\[([^\]]*)\]\((https?:\/\/[^)]*?\/temp\/[^)]+)\)/g;
const IMAGE_URL_PATTERN = /!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g;
const TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function uploadToTemp(
  data: Uint8Array,
  contentType: string,
): Promise<{ url: string }> {
  if (!ALLOWED_TYPES.has(contentType)) {
    throw BusinessError.from("INVALID_IMAGE_TYPE");
  }
  if (data.length > MAX_SIZE) {
    throw BusinessError.from("IMAGE_TOO_LARGE");
  }
  const ext = TYPE_TO_EXT[contentType]!;
  const filename = `${crypto.randomUUID()}.${ext}`;
  await storage.write(`temp/${filename}`, data);
  return { url: `${env.IMAGE_PUBLIC_URL}/temp/${filename}` };
}

export async function processNewImages(content: string, articleId: number): Promise<string> {
  const matches = [...content.matchAll(TEMP_URL_PATTERN)];
  if (matches.length === 0) return content;
  let result = content;
  for (const match of matches) {
    const fullMatch = match[0];
    const alt = match[1] ?? "";
    const tempUrl = match[2]!;
    try {
      const permanentUrl = await storage.move(tempUrl, `articles/${articleId}`);
      result = result.replace(fullMatch, `![${alt}](${permanentUrl})`);
    } catch (err) {
      console.warn("[image] failed to move temp image", tempUrl, err);
    }
  }
  return result;
}

export async function cleanupDeletedImages(oldContent: string, newContent: string): Promise<void> {
  const oldUrls = new Set([...oldContent.matchAll(IMAGE_URL_PATTERN)].map((m) => m[1]!));
  const newUrls = new Set([...newContent.matchAll(IMAGE_URL_PATTERN)].map((m) => m[1]!));
  for (const url of oldUrls) {
    if (!newUrls.has(url)) {
      try {
        await storage.deleteFile(url);
      } catch (err) {
        console.warn("[image] failed to delete orphaned image", url, err);
      }
    }
  }
}

export async function cleanupAllImages(content: string): Promise<void> {
  const urls = [...content.matchAll(IMAGE_URL_PATTERN)].map((m) => m[1]!);
  for (const url of urls) {
    try {
      await storage.deleteFile(url);
    } catch (err) {
      console.warn("[image] failed to delete image", url, err);
    }
  }
}

/**
 * Deletes temp/* files older than `maxAgeMs`. Returns deleted count.
 * Returns 0 if temp dir is missing.
 */
export async function cleanupTempImages(maxAgeMs: number = TEMP_MAX_AGE_MS): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  const files = await storage.listTempFiles();
  let deleted = 0;
  for (const { name, mtimeMs } of files) {
    if (mtimeMs < cutoff) {
      try {
        await storage.deleteTempFile(name);
        deleted++;
      } catch (err) {
        console.warn("[image] failed to delete temp file", name, err);
      }
    }
  }
  return deleted;
}
```

- [ ] **Step 2: Write `index.ts` barrel**

```ts
export type { ImageUploadResponse } from "./types";
export {
  uploadToTemp as imageUploadToTemp,
  processNewImages as imageProcessNewImages,
  cleanupDeletedImages as imageCleanupDeletedImages,
  cleanupAllImages as imageCleanupAllImages,
  cleanupTempImages as imageCleanupTempImages,
} from "./service";
```

- [ ] **Step 3: Re-export from core root**

Read `apps/api-next/packages/core/src/index.ts`. Add near the other domain exports:

```ts
export * from "./domains/image";
```

- [ ] **Step 4: Lint**

```bash
cd ~/github/new-blog
bunx turbo run lint --filter=@api-next/core 2>&1 | tail -10
```
Expected: pass.

- [ ] **Step 5: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/domains/image/service.ts apps/api-next/packages/core/src/domains/image/index.ts apps/api-next/packages/core/src/index.ts
git commit -m "feat(core): add image service (upload, process, cleanups)

uploadToTemp validates content-type + size and writes to temp/.
processNewImages / cleanupDeletedImages / cleanupAllImages power
Plan E article integration. cleanupTempImages is the cron target
(24h TTL). All per-file errors are swallowed and logged so image
failures don't break article saves."
```

---

## Task 4: Failing cleanupTempImages unit test (TDD red → green)

**Files:**
- Create: `apps/api-next/packages/core/test/imageCleanup.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import path from "node:path";
import { mkdir, writeFile, utimes, rm, stat } from "node:fs/promises";
import { imageCleanupTempImages } from "../src";

const TEST_ROOT = path.join(process.cwd(), "storage-cleanup-test");
process.env.IMAGE_STORAGE_PATH = TEST_ROOT;
process.env.IMAGE_PUBLIC_URL = "http://localhost:8081/images";

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
```

- [ ] **Step 2: Run and verify green**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/packages/core
bun test test/imageCleanup.test.ts 2>&1 | tail -15
```
Expected: 3/3 pass. Implementation from Task 3 already satisfies it — this test is green on first run because the service+storage were written above.

If red: check that `IMAGE_STORAGE_PATH` env override is read (env is lazy so must be set before first access; this test sets it at module top before importing `src`).

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/test/imageCleanup.test.ts
git commit -m "test(core): cover imageCleanupTempImages (3 cases)

Old files deleted, recent files kept, missing temp dir returns 0.
Uses utimes to backdate mtimes so the 24h cutoff is exercised
deterministically."
```

---

## Task 5: Scope admin jwtAuth so /images/* can be public

**Files:**
- Modify: `apps/api-next/apps/admin/src/app.ts`

**Why:** admin currently has `app.use("*", jwtAuth)`, which would block the public static image handler. Narrow jwtAuth to `/admin/*` so health and the forthcoming `/images/*` are reachable without a token. Plan K smoke: `/health` becomes public, which is the desirable state for a health check anyway.

- [ ] **Step 1: Edit admin app.ts**

Change the jwtAuth line:

```ts
  app.use("*", requestLogger);
  app.use("*", cors({ origin: "http://localhost:3001", credentials: true }));
  app.use("/admin/*", jwtAuth);
```

(was `app.use("*", jwtAuth)`)

- [ ] **Step 2: Run admin tests — any auth-on-health regression?**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/apps/admin
bun test 2>&1 | tail -20
```
Expected: all 80 existing admin tests still pass. If any assert that `/health` returns 401 without a token, update those cases to expect 200. If any other `/admin/*` cases break, they indicate a real auth regression — investigate before continuing.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/src/app.ts
git commit -m "refactor(api-admin): scope jwtAuth to /admin/* paths

Preparing for Plan J's public /images/* handler in the admin app.
Side effect: /health no longer requires a token, which is closer
to the intended behavior for a health endpoint."
```

---

## Task 6: Failing upload + serve tests in admin (TDD red)

**Files:**
- Create: `apps/api-next/apps/admin/test/images.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import path from "node:path";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { SignJWT } from "jose";

const TEST_STORAGE = path.join(process.cwd(), "storage-images-test");
process.env.IMAGE_STORAGE_PATH = TEST_STORAGE;
process.env.IMAGE_PUBLIC_URL = "http://localhost:8081/images";

import { createApp } from "../src/app";
import { env } from "@api-next/core";

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
```

- [ ] **Step 2: Run and verify red**

```bash
cd ~/github/new-blog/apps/api-next/apps/admin
bun test test/images.test.ts 2>&1 | tail -20
```
Expected: fail — no POST /admin/images route, no GET /images/* route yet.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/test/images.test.ts
git commit -m "test(api-admin): add failing image upload + serve tests (TDD red)

9 cases: 6 upload (png, jpeg, bad type, too large, no field, no
JWT), 3 serve (200, 404, traversal). Overrides IMAGE_STORAGE_PATH
to a dedicated temp dir scrubbed per test."
```

---

## Task 7: Admin upload route + static serving handler

**Files:**
- Create: `apps/api-next/apps/admin/src/routes/images.ts`
- Modify: `apps/api-next/apps/admin/src/app.ts`

- [ ] **Step 1: Write `routes/images.ts`**

```ts
import { Hono } from "hono";
import { imageUploadToTemp } from "@api-next/core";

export const imagesAdminRoute = new Hono();

imagesAdminRoute.post("/", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) {
    return c.json({ message: "file field required" }, 400);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await imageUploadToTemp(bytes, file.type);
  return c.json({ data: result });
});
```

- [ ] **Step 2: Wire routes into admin app.ts**

Edit `apps/api-next/apps/admin/src/app.ts`:

Add imports:
```ts
import path from "node:path";
import { env } from "@api-next/core";
import { imagesAdminRoute } from "./routes/images";
```

Register the admin upload route alongside the others:
```ts
  app.route("/admin/analytics", analyticsRoute);
  app.route("/admin/images", imagesAdminRoute);
```

Register the public static handler before `app.onError(...)`:
```ts
  app.get("/images/*", async (c) => {
    const rel = c.req.path.slice("/images/".length);
    if (rel.length === 0 || rel.split("/").includes("..") || rel.includes("\0")) {
      return c.notFound();
    }
    const full = path.join(env.IMAGE_STORAGE_PATH, rel);
    const file = Bun.file(full);
    if (!(await file.exists())) {
      return c.notFound();
    }
    return new Response(file);
  });
```

- [ ] **Step 3: Run admin image tests**

```bash
cd ~/github/new-blog/apps/api-next/apps/admin
bun test test/images.test.ts 2>&1 | tail -20
```
Expected: 9/9 pass.

If failures:
- 400 on valid upload: `c.req.parseBody()` key lookup mismatch — confirm `body["file"]` (not `body.file`)
- URL shape wrong: check `IMAGE_PUBLIC_URL` env is read by the lazy env proxy after test-file set it
- Traversal not blocked: ensure `"..".split("/")` check runs before path.join

- [ ] **Step 4: Run full admin suite**

```bash
cd ~/github/new-blog/apps/api-next/apps/admin
bun test 2>&1 | tail -20
```
Expected: all 89 tests pass (80 pre-existing + 9 new).

- [ ] **Step 5: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/src/routes/images.ts apps/api-next/apps/admin/src/app.ts
git commit -m "feat(api-admin): add POST /admin/images and GET /images/* handlers

Multipart upload delegates to imageUploadToTemp. Static serving
uses Bun.file + new Response(file) with path-traversal rejection.
The static handler is public (jwtAuth is scoped to /admin/*)."
```

---

## Task 8: Blog static serving handler + tests

**Files:**
- Create: `apps/api-next/apps/blog/test/images-serve.test.ts`
- Modify: `apps/api-next/apps/blog/src/app.ts`

- [ ] **Step 1: Write the blog serve test (TDD red)**

```ts
import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";

const TEST_STORAGE = path.join(process.cwd(), "storage-blog-images-test");
process.env.IMAGE_STORAGE_PATH = TEST_STORAGE;

import { createApp } from "../src/app";

const app = createApp();

describe("GET /images/* (blog static serving)", () => {
  beforeEach(async () => {
    await rm(TEST_STORAGE, { recursive: true, force: true });
    await mkdir(TEST_STORAGE, { recursive: true });
  });

  afterAll(async () => {
    await rm(TEST_STORAGE, { recursive: true, force: true });
  });

  it("serves an existing file", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    await writeFile(path.join(TEST_STORAGE, "x.png"), bytes);
    const res = await app.request("/images/x.png");
    expect(res.status).toBe(200);
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf.length).toBe(8);
  });

  it("returns 404 for missing file", async () => {
    const res = await app.request("/images/missing.png");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Verify red**

```bash
cd ~/github/new-blog/apps/api-next/apps/blog
bun test test/images-serve.test.ts 2>&1 | tail -15
```
Expected: red (handler not registered).

- [ ] **Step 3: Register handler in blog app.ts**

Edit `apps/api-next/apps/blog/src/app.ts`:

Add imports near the top:
```ts
import path from "node:path";
import { env } from "@api-next/core";
```

Add the handler before `app.onError(...)`:
```ts
  app.route("/sidebar", sidebarRoute);
  app.get("/images/*", async (c) => {
    const rel = c.req.path.slice("/images/".length);
    if (rel.length === 0 || rel.split("/").includes("..") || rel.includes("\0")) {
      return c.notFound();
    }
    const full = path.join(env.IMAGE_STORAGE_PATH, rel);
    const file = Bun.file(full);
    if (!(await file.exists())) {
      return c.notFound();
    }
    return new Response(file);
  });
```

- [ ] **Step 4: Verify green**

```bash
cd ~/github/new-blog/apps/api-next/apps/blog
bun test 2>&1 | tail -20
```
Expected: all blog tests pass (36 pre-existing + 2 serve = 38).

- [ ] **Step 5: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/blog/test/images-serve.test.ts apps/api-next/apps/blog/src/app.ts
git commit -m "feat(api-blog): serve static images at /images/*

Both blog and admin now serve from the same IMAGE_STORAGE_PATH.
Duplicates the 10-line handler — shared factory deferred until
a third consumer."
```

---

## Task 9: Plan E article service — image hooks integration

**Files:**
- Modify: `apps/api-next/packages/core/src/domains/articles/service.ts`

- [ ] **Step 1: Edit `create`, `update`, `deleteArticle`**

Add imports at the top of `service.ts`:
```ts
import {
  imageProcessNewImages,
  imageCleanupDeletedImages,
  imageCleanupAllImages,
} from "../image";
```

Replace `create`:
```ts
export async function create(req: ArticleRequest): Promise<Article> {
  if (await repo.existsBySlug(req.slug)) {
    throw BusinessError.from("ARTICLE_SLUG_DUPLICATE");
  }
  const now = nowIso();
  const publishedAt = isVisible(req.status) ? now : null;
  const saved = await repo.insert(req, publishedAt, now);
  const processedContent = await imageProcessNewImages(saved.content, saved.id);
  if (processedContent !== saved.content) {
    return await repo.update(saved.id, { ...req, content: processedContent }, publishedAt, now);
  }
  return saved;
}
```

Replace `update`:
```ts
export async function update(id: number, req: ArticleRequest): Promise<Article> {
  const existing = await repo.findById(id);
  if (!existing) throw BusinessError.from("ARTICLE_NOT_FOUND");
  if (req.slug !== existing.slug) {
    if (await repo.existsBySlugExcludingId(req.slug, id)) {
      throw BusinessError.from("ARTICLE_SLUG_DUPLICATE");
    }
  }
  const processedContent = await imageProcessNewImages(req.content, id);
  await imageCleanupDeletedImages(existing.content, processedContent);
  const now = nowIso();
  let publishedAt = existing.publishedAt;
  const wasNotVisible = !isVisible(existing.status);
  const willBeVisible = isVisible(req.status);
  if (wasNotVisible && willBeVisible && publishedAt === null) {
    publishedAt = now;
  }
  return await repo.update(id, { ...req, content: processedContent }, publishedAt, now);
}
```

Replace `deleteArticle`:
```ts
export async function deleteArticle(id: number): Promise<void> {
  const existing = await repo.findById(id);
  if (!existing) throw BusinessError.from("ARTICLE_NOT_FOUND");
  await imageCleanupAllImages(existing.content);
  await repo.deleteById(id);
}
```

- [ ] **Step 2: Run existing article tests — confirm no regressions**

```bash
cd ~/github/new-blog/apps/api-next/apps/admin
bun test test/articles.test.ts 2>&1 | tail -20
```
Expected: all existing article tests pass (content is plain `"body"` — no temp URLs — so `imageProcessNewImages` is an identity with zero filesystem calls).

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/domains/articles/service.ts
git commit -m "feat(core): integrate image hooks into article lifecycle

create: after insert, move temp URLs to articles/<id>/ and update
  if content changed.
update: process new temp URLs, then cleanup images removed from
  the old content.
deleteArticle: cleanup all images before deleting the row.
Plan E test content has no image markdown, so existing cases
remain pure identity operations with zero filesystem side effects."
```

---

## Task 10: Article image integration tests

**Files:**
- Modify: `apps/api-next/apps/admin/test/articles.test.ts`

- [ ] **Step 1: Read the current test file and locate the describe block**

```bash
cd ~/github/new-blog/apps/api-next/apps/admin
grep -n "describe\|beforeEach\|IMAGE_STORAGE" test/articles.test.ts | head -20
```

If the test file does not already set `IMAGE_STORAGE_PATH` at module top, add this before the `createApp` import:

```ts
import path from "node:path";
process.env.IMAGE_STORAGE_PATH = path.join(process.cwd(), "storage-articles-test");
process.env.IMAGE_PUBLIC_URL = "http://localhost:8081/images";
```

- [ ] **Step 2: Add a helper + 3 new cases inside the existing admin articles describe**

At the bottom of the describe block (before the closing `});`), append:

```ts
  // --- Plan J: image integration ---
  const { mkdir, writeFile, rm, stat } = await import("node:fs/promises");
  const IMG_ROOT = process.env.IMAGE_STORAGE_PATH!;

  async function seedTempImage(): Promise<string> {
    await mkdir(path.join(IMG_ROOT, "temp"), { recursive: true });
    const id = crypto.randomUUID();
    const filename = `${id}.png`;
    await writeFile(path.join(IMG_ROOT, "temp", filename), new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    return `http://localhost:8081/images/temp/${filename}`;
  }

  async function fileExists(url: string): Promise<boolean> {
    const rel = url.replace("http://localhost:8081/images/", "");
    try {
      await stat(path.join(IMG_ROOT, rel));
      return true;
    } catch {
      return false;
    }
  }

  it("POST article with temp image moves file and rewrites URL", async () => {
    await rm(IMG_ROOT, { recursive: true, force: true });
    const tempUrl = await seedTempImage();
    const res = await app.request("/admin/articles", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        title: "With image",
        slug: "with-image",
        content: `![alt](${tempUrl})`,
        status: "PUBLIC",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: number; content: string } };
    expect(body.data.content).not.toContain("/temp/");
    expect(body.data.content).toContain(`/articles/${body.data.id}/`);
    const permUrl = body.data.content.match(/\((https?:[^)]+)\)/)![1]!;
    expect(await fileExists(permUrl)).toBe(true);
    expect(await fileExists(tempUrl)).toBe(false);
  });

  it("PUT article removing an image deletes the old file", async () => {
    await rm(IMG_ROOT, { recursive: true, force: true });
    const tempUrl = await seedTempImage();
    const createRes = await app.request("/admin/articles", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        title: "Remove",
        slug: "remove-img",
        content: `before ![a](${tempUrl}) after`,
        status: "PUBLIC",
      }),
    });
    const created = (await createRes.json()) as { data: { id: number; content: string } };
    const permUrl = created.data.content.match(/\((https?:[^)]+)\)/)![1]!;
    expect(await fileExists(permUrl)).toBe(true);

    const putRes = await app.request(`/admin/articles/${created.data.id}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        title: "Remove",
        slug: "remove-img",
        content: "no image anymore",
        status: "PUBLIC",
      }),
    });
    expect(putRes.status).toBe(200);
    expect(await fileExists(permUrl)).toBe(false);
  });

  it("DELETE article removes all its images from disk", async () => {
    await rm(IMG_ROOT, { recursive: true, force: true });
    const tempUrl = await seedTempImage();
    const createRes = await app.request("/admin/articles", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        title: "Delete",
        slug: "delete-img",
        content: `![a](${tempUrl})`,
        status: "PUBLIC",
      }),
    });
    const created = (await createRes.json()) as { data: { id: number; content: string } };
    const permUrl = created.data.content.match(/\((https?:[^)]+)\)/)![1]!;
    expect(await fileExists(permUrl)).toBe(true);

    const delRes = await app.request(`/admin/articles/${created.data.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(delRes.status).toBe(204);
    expect(await fileExists(permUrl)).toBe(false);
  });
```

Note: if the existing `articles.test.ts` uses a different local variable for the app (e.g. `const app = createApp()` at the top) and for the JWT (`token`), reuse those. If it uses `resetDb` in `beforeEach`, the cleanup calls above (`rm IMG_ROOT`) are additive and safe. If the DELETE response is 200 not 204, adjust to match existing pattern.

- [ ] **Step 2: Run the full admin suite**

```bash
cd ~/github/new-blog/apps/api-next/apps/admin
bun test 2>&1 | tail -30
```
Expected: all tests pass including the 3 new image integration cases.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/test/articles.test.ts
git commit -m "test(api-admin): cover article image integration (3 cases)

POST moves temp file to articles/<id>/, PUT deletes orphaned
image, DELETE cleans up all article images."
```

---

## Task 11: Register hourly temp cleanup cron

**Files:**
- Modify: `apps/api-next/apps/admin/src/index.ts`

- [ ] **Step 1: Add cron**

Edit `apps/api-next/apps/admin/src/index.ts`:

```ts
import { Cron } from "croner";
import { createApp } from "./app";
import {
  env,
  analyticsVisitorStatsAggregate,
  imageCleanupTempImages,
} from "@api-next/core";

const app = createApp();

new Cron("5 3 * * *", { timezone: "Asia/Seoul" }, async () => {
  try {
    await analyticsVisitorStatsAggregate();
    console.info("[scheduler] visitor stats aggregate ok");
  } catch (err) {
    console.error("[scheduler] visitor stats aggregate failed", err);
  }
});
console.info("[scheduler] visitor stats aggregate cron registered (5 3 * * * Asia/Seoul)");

new Cron("0 * * * *", { timezone: "Asia/Seoul" }, async () => {
  try {
    const deleted = await imageCleanupTempImages();
    if (deleted > 0) console.info(`[scheduler] temp image cleanup deleted ${deleted} files`);
  } catch (err) {
    console.error("[scheduler] temp image cleanup failed", err);
  }
});
console.info("[scheduler] temp image cleanup cron registered (0 * * * * Asia/Seoul)");

export default {
  fetch: app.fetch,
  port: env.ADMIN_PORT,
};
```

- [ ] **Step 2: Type-check via lint**

```bash
cd ~/github/new-blog
bunx turbo run lint --filter=api-admin-next 2>&1 | tail -10
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/src/index.ts
git commit -m "feat(api-admin): register hourly temp image cleanup cron

Runs at minute 0 every hour (Asia/Seoul). Deletes /temp files
older than 24h. Errors are logged and swallowed so a bad run
doesn't cascade into the process."
```

---

## Task 12: Monorepo verification + manual smoke

**Files:** (no changes)

- [ ] **Step 1: Full lint**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog
bunx turbo run lint --force 2>&1 | tail -10
```
Expected: 5/5 success, 0 errors.

- [ ] **Step 2: Full test**

```bash
cd ~/github/new-blog
bun run test 2>&1 | tail -20
```
Expected: 4/4 successful.
- `@api-next/core`: 33 (30 + 3 imageCleanup)
- `api-blog-next`: 38 (36 + 2 images-serve)
- `api-admin-next`: 92 (80 + 9 images + 3 article-integration)
- `admin` Next.js: 15

- [ ] **Step 3: Manual smoke — upload + serve**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/apps/admin
export $(grep -v '^#' ../../.env | xargs)
bun run src/index.ts > /tmp/admin-j.log 2>&1 &
ADMIN_PID=$!
sleep 1

# Mint a dev token (adjust if a helper script already exists)
TOKEN=$(bun -e "
  import { SignJWT } from 'jose';
  const secret = new TextEncoder().encode('$ADMIN_JWT_SECRET');
  const sub = '$ADMIN_GOOGLE_SUB'.split(',')[0].trim();
  const jwt = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(sub).setExpirationTime('1h').sign(secret);
  console.log(jwt);
")

# Craft a tiny png file
printf '\x89PNG\r\n\x1a\nhello' > /tmp/smoke.png

echo "--- upload ---"
UPLOAD=$(curl -s -H "authorization: Bearer $TOKEN" -F file=@/tmp/smoke.png http://localhost:8081/admin/images)
echo "$UPLOAD"
URL=$(echo "$UPLOAD" | grep -oE 'https?://[^"]+')

echo "--- serve ---"
curl -s "$URL" | xxd | head -2

echo "--- traversal blocked ---"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8081/images/../etc/passwd"

kill $ADMIN_PID 2>/dev/null
wait 2>/dev/null
rm -f /tmp/smoke.png
```
Expected:
- Upload returns `{"data":{"url":"http://localhost:8081/images/temp/<uuid>.png"}}`
- Serve returns the same bytes starting with `89 50 4e 47`
- Traversal returns `404`

- [ ] **Step 4: Manual smoke — cleanup direct call**

```bash
cd ~/github/new-blog/apps/api-next
bun -e "
  process.env.IMAGE_STORAGE_PATH = './storage/images';
  const { imageCleanupTempImages } = await import('./packages/core/src');
  const { mkdir, writeFile, utimes } = await import('node:fs/promises');
  const path = await import('node:path');
  await mkdir('./storage/images/temp', { recursive: true });
  const p = './storage/images/temp/old.png';
  await writeFile(p, 'x');
  const t = new Date(Date.now() - 25 * 60 * 60 * 1000);
  await utimes(p, t, t);
  const deleted = await imageCleanupTempImages();
  console.log('deleted:', deleted);
"
```
Expected: `deleted: 1`.

No commit.

---

## Plan J Completion Checklist

- [ ] Task 1: env vars + error codes committed
- [ ] Task 2: storage module committed
- [ ] Task 3: service + barrel committed
- [ ] Task 4: imageCleanup unit tests pass
- [ ] Task 5: jwtAuth scoped to `/admin/*`
- [ ] Task 6: failing upload + serve tests committed
- [ ] Task 7: admin upload route + static handler → 9/9 image tests pass
- [ ] Task 8: blog static handler + 2 serve tests pass
- [ ] Task 9: article service integrates image hooks, existing tests still green
- [ ] Task 10: 3 article-integration cases pass
- [ ] Task 11: hourly cron registered
- [ ] Task 12: `bunx turbo run lint` 5/5, `bun run test` 4/4, manual smoke OK

## Out of Scope

- Object storage (S3/R2) — filesystem only
- Image resizing / thumbnails — Kotlin doesn't either
- CDN / cache headers — reverse proxy adds them in production
- Multi-file upload — single `file` field
- EXIF / dimension extraction
- hono-pino migration — still deferred
- `@api-next/core/middleware` extraction — still deferred
- Shared `/images/*` factory — extract on third consumer
