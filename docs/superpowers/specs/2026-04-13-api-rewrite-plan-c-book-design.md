# API Rewrite — Plan C: Book Domain Design

**Date:** 2026-04-13
**Status:** Approved for planning
**Parent design:** `docs/superpowers/specs/2026-04-13-api-rewrite-design.md`
**Sibling:** `docs/superpowers/specs/2026-04-13-api-rewrite-plan-b-settings-design.md` (established the domain template)

## Goal

Port the `book` domain (7 endpoints) from Kotlin/Spring Boot to Hono/Drizzle. Includes the public reader endpoints in `api-blog-next` and the admin CRUD endpoints in `api-admin-next`. Defers the `PUT /admin/books/:id/article-order` endpoint to Plan E (article) because it requires the full article service.

This is the first plan with:

- **Two HTTP workspaces touched in one plan** (blog + admin), since book has both public and admin surfaces.
- **A cross-domain stub** — `domains/articles/` is created with read-only repo functions only; Plan E expands it.
- **Real CRUD** with slug-uniqueness business rules and 4xx error mapping.

## Endpoint Inventory

| Method | Path | App | Status | Notes |
|---|---|---|---|---|
| GET | `/books` | blog | port | Returns `BookWithArticleCount[]`; counts visible articles per book |
| GET | `/books/:slug` | blog | port | Returns `{ book, articles }`; `articles` filtered to visible |
| GET | `/admin/books` | admin | port | Returns `Book[]` |
| GET | `/admin/books/:id` | admin | port | Returns `{ book, articles }`; `articles` is full list sorted by `orderInBook` |
| POST | `/admin/books` | admin | port | 201 + `Book` |
| PUT | `/admin/books/:id` | admin | port | 200 + `Book` |
| DELETE | `/admin/books/:id` | admin | port | 204 |
| PUT | `/admin/books/:id/article-order` | admin | **defer to Plan E** | Manipulates articles via `ArticleService.update`; full article service required |

## Architectural Decisions

### Cross-Domain Dependency: Article Reader Stub

Book's read endpoints need to query the `articles` table to compute counts and return article lists. Two options were considered:

- **A. Inline article SQL inside `domains/books/repo.ts`** — keeps Plan C self-contained but couples book code to the article schema directly.
- **B. Create a minimal `domains/articles/` stub with only the two reader functions book needs** — ✅ **chosen**.

**Why B**: it puts article-related queries in the right place from the start. Plan E expands the same files (adds Zod schemas, write functions, service, route) without restructuring anything Plan C creates. Plan C's footprint inside `domains/articles/` is intentionally minimal:

```
packages/core/src/domains/articles/
├── types.ts      # Article TS type matching the schema row + ArticleStatus enum + VISIBLE_STATUSES constant
├── repo.ts       # findVisibleByBookId(bookId), findAllByBookId(bookId)
└── index.ts      # re-exports types + the two reader functions
```

No `service.ts` in Plan C — the readers are simple enough that the book service can call `findVisibleByBookId` directly.

### `domains/books/` File Structure

Identical template to Plan B's `domains/settings/`:

```
packages/core/src/domains/books/
├── types.ts      # Zod schemas: BookRequestSchema, inferred BookRequest + Book types
├── repo.ts       # findAll, findById, findBySlug, existsBySlug, insert, update, deleteById
├── service.ts    # findById/Slug (404), create/update (slug dup), delete
└── index.ts      # public surface; repo NOT re-exported
```

### Zod Schemas

Mirrors Kotlin `BookRequest` (POST and PUT use the same body shape):

```ts
export const BookRequestSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  author: z.string().min(1),
  publisher: z.string().nullable().default(null),
  thumbnailUrl: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  isbn: z.string().nullable().default(null),
  readStartDate: z.string().date().nullable().default(null), // ISO "YYYY-MM-DD"
  readEndDate: z.string().date().nullable().default(null),
  rating: z.number().int().min(1).max(5).nullable().default(null),
});

export type BookRequest = z.infer<typeof BookRequestSchema>;

export type Book = BookRequest & {
  id: number;
  createdAt: string;
  updatedAt: string;
};
```

Date fields use ISO date strings (`YYYY-MM-DD`) to match Postgres `DATE` columns and avoid Date-vs-string ambiguity at the JSON boundary. The drizzle schema declares them as `date()` columns; we let drizzle return them as strings (default for `date()`).

`rating` is `1..5` based on inspection of admin frontend usage; if Kotlin allows other ranges this constraint is tighter than legacy. Frontend already enforces 1–5 in its UI so this is a safe tightening.

### Service Behavior

