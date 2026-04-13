# API Rewrite — Plan E: Article Domain Design

**Date:** 2026-04-13
**Status:** Approved for planning
**Parent design:** `docs/superpowers/specs/2026-04-13-api-rewrite-design.md`
**Recovers:** `PUT /admin/books/:id/article-order` (deferred from Plan C) and `PUT /admin/series/:id/article-order` (deferred from Plan D)

## Goal

Port the Kotlin `article` domain — the largest and most central domain in the system. Article is the first plan that introduces:

- Pagination (Spring Data `Page<T>` shape, `?page=&size=`)
- Multi-state authorization (DRAFT/PUBLIC/LOCKED/PRIVATE with password gating on LOCKED)
- Cross-domain neighbor queries (prev/next article by 3 modes)
- Recovery of two endpoints deferred from earlier plans

This plan also expands the `domains/articles/` stub created in Plan C and extended in Plan D from a 4-function read-only module into a full domain with service layer, write functions, neighbor queries, and routes in both blog and admin apps.

## Endpoint Inventory

| Method | Path | App | Status | Notes |
|---|---|---|---|---|
| GET | `/articles?filter=&page=&size=` | blog | port | `Page<Article>`, VISIBLE only, filter ∈ `all\|series\|book\|standalone` |
| GET | `/articles/:slug?password=` | blog | port | Single article; LOCKED requires password |
| GET | `/articles/:slug/neighbors?series=&book=` | blog | port | Prev/next, 3 modes |
| GET | `/admin/articles?page=&size=` | admin | port | `Page<Article>`, all statuses |
| GET | `/admin/articles/:id` | admin | port | Single article (any status) |
| POST | `/admin/articles` | admin | port | 201 + `Article` |
| PUT | `/admin/articles/:id` | admin | port | 200 + `Article` |
| DELETE | `/admin/articles/:id` | admin | port | 204 |
| PUT | `/admin/books/:id/article-order` | admin | **recover (Plan C deferred)** | Reorders articles within a book |
| PUT | `/admin/series/:id/article-order` | admin | **recover (Plan D deferred)** | Reorders articles within a series |

## Architectural Decisions

### Image Processing — NO-OP for Plan E

The Kotlin `ArticleService.create/update` calls `ArticleDomainService.processNewImages(content, articleId)`, which rewrites markdown image URLs from temp paths to permanent paths via `ImageStorage`. `ImageStorage` is a separate domain handled by Plan J.

**Decision**: Plan E's article create/update stores `content` exactly as received from the request — no URL rewriting, no image cleanup on update or delete. The Kotlin admin API still owns image upload during the rewrite period (frontend points at it until cutover), so any newly uploaded images go through the existing Kotlin path. Plan J restores the rewriting hook before cutover.

This means the new Plan E article create/update endpoints are functional but not used in production until after Plan J completes and cutover happens (Plan K).

### Cache (Spring CacheManager / Redis) — Skipped

The Kotlin service caches `findById` and `findVisibleOnBlog` via Spring's `CacheManager`. Plan E does not introduce any caching. Performance during the rewrite is fine because dev DB is local and traffic against the new API is zero (still serving from Kotlin). A future plan (likely Plan G when analytics introduces Redis) can add a caching layer if desired.

### Pagination Shape — Spring Data `Page<T>` Mirror

Spring Data emits this JSON shape:

```json
{
  "content": [...],
  "pageable": {...},
  "totalElements": 42,
  "totalPages": 5,
  "number": 0,
  "size": 10,
  "first": true,
  "last": false,
  "numberOfElements": 10,
  "empty": false,
  "sort": {...}
}
```

The frontend almost certainly only consumes a subset. Plan E mirrors the **load-bearing** subset to keep the cutover invisible:

```ts
type Page<T> = {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;       // 0-based current page
  size: number;
  first: boolean;
  last: boolean;
  empty: boolean;
};
```

Fields like `pageable`, `numberOfElements`, and `sort` are omitted; if a frontend bug surfaces during smoke testing those fields can be added back.

The shape lives in a new shared util `packages/core/src/pagination.ts` so future paginated domains reuse it.

### Sort Param Handling — Default Only

Spring Data also accepts `?sort=publishedAt,desc` syntax. Implementing this cleanly in drizzle requires a column-name allowlist and direction parser. To keep Plan E focused, the new routes ignore the client-provided `sort` param and always use the default sort:

- Public `/articles`: `published_at DESC`
- Admin `/admin/articles`: `created_at DESC`

If a frontend smoke test reveals the frontend actually passes `sort=`, we'll add a minimal allowlist as a follow-up.

