# API Rewrite — Plan J: Image Domain Design

**Date:** 2026-04-13
**Status:** Approved for planning
**Parent design:** `docs/superpowers/specs/2026-04-13-api-rewrite-design.md`
**Depends on:** Plan E (article service — extended here with image processing hooks)

## Goal

Port the image upload, local filesystem storage, static serving, cleanup scheduler, and article integration from Kotlin. Restores the image-processing hooks that Plan E deliberately stubbed as no-op. Final domain plan before cutover.

## Endpoint Inventory

| Method | Path | App | Notes |
|---|---|---|---|
| POST | `/admin/images` | admin | Multipart upload, JWT auth. Validates type + size, saves to `{IMAGE_STORAGE_PATH}/temp/{uuid}.ext`, returns `{ url }`. |
| GET | `/images/*` | blog + admin | Public static file serving. Reads from `{IMAGE_STORAGE_PATH}/{rest}`. Both processes serve from the same directory. |

## Architectural Decisions

### LocalImageStorage with `Bun.file` and `Bun.write`

Kotlin uses `java.nio.file.Files` for read/write/move/delete. Bun has native equivalents that are cleaner:

- **Write**: `Bun.write(path, data)` — creates parent directories automatically
- **Read/serve**: `Bun.file(path)` — returns a `BunFile`, stream-compatible with `new Response(file)`
- **Exists check**: `await Bun.file(path).exists()`
- **Delete**: `await Bun.file(path).delete()` (Bun 1.3+) or `unlink` from `node:fs/promises`
- **Move**: read source, write target, delete source — or use `rename` from `node:fs/promises`

Implementation lives in `packages/core/src/domains/image/storage.ts` as a module-scoped set of async functions (no class). Callers import `uploadToTemp`, `move`, `deleteFile`.

### Storage Path Configuration

Two env vars:

- `IMAGE_STORAGE_PATH` — filesystem root for storage. Default `./storage/images` for dev. Production will use `/data/blog/images` via a mounted volume.
- `IMAGE_PUBLIC_URL` — URL prefix that will be prepended when returning URLs to clients. Default `http://localhost:8081/images`. Production uses the nginx-exposed origin.

The dev default uses a relative path so the git-ignored `apps/api-next/storage/` directory gets created automatically on first upload. Document in README.

### Multipart Upload in Hono

Hono's `c.req.parseBody()` handles multipart. The request body has one field `file` (matching Kotlin's `@RequestParam("file")`):

```ts
const body = await c.req.parseBody();
const file = body.file;
if (!(file instanceof File)) {
  return c.json({ message: "file field required" }, 400);
}
const bytes = new Uint8Array(await file.arrayBuffer());
```

Tests send `FormData` via `app.request()`:

```ts
const fd = new FormData();
fd.append("file", new Blob([testBytes], { type: "image/png" }), "test.png");
const res = await app.request("/admin/images", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: fd });
```

### Static Serving with `Bun.file` + Hono

```ts
import path from "node:path";
import { env } from "@api-next/core";

app.get("/images/*", async (c) => {
  const rel = c.req.path.slice("/images/".length);
  // Block path traversal: reject any `..` segment
  if (rel.split("/").includes("..") || rel.includes("\0")) {
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

Registered in **both** `apps/blog/src/app.ts` and `apps/admin/src/app.ts`. The duplication is 10 lines; extracting to a shared factory doesn't save much and Hono context types make cross-app helpers awkward. If a third app ever needs it, extract then.

### ErrorCode Additions

```ts
INVALID_IMAGE_TYPE: { status: 400, message: "지원하지 않는 이미지 형식입니다" },
IMAGE_TOO_LARGE: { status: 400, message: "이미지 크기가 10MB를 초과합니다" },
```

Korean messages match the Kotlin enum verbatim for cutover parity.

### Validation Constants

In `domains/image/service.ts`:

```ts
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const TYPE_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};
```

`uploadToTemp(data, contentType, originalFilename)`:

1. If `contentType` not in `ALLOWED_TYPES` → `throw BusinessError.from("INVALID_IMAGE_TYPE")`
2. If `data.length > MAX_SIZE` → `throw BusinessError.from("IMAGE_TOO_LARGE")`
3. Generate UUID filename: `${crypto.randomUUID()}.${TYPE_TO_EXT[contentType]}`
4. Write to `{IMAGE_STORAGE_PATH}/temp/{filename}`
5. Return `${IMAGE_PUBLIC_URL}/temp/{filename}`

### Image Processing Helpers

`domains/image/service.ts` exports three helpers used by Plan E article integration:

```ts
const TEMP_URL_PATTERN = /!\[([^\]]*)\]\((https?:\/\/[^)]*?\/temp\/[^)]+)\)/g;
const IMAGE_URL_PATTERN = /!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g;

