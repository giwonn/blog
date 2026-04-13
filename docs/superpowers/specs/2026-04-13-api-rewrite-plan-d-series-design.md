# API Rewrite — Plan D: Series Domain Design

**Date:** 2026-04-13
**Status:** Approved for planning
**Parent design:** `docs/superpowers/specs/2026-04-13-api-rewrite-design.md`
**Sibling:** `docs/superpowers/specs/2026-04-13-api-rewrite-plan-c-book-design.md` (same template, more complex domain)

## Goal

Port the Kotlin `series` domain (7 of 8 endpoints — defers `PUT /admin/series/:id/article-order` to Plan E). Series is structurally identical to book but has only 4 fields (`title`, `slug`, `description`, `thumbnailUrl`) and uses `series_id`/`order_in_series` on articles. This plan reuses the entire Plan C template and adds two reader functions to the existing `domains/articles/` stub.

## Endpoint Inventory

| Method | Path | App | Status | Notes |
|---|---|---|---|---|
| GET | `/series` | blog | port | Returns `SeriesWithArticleCount[]`; counts visible articles per series |
| GET | `/series/:slug` | blog | port | Returns `{ series, articles }`; articles filtered to visible |
| GET | `/admin/series` | admin | port | Returns `Series[]` |
| GET | `/admin/series/:id` | admin | port | Returns `{ series, articles }`; full article list sorted by `orderInSeries` |
| POST | `/admin/series` | admin | port | 201 + `Series` |
| PUT | `/admin/series/:id` | admin | port | 200 + `Series` |
| DELETE | `/admin/series/:id` | admin | port | 204 |
| PUT | `/admin/series/:id/article-order` | admin | **defer to Plan E** | Same reason as book: requires full article service |

## Architectural Decisions

### Reuse of Plan C Template

Every architectural decision from Plan C carries over:

- Same domain-layer file split (`types.ts`, `repo.ts`, `service.ts`, `index.ts`)
- Same snake↔camel mapping pattern in `repo.ts` (column projection map for SELECT, `toRow` helper for INSERT/UPDATE)
- Same `BusinessError.from("SERIES_*")` flow with Korean messages from the Kotlin `ErrorCode` enum
- Same namespaced barrel re-export style (`seriesFindAll`, `seriesFindById`, etc.)
- Same `zValidator` + local `validationErrorMessage` helper in the route (no shared middleware extraction yet)
- Same `c.json({ data })` / `c.json({ message }, status)` envelope
- Same `bun:test` integration tests with raw drizzle inserts in `beforeEach` after `resetDb()`

### Schema.ts Edit (one line)

`series.id` is currently `bigserial({ mode: "bigint" })` from the introspect output. Widen it to `mode: "number"` to keep all numeric IDs consistent, exactly as Plan C did for `books.id`.

### Article Stub Expansion

`domains/articles/repo.ts` already exports `findVisibleByBookId` and `findAllByBookId` from Plan C. This plan adds two more functions and updates the barrel:

```ts
// Added to repo.ts:
export async function findVisibleBySeriesId(seriesId: number): Promise<Article[]>
export async function findAllBySeriesId(seriesId: number): Promise<Article[]>

// Added to index.ts:
export {
  findVisibleByBookId as articlesFindVisibleByBookId,
  findAllByBookId as articlesFindAllByBookId,
  findVisibleBySeriesId as articlesFindVisibleBySeriesId,  // NEW
  findAllBySeriesId as articlesFindAllBySeriesId,           // NEW
} from "./repo";
```

`findVisibleBySeriesId` filters to `VISIBLE_STATUSES` (PUBLIC + LOCKED). `findAllBySeriesId` returns everything sorted by `order_in_series`. Plan E will eventually replace these with proper service-layer functions, but the API surface stays compatible.

### Zod Schemas (`types.ts`)

```ts
export const SeriesRequestSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable().default(null),
  thumbnailUrl: z.string().nullable().default(null),
});

export type SeriesRequest = z.infer<typeof SeriesRequestSchema>;

export type Series = SeriesRequest & {
  id: number;
  createdAt: string;
  updatedAt: string;
};
```

Significantly simpler than `BookRequestSchema` — no dates, no rating, no author/publisher/isbn.

### Service Behavior

```ts
findAll(): Promise<Series[]>
findById(id: number): Promise<Series>          // throws SERIES_NOT_FOUND
findBySlug(slug: string): Promise<Series>      // throws SERIES_NOT_FOUND
create(req: SeriesRequest): Promise<Series>    // throws SERIES_SLUG_DUPLICATE if slug taken
update(id, req): Promise<Series>               // 404 if missing; SLUG_DUPLICATE if slug changed AND already taken
deleteSeries(id: number): Promise<void>        // throws SERIES_NOT_FOUND if missing
```

Same exact shape as book service — just named for series. Local function `deleteSeries` to avoid the `delete` reserved word, mirroring `deleteBook`.

### ErrorCode Additions

```ts
SERIES_NOT_FOUND: { status: 404, message: "시리즈를 찾을 수 없습니다" },
SERIES_SLUG_DUPLICATE: { status: 400, message: "이미 사용 중인 시리즈 slug입니다" },
```

Korean strings match the Kotlin `ErrorCode` enum verbatim.