### ArticleStatus and Visibility Rules

```ts
type ArticleStatus = "DRAFT" | "PUBLIC" | "LOCKED" | "PRIVATE";

// Visible on blog: PUBLIC and LOCKED. DRAFT and PRIVATE are admin-only.
const VISIBLE_STATUSES: ArticleStatus[] = ["PUBLIC", "LOCKED"]; // unchanged from Plan C
```

`findBySlugForBlog(slug, password)` rules (mirrors Kotlin):

- Article not found by slug → `ARTICLE_NOT_FOUND` (404)
- Article exists but `status === DRAFT || status === PRIVATE` → `ARTICLE_NOT_FOUND` (404, not 403, to hide existence)
- Article is LOCKED:
  - `password == null && article.password != null` → `ARTICLE_PASSWORD_REQUIRED` (403)
  - `password !== article.password` → `ARTICLE_PASSWORD_INCORRECT` (403)
  - else → returned
- PUBLIC → returned

### publishedAt Auto-Set

Mirrors Kotlin verbatim:

- **create**: if `status` is `PUBLIC` or `LOCKED`, set `publishedAt = now()`. Otherwise `publishedAt = null`.
- **update**: if previously not visible (`DRAFT|PRIVATE`) AND new status is visible (`PUBLIC|LOCKED`) AND `publishedAt == null`, set `publishedAt = now()`. Otherwise leave `publishedAt` unchanged.
- `updatedAt = now()` always on update.

### Slug Uniqueness

Same pattern as book/series:

- create → `existsBySlug(slug)` → if true, throw SLUG_DUPLICATE
- update → only check if `req.slug !== existing.slug`, then `existsBySlugExcludingId(slug, id)`

### Filter Parameter (Public List)

`?filter=` accepts:

- `all` (default) → all visible articles
- `series` → articles where `series_id IS NOT NULL` AND visible
- `book` → articles where `book_id IS NOT NULL` AND visible
- `standalone` → articles where `series_id IS NULL AND book_id IS NULL` AND visible

Anything else (or omitted) defaults to `all`.

### Neighbor Query (3 Modes)

`/articles/:slug/neighbors?series=&book=` — the optional query params (just markers, values not used) determine which mode:

- `?series=...` AND `article.seriesId != null` → in-series mode (prev/next by `orderInSeries`)
- `?book=...` AND `article.bookId != null` → in-book mode (prev/next by `orderInBook`)
- otherwise → publishedAt mode (prev/next by `publishedAt`)

Each mode returns `{ previous: Neighbor | null, next: Neighbor | null }` where `Neighbor = { id, title, slug }`. All three modes filter to `VISIBLE_STATUSES` and exclude the current article id.

### File Structure

```
packages/core/src/
├── pagination.ts                         # NEW: Page<T> type + tiny helper
├── errors.ts                             # +4 ARTICLE_* entries
├── domains/articles/
│   ├── types.ts                          # MODIFY: +ArticleRequestSchema (Zod), +Neighbor types, +Page<Article>
│   ├── repo.ts                           # MODIFY: +8 functions (paginated list, filter, by id/slug, exists*, insert, update, delete, neighbors)
│   ├── service.ts                        # NEW: domain logic, password gating, publishedAt auto-set, neighbor dispatch
│   └── index.ts                          # MODIFY: +new function re-exports with article* prefix
└── index.ts                              # MODIFY: +re-export article public surface

apps/api-next/apps/
├── admin/
│   ├── src/
│   │   ├── app.ts                        # +mount /admin/articles
│   │   └── routes/
│   │       ├── articles.ts               # NEW: 5 admin handlers
│   │       ├── books.ts                  # MODIFY: +article-order handler
│   │       └── series.ts                 # MODIFY: +article-order handler
│   └── test/
│       ├── articles.test.ts              # NEW: ~16 admin TDD cases
│       ├── books.test.ts                 # MODIFY: +article-order test cases
│       └── series.test.ts                # MODIFY: +article-order test cases
└── blog/
    ├── src/
    │   ├── app.ts                        # +mount /articles
    │   └── routes/
    │       └── articles.ts               # NEW: 3 public handlers
    └── test/
        └── articles.test.ts              # NEW: ~14 public TDD cases
```

### Domain-Layer File Responsibilities