```ts
// All in domains/books/service.ts (local names, before barrel rename)
findAll(): Promise<Book[]>
findById(id: number): Promise<Book>             // throws BusinessError.from("BOOK_NOT_FOUND")
findBySlug(slug: string): Promise<Book>         // throws BusinessError.from("BOOK_NOT_FOUND")
create(req: BookRequest): Promise<Book>         // throws BusinessError.from("BOOK_SLUG_DUPLICATE") if slug taken
update(id: number, req: BookRequest): Promise<Book>  // 404 if missing; SLUG_DUPLICATE if slug changed AND already taken
deleteBook(id: number): Promise<void>           // throws BOOK_NOT_FOUND if missing; named deleteBook to avoid `delete` reserved-word issues
```

`updatedAt` is set in the service via `new Date().toISOString()` on each update, mirroring the Kotlin manual `updatedAt = LocalDateTime.now()`. `createdAt` is set on insert via the same call.

The slug check on `update` mirrors Kotlin: only validates uniqueness if the slug is actually changing. Re-saving the same slug on the same row is allowed.

### ErrorCode Additions

`@api-next/core/errors.ts`:

```ts
export const ErrorCode = {
  UNAUTHORIZED: { status: 401, message: "Unauthorized" },
  INTERNAL: { status: 500, message: "Internal server error" },
  BOOK_NOT_FOUND: { status: 404, message: "책을 찾을 수 없습니다" },
  BOOK_SLUG_DUPLICATE: { status: 400, message: "이미 사용 중인 책 slug입니다" },
} as const;
```

Korean error messages match the Kotlin `ErrorCode` enum verbatim so the cutover is invisible to the frontend, which displays whatever `message` it receives.

### Routes

**`apps/api-next/apps/blog/src/routes/books.ts`**:

- `GET /` → maps `findAll()` results to `BookWithArticleCount[]` by issuing one `findVisibleByBookId(book.id)` per book and taking `.length`. N+1 query pattern matching Kotlin's behavior; optimization deferred (Plan G or later).
- `GET /:slug` → `findBySlug(slug)` then `findVisibleByBookId(book.id)`, returns `{ book, articles }`.

**`apps/api-next/apps/admin/src/routes/books.ts`**:

- `GET /` → `findAll()`
- `GET /:id` → `findById(id)` then `findAllByBookId(id)` (sorted by `orderInBook` from the repo), returns `{ book, articles }`.
- `POST /` → `zValidator("json", BookRequestSchema)` → `create(req)` → `c.json({ data }, 201)`.
- `PUT /:id` → param coerce + `zValidator("json", BookRequestSchema)` → `update(id, req)`.
- `DELETE /:id` → `delete(id)` → `c.body(null, 204)`.

Path params are coerced to numbers via `z.coerce.number().int()` validation (or a small helper). Invalid IDs (e.g. `/books/abc`) return 400 with the Plan B envelope shape.

`zValidator` error hook is the same `validationErrorMessage` helper from Plan B's `routes/settings.ts`. **For now, copy-paste the helper into the new route files.** Plan B noted that extraction to `@api-next/core/middleware` is deferred until real divergence — this plan does not change that decision.

### Wire-up

- `apps/api-next/apps/blog/src/app.ts`: `app.route("/books", booksRoute)` after the existing `/health`.
- `apps/api-next/apps/admin/src/app.ts`: `app.route("/admin/books", booksAdminRoute)` after the existing `/admin/settings`.

### Core Barrel Updates

`packages/core/src/index.ts` adds:

```ts
// Inside the book service.ts the functions are named locally as findAll, findById,
// findBySlug, create, update, deleteBook. The domain barrel (domains/books/index.ts)
// re-exports them with the `book` prefix so the core barrel surface stays
// collision-free across many future domains.

// In domains/books/index.ts:
export {
  findAll as bookFindAll,
  findById as bookFindById,
  findBySlug as bookFindBySlug,
  create as bookCreate,
  update as bookUpdate,
  deleteBook as bookDelete,
} from "./service";
export { BookRequestSchema, type BookRequest, type Book } from "./types";

// In domains/articles/index.ts:
export {
  findVisibleByBookId as articlesFindVisibleByBookId,
  findAllByBookId as articlesFindAllByBookId,
} from "./repo";
export { type Article, type ArticleStatus, VISIBLE_STATUSES } from "./types";

// Then packages/core/src/index.ts simply re-exports both barrels:
export * from "./domains/books";
export * from "./domains/articles";
```

The local function name `deleteBook` (not `delete`) avoids clashing with the JavaScript reserved word when used in non-method position. Function names are namespaced with the domain prefix at the barrel layer to avoid future collisions across many domains in a flat barrel. This deviates from Plan B's `getSiteSettings` style but is forward-looking — by Plan G or H the barrel would have collisions otherwise.

Plan B's existing exports (`getSiteSettings` etc.) are NOT renamed in this plan. Renaming is a separate refactor, deferrable until the collision actually happens.

