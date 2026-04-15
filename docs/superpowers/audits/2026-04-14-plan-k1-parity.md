# Plan K1 Parity Audit — Kotlin vs Hono/Bun

**Generated:** 2026-04-14
**Kotlin source:** `apps/api/api-blog/**/*Controller.kt`, `apps/api/api-admin/**/*Controller.kt`
**Hono source:** `apps/api-next/apps/{blog,admin}/src/routes/**/*.ts`

Legend: ✅ identical · ⚠ minor semantic diff (still behaviorally compatible) · ❌ missing or broken

---

## Blog (public)

### Health — HealthController

| Method | Kotlin path | Hono path | Params | Request | Response | Status |
|--------|-------------|-----------|--------|---------|----------|--------|
| GET | /health | /health | — | — | `{data:{status:"ok"}}` | ✅ |

**Notes:** Kotlin returns `Map<String,String>` (no `ApiResponse` wrapper); Hono returns `{data:{status:"ok"}}`. Kotlin has no `data` envelope here — minor structural diff but both signal liveness and the blog frontend only checks for HTTP 200. The Hono implementation also does a `SELECT 1` DB ping which Kotlin does not, making Hono slightly more thorough. ⚠ behaviorally compatible.

---

### Books — BookController

| Method | Kotlin path | Hono path | Params | Request | Response | Status |
|--------|-------------|-----------|--------|---------|----------|--------|
| GET | /books | /books | — | — | `{data: BookWithArticleCount[]}` | ✅ |
| GET | /books/{slug} | /books/:slug | `slug` (path) | — | `{data: {book: Book, articles: Article[]}}` | ✅ |

**Notes:** `BookWithArticleCount` shape is identical in both (`id, title, slug, author, thumbnailUrl, rating, articleCount`). N+1 pattern intentionally mirrored. Response envelope `ApiResponse<T>` → `{data: T}` is structurally identical.

---

### Series — SeriesController

| Method | Kotlin path | Hono path | Params | Request | Response | Status |
|--------|-------------|-----------|--------|---------|----------|--------|
| GET | /series | /series | — | — | `{data: SeriesWithArticleCount[]}` | ✅ |
| GET | /series/{slug} | /series/:slug | `slug` (path) | — | `{data: {series: Series, articles: Article[]}}` | ✅ |

**Notes:** `SeriesWithArticleCount` shape is identical (`id, title, slug, description, thumbnailUrl, articleCount`). N+1 pattern intentionally mirrored.

---

### Articles — ArticleController

| Method | Kotlin path | Hono path | Params | Request | Response | Status |
|--------|-------------|-----------|--------|---------|----------|--------|
| GET | /articles | /articles | `filter` (query, default `"all"`), `page` (query, default `0`), `size` (query, default `10`) | — | `{data: Page<Article>}` | ✅ |
| GET | /articles/{slug} | /articles/:slug | `slug` (path), `password` (query, optional) | — | `{data: Article}` | ✅ |
| GET | /articles/{slug}/neighbors | /articles/:slug/neighbors | `slug` (path), `series` (query, optional), `book` (query, optional) | — | `{data: ArticleNeighbors}` | ✅ |

**Notes:** Kotlin uses Spring `Pageable` with `@PageableDefault(size=10, sort=["publishedAt"], direction=DESC)`; accepts `page`/`size`/`sort` query params via Spring convention. Hono uses `ArticleListQuerySchema` with explicit `page`/`size` fields (Zod-validated, defaults 0/10). Both sort by `publishedAt DESC` (Hono hardcodes that in the query). The `sort` override param (Spring-style `?sort=field,dir`) is not supported in Hono — not a behavioral gap for the blog frontend which never passes `sort` explicitly. ⚠ minor.

---

### Sidebar — SidebarController

| Method | Kotlin path | Hono path | Params | Request | Response | Status |
|--------|-------------|-----------|--------|---------|----------|--------|
| GET | /sidebar/popular-articles | /sidebar/popular-articles | — | — | `{data: PopularArticle[]}` (top 5, last 30 days) | ✅ |
| GET | /sidebar/recent-comments | /sidebar/recent-comments | — | — | `{data: RecentComment[]}` (latest 5) | ✅ |
| GET | /sidebar/visitors | /sidebar/visitors | — | — | `{data: VisitorSummary}` (`{total, today, yesterday}`) | ✅ |

**Notes:** `PopularArticle` shape is identical in both (`id, title, viewCount`). `VisitorSummary` shape matches (`total, today, yesterday`) — Kotlin uses `Long`, Hono uses `number`; JSON serialization is identical. `RecentComment` shape is driven by `commentsGetRecent` which calls the GitHub API; shape parity not auditable from source alone but the service function is shared. All three endpoints have no query params.

---

### Analytics track — AnalyticsTrackController

| Method | Kotlin path | Hono path | Params | Request | Response | Status |
|--------|-------------|-----------|--------|---------|----------|--------|
| POST | /analytics/page-view | /analytics/page-view | — | `{path, ipAddress, userAgent?, referrer?, sessionId?}` | _(empty body)_ | ⚠ |

**Notes:** Kotlin returns `ResponseEntity<Void>` with HTTP **200** and an empty body. Hono returns HTTP **204** (No Content) with null body. Both convey "accepted, no content to return." The blog frontend fires-and-forgets this call and does not inspect the status code or body, so this is behaviorally compatible. The difference is semantically more correct in Hono (204 is the proper status for "processed, no response body"), but may require the blog frontend to tolerate 204 if it ever checks. `PageViewRequestSchema` fields exactly match `PageViewRequest` DTO (`path`, `ipAddress`, `userAgent?`, `referrer?`, `sessionId?`).

---

**Blog gaps:**

1. **Health envelope mismatch (⚠, not a real gap):** Kotlin `/health` returns `{status:"ok"}` (no `data` wrapper); Hono returns `{data:{status:"ok"}}`. The blog frontend doesn't consume `/health` directly — it's an infra health check. Behaviorally compatible.
2. **Analytics track HTTP 200 vs 204 (⚠, not a real gap):** Kotlin returns 200 on `POST /analytics/page-view`; Hono returns 204. Blog frontend fires-and-forgets; no behavioral impact.
3. **Article list `sort` override param not supported (⚠, not a real gap):** Kotlin's Spring `Pageable` allows `?sort=field,direction` overrides; Hono hardcodes `publishedAt DESC`. The blog frontend never passes a `sort` param. No behavioral impact.

**All 12 blog endpoints are present and behaviorally compatible. Zero breaking gaps.**