- **types.ts**: Zod schemas (ArticleRequestSchema with 9 fields), inferred `ArticleRequest` and full `Article` type. Plus `ArticleNeighbor` and `ArticleNeighbors` types. The existing `ArticleStatus` and `VISIBLE_STATUSES` from Plan C stay untouched.
- **repo.ts**: pure drizzle queries. Existing 4 reader functions (`findVisibleByBookId`, `findAllByBookId`, `findVisibleBySeriesId`, `findAllBySeriesId`) remain. New: `findAllPaginated`, `findVisibleByFilterPaginated`, `findById`, `findBySlug`, `existsBySlug`, `existsBySlugExcludingId`, `insert`, `update`, `deleteById`, `findNeighborInBook`, `findNeighborInSeries`, `findNeighborByPublishedAt`. The neighbor functions return `{ previous, next }` directly.
- **service.ts**: domain logic. Wraps repo, applies the visibility/password rules, the publishedAt auto-set, the slug-duplicate rules, and the neighbor dispatch. Throws `BusinessError.from("ARTICLE_*")` for business failures.
- **index.ts**: barrel. Existing 4 article*By(Book|Series) re-exports from Plan C/D stay. New service functions exported under `article` prefix: `articleFindAll`, `articleFindBySlug`, `articleFindById`, `articleFindBySlugForBlog`, `articleFindVisibleByFilter`, `articleFindNeighbors`, `articleCreate`, `articleUpdate`, `articleDelete`. `repo.ts` is not re-exported.

### Route Files

**`apps/admin/src/routes/articles.ts`** — 5 handlers using `zValidator`. Body schema is `ArticleRequestSchema`. Local `validationErrorMessage` helper (same as Plan B/C/D).

**`apps/blog/src/routes/articles.ts`** — 3 handlers. Query param parsing for `page`/`size`/`filter` uses `zValidator("query", ...)`. The `:slug?password=` endpoint reads `c.req.query("password")`.

**`apps/admin/src/routes/books.ts`** — extended with `PUT /:id/article-order`. Body schema:

```ts
const ArticleOrderRequestSchema = z.object({
  articleIds: z.array(z.number().int().positive()),
});
```

The handler:
1. Verifies the book exists (`bookFindById(bookId)` — throws BOOK_NOT_FOUND if missing)
2. For each `articleId` in the request, in order:
   - `articleFindById(articleId)` to get the current article
   - `articleUpdate(articleId, { ...article, bookId, orderInBook: index + 1 })` to set the new ordering
3. Returns `{ data: "Article order updated successfully" }` to match the legacy Kotlin response

**`apps/admin/src/routes/series.ts`** — extended with the analogous `PUT /:id/article-order`.

### Wire-up

- `apps/blog/src/app.ts`: `app.route("/articles", articlesRoute)` after the existing `/series` mount.
- `apps/admin/src/app.ts`: `app.route("/admin/articles", articlesAdminRoute)` after the existing `/admin/series` mount.

### Core Barrel Updates

```ts
// New article exports (added to packages/core/src/index.ts):
export {
  ArticleRequestSchema,
  type ArticleRequest,
  type Article,
  type ArticleStatus,
  type ArticleNeighbor,
  type ArticleNeighbors,
  VISIBLE_STATUSES,
  // existing 4 reader functions (unchanged):
  articlesFindVisibleByBookId,
  articlesFindAllByBookId,
  articlesFindVisibleBySeriesId,
  articlesFindAllBySeriesId,
  // new service functions:
  articleFindAll,
  articleFindById,
  articleFindBySlug,
  articleFindBySlugForBlog,
  articleFindVisibleByFilter,
  articleFindNeighbors,
  articleCreate,
  articleUpdate,
  articleDelete,
} from "./domains/articles";

export { type Page } from "./pagination";
```

The existing standalone articles re-export block from Plan D is collapsed into this single block; the Article type and status enum are now imported from this expanded barrel rather than the old narrower one.

## Test Plan (TDD)

### `apps/api-next/apps/admin/test/articles.test.ts` — ~16 cases

`beforeEach`: `await resetDb()`. Helpers `seedArticle({...})` build inserts via raw drizzle. Mints JWTs the same way Plan B/C/D tests do.