## Test Plan (TDD)

Two test files are written first (red phase) and go green incrementally as Tasks add the domain layer and routes.

### `apps/api-next/apps/admin/test/books.test.ts` — ~12 cases

`beforeEach`: `await resetDb()` — uses Plan B's helper.

For each test that needs a book, insert via raw drizzle in the test setup (no service call) so we test reads independently from writes.

1. `POST /admin/books` with valid body → 201 + Book in response, `id` populated, timestamps populated.
2. `POST /admin/books` with duplicate slug → 400 `{ message: "이미 사용 중인 책 slug입니다" }`.
3. `POST /admin/books` with missing required field (e.g. no `title`) → 400 with `{ message }` from Zod.
4. `GET /admin/books` empty → `{ data: [] }`.
5. `GET /admin/books` with 2 books seeded → `{ data: [book1, book2] }` (order: insertion).
6. `GET /admin/books/:id` valid id → `{ data: { book, articles: [] } }` (no articles in DB).
7. `GET /admin/books/:id` valid id with articles → articles array populated, sorted by `orderInBook`.
8. `GET /admin/books/:id` missing id → 404 `{ message: "책을 찾을 수 없습니다" }`.
9. `PUT /admin/books/:id` valid → 200 + updated Book; `updatedAt` strictly later than the inserted value.
10. `PUT /admin/books/:id` with same slug as another existing book → 400 BOOK_SLUG_DUPLICATE.
11. `PUT /admin/books/:id` re-saving same slug (no change) → 200 (no false-positive duplicate error).
12. `PUT /admin/books/:id` 404 → BOOK_NOT_FOUND.
13. `DELETE /admin/books/:id` valid → 204, `GET` confirms gone.
14. `DELETE /admin/books/:id` 404 → BOOK_NOT_FOUND.
15. All endpoints return 401 without JWT (one combined test asserts each method/path).

### `apps/api-next/apps/blog/test/books.test.ts` — ~5 cases

`beforeEach`: `await resetDb()`.

The blog app currently has no test file using `resetDb()` — Plan C is the first. This is fine because `apps/blog/.env.test` already exists (symlinked) and `@api-next/core/test-helpers` resolves from blog the same way it does from admin.

1. `GET /books` empty → `{ data: [] }`.
2. `GET /books` with 2 books seeded (one with 3 visible articles, one with 0 articles) → returns `BookWithArticleCount[]` with correct counts.
3. `GET /books/:slug` valid → `{ data: { book, articles } }` where articles only includes status `PUBLIC` and `LOCKED`.
4. `GET /books/:slug` with both visible AND hidden articles seeded — verifies that `DRAFT` and `PRIVATE` articles are filtered out of the response.
5. `GET /books/:slug` non-existent slug → 404 BOOK_NOT_FOUND.

Test fixtures are inserted via raw drizzle: `db.insert(schema.books).values({...})` and `db.insert(schema.articles).values({...})`. The articles inserts touch the schema directly without going through any service, which is appropriate for stub-level Plan C scope.

## Plan C Deliverables

On completion:

1. `packages/core/src/domains/articles/{types,repo,index}.ts` exist with read-only stub.
2. `packages/core/src/domains/books/{types,repo,service,index}.ts` exist with the full CRUD layer above.
3. `packages/core/src/errors.ts` has `BOOK_NOT_FOUND` and `BOOK_SLUG_DUPLICATE` entries.
4. `packages/core/src/index.ts` re-exports both new domain surfaces with namespaced names.
5. `apps/api-next/apps/blog/src/routes/books.ts` exists, mounted in `app.ts`.
6. `apps/api-next/apps/admin/src/routes/books.ts` exists, mounted in `app.ts`.
7. `apps/api-next/apps/admin/test/books.test.ts` covers ~15 cases and all pass.
8. `apps/api-next/apps/blog/test/books.test.ts` covers ~5 cases and all pass.
9. `bunx turbo run lint` passes on all 5 workspaces (zero errors).
10. `NODE_ENV=test bunx turbo run test` passes monorepo-wide.
11. Manual smoke test: `curl` against running blog and admin servers exercises GET/POST/PUT/DELETE round-trip with a JWT for admin.

## Plan C Non-Goals

- `PUT /admin/books/:id/article-order` — Plan E.
- Full article domain (write functions, schemas, service, routes) — Plan E.
- Pagination, search, filter — Kotlin doesn't have them either.
- N+1 query optimization on `GET /books` — preserved as N+1 to match Kotlin behavior; future optimization plan.
- `@api-next/core/middleware` extraction (still deferred per Plan A spec).
- `hono-pino` migration.
- Renaming Plan B's settings export functions to namespaced style — separate refactor when collisions actually happen.