### Routes

**`apps/api-next/apps/blog/src/routes/series.ts`**:
- `GET /` → `seriesFindAll()` then per-row `articlesFindVisibleBySeriesId(s.id)` for `articleCount`. N+1 mirrors Kotlin.
- `GET /:slug` → `seriesFindBySlug(slug)` then `articlesFindVisibleBySeriesId(s.id)`, returns `{ series, articles }`.

**`apps/api-next/apps/admin/src/routes/series.ts`**:
- `GET /` → `seriesFindAll()`
- `GET /:id` → `seriesFindById(id)` + `articlesFindAllBySeriesId(id)`
- `POST /` → `zValidator("json", SeriesRequestSchema)` → `seriesCreate(req)` → `c.json({ data }, 201)`
- `PUT /:id` → param coerce + body validate → `seriesUpdate(id, req)`
- `DELETE /:id` → `seriesDelete(id)` → `c.body(null, 204)`

Shared `validationErrorMessage` helper is duplicated locally in this route file (same as Plan C). Extraction still deferred per Plan A Out of Scope.

### Wire-up

- `apps/api-next/apps/blog/src/app.ts`: `app.route("/series", seriesRoute)` after the existing `/books` mount.
- `apps/api-next/apps/admin/src/app.ts`: `app.route("/admin/series", seriesAdminRoute)` after the existing `/admin/books` mount.

### Core Barrel Updates

```ts
// Append to packages/core/src/index.ts after the books exports:
export {
  SeriesRequestSchema,
  type SeriesRequest,
  type Series,
  seriesFindAll,
  seriesFindById,
  seriesFindBySlug,
  seriesCreate,
  seriesUpdate,
  seriesDelete,
} from "./domains/series";

// And update the existing articles re-export block to include the two new functions:
export {
  type Article,
  type ArticleStatus,
  VISIBLE_STATUSES,
  articlesFindVisibleByBookId,
  articlesFindAllByBookId,
  articlesFindVisibleBySeriesId,  // NEW
  articlesFindAllBySeriesId,       // NEW
} from "./domains/articles";
```

## Test Plan (TDD)

### `apps/api-next/apps/admin/test/series.test.ts` — ~14 cases

`beforeEach`: `await resetDb()`.

For each test that needs a series, insert via raw drizzle in the test setup (no service call).

1. `POST /admin/series` valid → 201 + `Series` with populated `id`/timestamps.
2. `POST /admin/series` duplicate slug → 400 with the SERIES_SLUG_DUPLICATE message.
3. `POST /admin/series` missing title → 400.
4. `GET /admin/series` empty → `{ data: [] }`.
5. `GET /admin/series` with 2 series seeded → both returned.
6. `GET /admin/series/:id` valid → `{ data: { series, articles: [] } }`.
7. `GET /admin/series/:id` with mixed-status articles → all returned, sorted by `orderInSeries`.
8. `GET /admin/series/:id` 404 → `{ message: "시리즈를 찾을 수 없습니다" }`.
9. `PUT /admin/series/:id` valid → `updatedAt > createdAt`.
10. `PUT /admin/series/:id` re-saving same slug → 200.
11. `PUT /admin/series/:id` slug taken by another → 400.
12. `PUT /admin/series/:id` 404 → SERIES_NOT_FOUND.
13. `DELETE /admin/series/:id` → 204; subsequent GET returns 404.
14. `DELETE /admin/series/:id` 404 → SERIES_NOT_FOUND.
15. All endpoints 401 without JWT (single combined test).

### `apps/api-next/apps/blog/test/series.test.ts` — 4 cases

1. `GET /series` empty → `{ data: [] }`.
2. `GET /series` with 2 series, one with 2 visible + 2 hidden articles, one with no articles → counts are `2` and `0`.
3. `GET /series/:slug` returns `{ series, articles }` filtered to visible (PUBLIC + LOCKED) only.
4. `GET /series/:slug` unknown slug → 404 SERIES_NOT_FOUND.

## Plan D Deliverables

1. `errors.ts` extended with `SERIES_NOT_FOUND` and `SERIES_SLUG_DUPLICATE`
2. `schema.ts` `series.id` widened to `mode: "number"`
3. `domains/articles/{repo,index}.ts` extended with `findVisibleBySeriesId` and `findAllBySeriesId` (no new files, just appends to existing)
4. `domains/series/{types,repo,service,index}.ts` created
5. `packages/core/src/index.ts` extended to re-export series + the two new article functions
6. `apps/admin/src/routes/series.ts` mounted at `/admin/series`
7. `apps/blog/src/routes/series.ts` mounted at `/series`
8. `apps/admin/test/series.test.ts` ~15 cases pass
9. `apps/blog/test/series.test.ts` 4 cases pass
10. `bunx turbo run lint` 5/5 (0 errors)
11. `bun run test` (root, serial) passes monorepo-wide
12. Manual smoke test: admin POST → GET round trip + blog public GET

## Plan D Non-Goals

- `PUT /admin/series/:id/article-order` — Plan E
- Full article domain — Plan E
- N+1 optimization on `GET /series` (preserved for Kotlin parity)
- `@api-next/core/middleware` extraction
- Renaming Plan B's settings exports to namespaced style