1. POST valid body, status DRAFT → 201, response has `id`, timestamps, `publishedAt: null`
2. POST valid body, status PUBLIC → 201, `publishedAt` is non-null
3. POST duplicate slug → 400 ARTICLE_SLUG_DUPLICATE
4. POST missing required field (e.g. content) → 400 (Zod)
5. GET `/admin/articles` empty → `{ data: { content: [], totalElements: 0, totalPages: 0, number: 0, size: 10, first: true, last: true, empty: true } }`
6. GET `/admin/articles` with 25 seeded articles → page 0 has 10, totalElements 25, totalPages 3
7. GET `/admin/articles?page=2&size=10` → 5 elements, last: true
8. GET `/admin/articles/:id` valid → returns article
9. GET `/admin/articles/:id` 404 → ARTICLE_NOT_FOUND
10. PUT `/admin/articles/:id` valid → updatedAt > previous, fields applied
11. PUT slug change to existing → 400 ARTICLE_SLUG_DUPLICATE
12. PUT same slug as self → 200 (no false-positive duplicate)
13. PUT DRAFT→PUBLIC sets publishedAt for the first time
14. PUT 404
15. DELETE valid → 204; subsequent GET 404
16. DELETE 404
17. 401 without JWT (combined test for all 5 endpoints)

### `apps/api-next/apps/blog/test/articles.test.ts` — ~14 cases

`beforeEach`: `await resetDb()`. Seeds via raw drizzle.

1. GET `/articles` empty → page with 0 elements
2. GET `/articles` with mix of visible/hidden → only visible returned, sorted publishedAt desc
3. GET `/articles?filter=series` → only articles with non-null seriesId
4. GET `/articles?filter=book` → only articles with non-null bookId
5. GET `/articles?filter=standalone` → only articles with both null
6. GET `/articles/:slug` PUBLIC → returns article
7. GET `/articles/:slug` DRAFT → 404 ARTICLE_NOT_FOUND
8. GET `/articles/:slug` PRIVATE → 404 ARTICLE_NOT_FOUND
9. GET `/articles/:slug` LOCKED, no password → 403 ARTICLE_PASSWORD_REQUIRED
10. GET `/articles/:slug?password=wrong` LOCKED → 403 ARTICLE_PASSWORD_INCORRECT
11. GET `/articles/:slug?password=correct` LOCKED → returns article
12. GET `/articles/:slug/neighbors` standalone (publishedAt mode) → prev/next by published_at
13. GET `/articles/:slug/neighbors?series=x` (series mode) → prev/next by order_in_series
14. GET `/articles/:slug/neighbors?book=x` (book mode) → prev/next by order_in_book
15. GET `/articles/non-existent` → 404

### Modifications to existing `apps/admin/test/books.test.ts`

Add 2 cases at the end of the existing describe:

- `PUT /admin/books/:id/article-order` with valid body → 200 + success message; subsequent `GET /admin/books/:id` returns articles in the new order
- `PUT /admin/books/:id/article-order` for missing book → 404 BOOK_NOT_FOUND

### Modifications to existing `apps/admin/test/series.test.ts`

Add 2 mirror cases for `PUT /admin/series/:id/article-order`.

## Plan E Deliverables

1. `errors.ts` extended with 4 ARTICLE_* entries
2. `pagination.ts` created in core with `Page<T>` type and helper
3. `domains/articles/types.ts` extended with `ArticleRequestSchema`, neighbor types, plus the existing TS Article type intact
4. `domains/articles/repo.ts` extended with 12 new functions (paginated list, filter list, by id/slug, exists, insert, update, delete, neighbors × 3)
5. `domains/articles/service.ts` created with the full domain logic
6. `domains/articles/index.ts` extended with `article*` namespaced exports
7. Core barrel re-exports updated to expose the article surface
8. `apps/admin/src/routes/articles.ts` mounted at `/admin/articles`
9. `apps/blog/src/routes/articles.ts` mounted at `/articles`
10. `apps/admin/src/routes/books.ts` extended with `PUT /:id/article-order`
11. `apps/admin/src/routes/series.ts` extended with `PUT /:id/article-order`
12. `apps/admin/test/articles.test.ts` 16 cases pass
13. `apps/blog/test/articles.test.ts` 14 cases pass
14. `apps/admin/test/books.test.ts` extended with 2 article-order cases, all passing
15. `apps/admin/test/series.test.ts` extended with 2 article-order cases, all passing
16. `bunx turbo run lint` 5/5 (0 errors)
17. `bun run test` (root, serial) 4/4
18. Manual smoke test: admin POST → GET round trip + blog public list/filter/neighbors round trip

## Plan E Non-Goals

- **Image processing** (`processNewImages`, `cleanupDeletedImages`, `cleanupAllImages`) — Plan J
- **Caching** (Spring CacheManager / Redis) — separate plan, possibly Plan G
- **Sort parameter parsing** — defaults only; future enhancement
- **Full Spring Data Page shape** (pageable, numberOfElements, sort sub-object) — minimum subset only
- `@api-next/core/middleware` extraction — still deferred
- `hono-pino` — still deferred
- Renaming Plan B's settings exports — separate refactor