/**
 * Scans content for markdown image references whose URL contains `/temp/`,
 * moves each one to a per-article directory, and rewrites the URL.
 * Returns the updated content (or the original if no changes needed).
 */
export async function processNewImages(content: string, articleId: number): Promise<string> {
  const matches = [...content.matchAll(TEMP_URL_PATTERN)];
  if (matches.length === 0) return content;
  let result = content;
  for (const match of matches) {
    const fullMatch = match[0];
    const alt = match[1];
    const tempUrl = match[2]!;
    try {
      const permanentUrl = await move(tempUrl, `articles/${articleId}`);
      result = result.replace(fullMatch, `![${alt}](${permanentUrl})`);
    } catch (err) {
      console.warn("[image] failed to move temp image", tempUrl, err);
      // leave the URL as-is — rewrite on next update, or it'll be cleaned up
    }
  }
  return result;
}

/**
 * Deletes any images that were in `oldContent` but are not in `newContent`.
 */
export async function cleanupDeletedImages(oldContent: string, newContent: string): Promise<void> {
  const oldUrls = new Set([...oldContent.matchAll(IMAGE_URL_PATTERN)].map((m) => m[1]!));
  const newUrls = new Set([...newContent.matchAll(IMAGE_URL_PATTERN)].map((m) => m[1]!));
  for (const url of oldUrls) {
    if (!newUrls.has(url)) {
      try {
        await deleteFile(url);
      } catch (err) {
        console.warn("[image] failed to delete orphaned image", url, err);
      }
    }
  }
}

/**
 * Deletes every image referenced in the content. Called before an article
 * is removed so its images don't orphan in storage.
 */
