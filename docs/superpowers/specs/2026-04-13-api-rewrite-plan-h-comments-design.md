# API Rewrite — Plan H: Comments (GitHub) Design

**Date:** 2026-04-13
**Status:** Approved for planning
**Parent design:** `docs/superpowers/specs/2026-04-13-api-rewrite-design.md`

## Goal

Port Kotlin's `GitHubCommentService.getRecentComments(limit)` to TypeScript. Comment domain has **zero HTTP endpoints** — it's a pure library consumed only by `SidebarController.getRecentComments` (Plan I). This plan creates the service function, in-memory TTL cache, and unit tests.

## Endpoint Inventory

None. This is a library domain.

## Architectural Decisions

### No Endpoints, No DB

Comment data lives on GitHub (issues/comments across the blog's GitHub repo). The rewrite mirrors the Kotlin behavior exactly: fetch → parse → return. No local database tables are involved.

### In-Memory TTL Cache (60s)

The Kotlin implementation uses Spring's `@Cacheable` (Redis-backed). For Plan H, a simple in-process TTL cache is sufficient:

- **Rate limit protection** against GitHub API (unauthenticated is 60 req/hr per IP)
- **No external dependency** — Redis is a Plan G2 concern; comments don't need it
- **Small cost** — single cached slot, 5 comments payload is tiny

```ts
type CachedEntry = { at: number; data: RecentComment[] };
let cache: CachedEntry | null = null;
const TTL_MS = 60_000;
```

Cache is per-process. Admin runs one process, blog runs another — acceptable for this scale.

### Error Handling — Return Empty on Failure

Kotlin's `GitHubCommentService` lets the `RestClient` exception propagate, which would make the Plan I sidebar endpoint return 500 if GitHub API is unreachable. That's a poor UX — the whole sidebar fails because one section couldn't load.

Plan H wraps the fetch in try/catch and returns `[]` on any failure, with a `console.warn` log line. The sidebar endpoint (Plan I) will render an empty recent-comments section instead of 500ing.

This is a deliberate improvement over the Kotlin behavior, not a parity break — the frontend already tolerates an empty array.

### GitHub API Details

- **URL**: `https://api.github.com/repos/${owner}/${repo}/issues/comments?sort=created&direction=desc&per_page=${limit}`
- **Headers**: `Accept: application/vnd.github.v3+json`
- **Auth**: none (unauthenticated). Rate limit 60/hr.
- **Response**: JSON array of GitHub issue comment objects. Extract `body`, `user.login`, `user.avatar_url`, `html_url`, `created_at`.

### Env Variables

Add to `packages/core/src/env.ts`:

```ts
GITHUB_OWNER: z.string().default("giwonn"),
GITHUB_REPO: z.string().default("giwon-blog"),
```

The Kotlin defaults match (`github.owner:giwonn`, `github.repo:giwon-blog`). No secret — this is public info.

Update `.env.example` and `.env.test` to document the vars.

### Types (`types.ts`)

Mirror Kotlin's `RecentComment`:

```ts
export type RecentComment = {
  body: string;
  author: string;
  avatarUrl: string;
  url: string;
  createdAt: string;
};
```

### Service (`service.ts`)

```ts
export async function getRecentComments(limit: number = 5): Promise<RecentComment[]> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.data;

  try {
    const { GITHUB_OWNER, GITHUB_REPO } = env;
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/comments?sort=created&direction=desc&per_page=${limit}`;
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (!res.ok) {
      console.warn(`[comments] GitHub API returned ${res.status}`);
      return [];
    }
    const json = (await res.json()) as unknown[];
    const data = parseComments(json);
    cache = { at: now, data };
    return data;
  } catch (err) {
    console.warn("[comments] GitHub fetch failed", err);
    return [];
  }
}

export function parseComments(json: unknown[]): RecentComment[] {
  return json.map((raw) => {
    const c = raw as { body: string; html_url: string; created_at: string; user: { login: string; avatar_url: string } };
    return {
      body: c.body,
      author: c.user.login,
      avatarUrl: c.user.avatar_url,
      url: c.html_url,
      createdAt: c.created_at,
    };
  });
}
```

`parseComments` is exported separately so unit tests can exercise parsing without mocking fetch.

### Cache Invalidation

The 60s TTL expiration is the only invalidation path. No manual flush API.

### File Structure

```
packages/core/src/
├── env.ts                              # +GITHUB_OWNER, GITHUB_REPO
├── index.ts                            # +comments surface
└── domains/comments/                   # NEW
    ├── types.ts                        # RecentComment
    ├── service.ts                      # getRecentComments + parseComments
    └── index.ts                        # commentsGetRecent re-export

apps/api-next/
├── .env.example                        # +GITHUB_OWNER, GITHUB_REPO lines
└── .env.test                           # same

packages/core/test/
└── comments.test.ts                    # NEW: 3-4 unit tests
```

### Tests

`packages/core/test/comments.test.ts`:

1. **parseComments empty array** → `[]`
2. **parseComments mapping** — given a fixture with 2 issue comments, returns 2 `RecentComment` objects with all fields correctly mapped
3. **getRecentComments happy path** — mock `global.fetch` to return a canned 200 + JSON body, verify the returned array
4. **getRecentComments 500 → empty** — mock `fetch` returning `{ ok: false, status: 500 }`, verify `[]`
5. **getRecentComments network error → empty** — mock `fetch` to throw, verify `[]`

Cache behavior is not tested directly in Plan H to keep scope minimal; the 60s TTL is small enough that it doesn't affect Plan I's sidebar tests either (tests complete in ms).

Location: `packages/core/test/comments.test.ts` (not in an app workspace because there's no route). This is the first test file that lives inside `packages/core/test/` alongside `env.test.ts` and `errors.test.ts`.

## Plan H Deliverables

1. Env additions (`GITHUB_OWNER`, `GITHUB_REPO`) in `env.ts`, `.env.example`, `.env.test`
2. `packages/core/src/domains/comments/{types,service,index}.ts`
3. Core barrel re-exports `RecentComment` + `commentsGetRecent`
4. `packages/core/test/comments.test.ts` — 5 unit tests pass
5. `bunx turbo run lint` 5/5 (0 errors)
6. `bun run test` 4/4
7. Manual verification: `bun -e` call to `commentsGetRecent(5)` against real GitHub API returns reasonable data (optional — may be skipped if offline)

## Plan H Non-Goals

- Any HTTP endpoint — Plan I's sidebar consumes the function directly
- Redis-backed cache — deliberately scoped out; in-memory is sufficient at this scale
- GitHub token authentication — unauthenticated matches Kotlin; add later if rate limit becomes an issue
- Write path / comment creation — GitHub issues are authored on github.com, not via this API
- Multi-repo support — single repo hardcoded in env
- Pagination — fixed page size (limit param)
