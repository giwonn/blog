# API Rewrite — Plan I: Sidebar Design

**Date:** 2026-04-13
**Status:** Approved for planning
**Parent design:** `docs/superpowers/specs/2026-04-13-api-rewrite-design.md`
**Depends on:** Plan F (popular articles), Plan H (comments), Plan G2 (visitor summary)

## Goal

Port the 3 public sidebar endpoints from Kotlin. All dependencies are already in place — sidebar is a thin aggregator that calls existing `@api-next/core` functions.

## Endpoint Inventory

| Method | Path | Returns | Backed by |
|---|---|---|---|
| GET | `/sidebar/popular-articles` | `PopularArticle[]` (top 5, last 30 days) | `analyticsFindTopPages` (Plan F/G) |
| GET | `/sidebar/recent-comments` | `RecentComment[]` (top 5) | `commentsGetRecent` (Plan H) |
| GET | `/sidebar/visitors` | `VisitorSummary` | `analyticsGetVisitorSummary` (Plan G2) |

All public, no authentication, no query params.

## Architectural Decisions

### Pure Passthrough Route File

One file with 3 handlers, each ~5 lines, calling an existing core function. No new service layer, no new types, no new repo functions.

### Popular Articles — Mirror Dashboard Shape

The `/sidebar/popular-articles` response must match the existing `PopularArticle` shape that the blog frontend consumes (`{id, title, viewCount}`). The dashboard route in Plan F already computes this with the exact same logic: `analyticsFindTopPages(from, to)` + `.slice(0, 5)` + field rename `articleId → id`.

Plan I deliberately duplicates these 3 lines instead of extracting a shared helper:

- Only 2 usage sites (dashboard + sidebar)
- Helper would be 3 lines — barely a savings
- Inline is clearer than indirection for a tiny mapping

If a third usage appears, extract then.

### Response Envelopes — Exact Kotlin Parity

Kotlin responses:
- `/sidebar/popular-articles` → `ApiResponse<List<PopularArticle>>` → `{ "data": [...] }`
- `/sidebar/recent-comments` → `ApiResponse<List<RecentComment>>` → `{ "data": [...] }`
- `/sidebar/visitors` → `ApiResponse<VisitorSummary>` → `{ "data": { total, today, yesterday } }`

Plan I matches exactly.

### Error Handling

No new error codes. Each upstream function handles its own failures:

- `analyticsFindTopPages`: throws on DB failure → Plan A's global errorHandler returns 500
- `commentsGetRecent`: returns `[]` on any failure (Plan H design) → sidebar gets an empty array, user sees an empty recent-comments section instead of 500
- `analyticsGetVisitorSummary`: throws on DB/Redis failure → 500

This matches the existing behavior of each domain.

### Tests

`apps/blog/test/sidebar.test.ts` — integration tests using real DB + Redis + fetch mock:

1. **GET /sidebar/popular-articles empty** → 200 `{ data: [] }`
2. **GET /sidebar/popular-articles with seeded page_views** → sorted `PopularArticle[]` (id field matches article PK, sorted by viewCount desc)
3. **GET /sidebar/recent-comments (fetch mock success)** → 2 mapped `RecentComment` objects
4. **GET /sidebar/recent-comments (fetch mock 500)** → 200 `{ data: [] }` (Plan H fallback)
5. **GET /sidebar/visitors empty state** → 200 `{ data: { total: 0, today: 0, yesterday: 0 } }`
6. **GET /sidebar/visitors with Redis + daily_visitor_stats** → uses Redis for today, DB for historical total

Tests follow the Plan G2 pattern: `beforeEach` calls both `resetDb()` and `resetRedis()`, and also clears the Plan H comments in-memory cache by importing the `__clearCommentsCache` helper.

### File Structure

```
apps/api-next/apps/blog/
├── src/
│   ├── app.ts                             # +mount /sidebar
│   └── routes/
│       └── sidebar.ts                     # NEW: 3 handlers
└── test/
    └── sidebar.test.ts                    # NEW: 6 integration cases
```

No changes to `packages/core/` — all dependencies already exported.

## Plan I Deliverables

1. `apps/blog/src/routes/sidebar.ts` with 3 passthrough handlers
2. `apps/blog/src/app.ts` mounts `sidebarRoute` at `/sidebar`
3. `apps/blog/test/sidebar.test.ts` with 6 integration cases, all passing
4. `bunx turbo run lint` 5/5 (0 errors)
5. `bun run test` 4/4
6. Manual smoke test: seed data, curl all 3 endpoints, verify shapes

## Plan I Non-Goals

- No new core exports
- No new tests beyond the sidebar route
- No refactor of Plan F's dashboard popular-articles logic (duplication accepted)
- No changes to comments / analytics / visitor-counter functionality
- No authentication (sidebar is public)