export async function cleanupAllImages(content: string): Promise<void> {
  const urls = [...content.matchAll(IMAGE_URL_PATTERN)].map((m) => m[1]!);
  for (const url of urls) {
    try {
      await deleteFile(url);
    } catch (err) {
      console.warn("[image] failed to delete image", url, err);
    }
  }
}
```

All three functions swallow individual file errors and log. An image processing failure should not fail the article save.

### Plan E Article Service — Integration Restore

`domains/articles/service.ts` gains image hooks in three places:

**create**:
```ts
export async function create(req: ArticleRequest): Promise<Article> {
  if (await repo.existsBySlug(req.slug)) {
    throw BusinessError.from("ARTICLE_SLUG_DUPLICATE");
  }
  const now = nowIso();
  const publishedAt = isVisible(req.status) ? now : null;
  const saved = await repo.insert(req, publishedAt, now);
  const processedContent = await processNewImages(saved.content, saved.id);
  if (processedContent !== saved.content) {
    const updated = await repo.update(saved.id, { ...req, content: processedContent }, publishedAt, now);
    return updated;
  }
  return saved;
}
```

**update**:
```ts
export async function update(id: number, req: ArticleRequest): Promise<Article> {
  const existing = await repo.findById(id);
  if (!existing) throw BusinessError.from("ARTICLE_NOT_FOUND");
  if (req.slug !== existing.slug) {
    if (await repo.existsBySlugExcludingId(req.slug, id)) {
      throw BusinessError.from("ARTICLE_SLUG_DUPLICATE");
    }
  }
  // Process images in the new content and clean up the difference against the old.
  const processedContent = await processNewImages(req.content, id);
  await cleanupDeletedImages(existing.content, processedContent);
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

**deleteArticle**:
```ts
export async function deleteArticle(id: number): Promise<void> {
  const existing = await repo.findById(id);
  if (!existing) throw BusinessError.from("ARTICLE_NOT_FOUND");
  await cleanupAllImages(existing.content);
  await repo.deleteById(id);
}
```

**Impact on existing Plan E tests**: Plan E tests use `content: "body"` (plain string, no image markdown). `TEMP_URL_PATTERN.matchAll` returns zero matches, so `processNewImages` is a pure identity, zero filesystem calls. The existing 17 article tests will stay green. New tests verify the image integration explicitly.

### Cleanup Scheduler

`domains/image/service.ts` also exports `cleanupTempImages(maxAgeMs = 24 * 60 * 60 * 1000)` which:

1. Reads the directory `{IMAGE_STORAGE_PATH}/temp/` (returns early if missing)
2. For each file, stat it and compare `mtimeMs` to `Date.now() - maxAgeMs`
3. Delete files older than the cutoff
4. Log the count on completion

Uses `node:fs/promises` for `readdir`/`stat`/`unlink`. Bun supports these.

Registered in `apps/admin/src/index.ts` alongside the existing visitor stats cron:

```ts
import { analyticsVisitorStatsAggregate, imageCleanupTempImages } from "@api-next/core";

// existing visitor stats cron at 03:05
new Cron("5 3 * * *", { timezone: "Asia/Seoul" }, async () => { /* ... */ });

// hourly temp image cleanup
new Cron("0 * * * *", { timezone: "Asia/Seoul" }, async () => {
  try {
    const deleted = await imageCleanupTempImages();
    if (deleted > 0) console.info(`[scheduler] temp image cleanup deleted ${deleted} files`);
  } catch (err) {
    console.error("[scheduler] temp image cleanup failed", err);
  }
});
console.info("[scheduler] temp image cleanup cron registered (0 * * * * Asia/Seoul)");
```

### File Structure

```
apps/api-next/
├── .env.example                           # +IMAGE_STORAGE_PATH, IMAGE_PUBLIC_URL
├── .env.test                              # same
├── .gitignore                             # +storage/
├── apps/
│   ├── admin/
│   │   ├── src/
│   │   │   ├── app.ts                     # +mount /admin/images + GET /images/*
│   │   │   ├── index.ts                   # +temp image cleanup cron
│   │   │   └── routes/
│   │   │       └── images.ts              # NEW: POST handler (multipart)
│   │   └── test/
│   │       └── images.test.ts             # NEW: ~6 upload + ~3 serve cases
│   └── blog/
│       ├── src/
│       │   └── app.ts                     # +GET /images/*
│       └── test/
│           └── images-serve.test.ts       # NEW: ~2 serve cases
└── packages/core/
    └── src/
        ├── env.ts                         # +IMAGE_STORAGE_PATH, IMAGE_PUBLIC_URL
        ├── errors.ts                      # +INVALID_IMAGE_TYPE, IMAGE_TOO_LARGE
        ├── index.ts                       # +image exports
        └── domains/
            ├── image/                     # NEW
            │   ├── types.ts               # ImageUploadResponse
            │   ├── storage.ts             # write, read, move, deleteFile, listTempFiles
            │   ├── service.ts             # uploadToTemp, processNewImages, cleanupDeletedImages, cleanupAllImages, cleanupTempImages
            │   └── index.ts               # barrel with imageUploadToTemp, imageProcessNewImages, imageCleanupDeletedImages, imageCleanupAllImages, imageCleanupTempImages
            └── articles/
                └── service.ts             # MODIFY: integrate image hooks into create/update/deleteArticle
```

## Test Plan

### `apps/admin/test/images.test.ts` — upload tests

1. **POST /admin/images valid PNG** → 200 `{ data: { url } }`, file exists on disk
2. **POST /admin/images valid JPEG** → 200 with `.jpg` extension
3. **POST non-image (text/plain)** → 400 INVALID_IMAGE_TYPE
4. **POST oversized (11MB png)** → 400 IMAGE_TOO_LARGE
5. **POST without file field** → 400 `{ message: "file field required" }` (or Zod-style)
6. **401 without JWT** (combined test)

`beforeEach` creates a fresh test storage dir under a temp location + sets env overrides. `afterAll` cleans up.

### `apps/admin/test/images.test.ts` — serve tests (same file or split)

7. **GET /images/test.png for existing file** → 200 + PNG bytes
8. **GET /images/missing.png** → 404
9. **GET /images/../../etc/passwd** → 404 (path traversal blocked)

### `apps/blog/test/images-serve.test.ts`

Same 2 serve cases for the blog process (it reads from the same directory):

1. **GET /images/test.png existing** → 200
2. **GET /images/missing.png** → 404

### `apps/admin/test/articles.test.ts` — **modify** existing file

Add 3 new cases at the end of the existing describe:

1. **POST article with temp image in content** → response content has permanent URL, file exists in `articles/<id>/`
2. **PUT article removing an image** → old image file is deleted on disk
3. **DELETE article** → all images in content are deleted on disk

Reuse `seedTempImage` helper (write a fixture PNG to `${IMAGE_STORAGE_PATH}/temp/{uuid}.png`).

### `packages/core/test/imageCleanup.test.ts` — new

Unit test for `cleanupTempImages`:
1. **Old files deleted** — create file with `mtime` set 25 hours ago, run cleanup, verify deleted
2. **Recent files kept** — create file with fresh `mtime`, run cleanup, verify still present
3. **Missing temp dir** — returns 0 gracefully

Uses `fs/promises` to set `mtime` via `utimes`.

## Plan J Deliverables

1. `INVALID_IMAGE_TYPE`, `IMAGE_TOO_LARGE` added to errors.ts
2. `IMAGE_STORAGE_PATH`, `IMAGE_PUBLIC_URL` in env; `.env.example`, `.env.test`, `.gitignore` updated
3. `domains/image/{types,storage,service,index}.ts` created
4. Core barrel re-exports image surface
5. `apps/admin/src/routes/images.ts` with POST handler, mounted at `/admin/images`
6. Static serving `/images/*` handler in both blog and admin `app.ts`
7. Plan E article service integrated with image hooks (create/update/deleteArticle)
8. `apps/admin/src/index.ts` registers the hourly temp cleanup cron
9. `apps/admin/test/images.test.ts` ~9 cases pass
10. `apps/blog/test/images-serve.test.ts` ~2 cases pass
11. `apps/admin/test/articles.test.ts` extended with 3 image-integration cases, all passing
12. `packages/core/test/imageCleanup.test.ts` 3 cases pass
13. `bunx turbo run lint` 5/5 (0 errors)
14. `bun run test` 4/4
15. Manual smoke: curl multipart upload → verify file on disk → curl static serve → verify bytes match
16. Manual smoke: `imageCleanupTempImages()` direct call with seeded old files

## Plan J Non-Goals

- **Object storage (S3/R2)** — filesystem only, matching Kotlin. A later plan can add a cloud adapter behind the `ImageStorage` interface.
- **Image resizing / thumbnails** — Kotlin doesn't do it either.
- **CDN / cache headers** — default Hono response. Fine for dev; reverse proxy adds them in production.
- **Multi-file upload in one request** — single `file` field only, matches Kotlin.
- **Image metadata extraction** (EXIF, dimensions) — out of scope.
- **`@api-next/core/middleware` extraction** — still deferred
- **`hono-pino` migration** — still deferred
