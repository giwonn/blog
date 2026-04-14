# API Rewrite — Plan H: Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Kotlin's `GitHubCommentService.getRecentComments` to TypeScript as a pure library inside `@api-next/core`. Zero endpoints. Plan I (sidebar) consumes the function directly.

**Architecture:** Single service with fetch → parse → in-memory TTL cache. Returns empty array on any fetch failure so Plan I's sidebar can partial-render.

**Tech Stack:** Native Bun `fetch`, Zod (env only), `bun:test`.

**Design reference:** `docs/superpowers/specs/2026-04-13-api-rewrite-plan-h-comments-design.md`

---

## File Structure

```
apps/api-next/
├── .env.example                       # +GITHUB_OWNER, GITHUB_REPO
├── .env.test                          # same
└── packages/core/
    └── src/
        ├── env.ts                     # +2 zod fields
        ├── index.ts                   # +comments surface
        └── domains/comments/          # NEW
            ├── types.ts
            ├── service.ts
            └── index.ts
    └── test/
        └── comments.test.ts           # NEW: 5 unit tests
```

---

## Task 1: Extend env with GitHub config

**Files:**
- Modify: `apps/api-next/packages/core/src/env.ts`
- Modify: `apps/api-next/.env.example`
- Modify: `apps/api-next/.env.test`

- [ ] **Step 1: Add fields to `env.ts`**

Read `~/github/new-blog/apps/api-next/packages/core/src/env.ts`. Find the Zod `schema` const and add two fields before the closing `});`:

```ts
  GITHUB_OWNER: z.string().default("giwonn"),
  GITHUB_REPO: z.string().default("giwon-blog"),
```

- [ ] **Step 2: Update `.env.example`**

Read `~/github/new-blog/apps/api-next/.env.example`. Append:

```
# GitHub (comments)
GITHUB_OWNER=giwonn
GITHUB_REPO=giwon-blog
```

- [ ] **Step 3: Update `.env.test`**

Read `~/github/new-blog/apps/api-next/.env.test`. Append:

```
GITHUB_OWNER=test-owner
GITHUB_REPO=test-repo
```

- [ ] **Step 4: Type-check core + run existing tests**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
bun test
```
Expected: tsc exit 0. Existing env.test.ts should still pass — its fixture already includes `DATABASE_URL`, `ADMIN_JWT_SECRET`, `ADMIN_GOOGLE_SUB` and the two new fields have defaults, so no test update needed.

- [ ] **Step 5: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/env.ts apps/api-next/.env.example apps/api-next/.env.test
git commit -m "feat(api): add GITHUB_OWNER and GITHUB_REPO env vars

Defaults match the Kotlin @Value defaults: giwonn / giwon-blog.
Comments service in Plan H uses these to construct the GitHub API URL."
```

---

## Task 2: Comments types + service + barrel

**Files:**
- Create: `apps/api-next/packages/core/src/domains/comments/types.ts`
- Create: `apps/api-next/packages/core/src/domains/comments/service.ts`
- Create: `apps/api-next/packages/core/src/domains/comments/index.ts`

- [ ] **Step 1: Create the directory and `types.ts`**

```bash
mkdir -p ~/github/new-blog/apps/api-next/packages/core/src/domains/comments
```

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/comments/types.ts`:

```ts
export type RecentComment = {
  body: string;
  author: string;
  avatarUrl: string;
  url: string;
  createdAt: string;
};
```

- [ ] **Step 2: Write `service.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/comments/service.ts`:

```ts
import { env } from "../../env";
import type { RecentComment } from "./types";

type CachedEntry = { at: number; data: RecentComment[] };
let cache: CachedEntry | null = null;
const TTL_MS = 60_000;

type GitHubCommentJson = {
  body: string;
  html_url: string;
  created_at: string;
  user: { login: string; avatar_url: string };
};

/**
 * Maps GitHub issue-comment JSON objects to the blog's RecentComment shape.
 * Exported separately so unit tests can exercise parsing without fetch.
 */
export function parseComments(json: unknown[]): RecentComment[] {
  return json.map((raw) => {
    const c = raw as GitHubCommentJson;
    return {
      body: c.body,
      author: c.user.login,
      avatarUrl: c.user.avatar_url,
      url: c.html_url,
      createdAt: c.created_at,
    };
  });
}

/**
 * Fetches the most recent comments from the configured GitHub repo's issues.
 * In-memory 60-second TTL cache to avoid GitHub's unauthenticated rate limit
 * (60 requests/hour per IP). Returns [] on any fetch/parse failure so the
 * sidebar can partial-render instead of 500.
 *
 * Mirrors Kotlin GitHubCommentService.getRecentComments.
 */
export async function getRecentComments(limit: number = 5): Promise<RecentComment[]> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.data;

  try {
    const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/comments?sort=created&direction=desc&per_page=${limit}`;
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

/**
 * Test helper to clear the in-memory cache between test cases.
 * Exported only for tests — production code should rely on the TTL.
 */
export function __clearCommentsCache(): void {
  cache = null;
}
```

- [ ] **Step 3: Write `index.ts` barrel**

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/comments/index.ts`:

```ts
export { type RecentComment } from "./types";
export {
  getRecentComments as commentsGetRecent,
  parseComments as commentsParse,
  __clearCommentsCache,
} from "./service";
```

- [ ] **Step 4: Extend core barrel**

Read `~/github/new-blog/apps/api-next/packages/core/src/index.ts`. Append at the end:

```ts
export { type RecentComment, commentsGetRecent, commentsParse } from "./domains/comments";
```

(Note: `__clearCommentsCache` is intentionally NOT re-exported from the core barrel — it's a test-only helper. Tests import it directly from `@api-next/core/src/domains/comments/service` or via the subpath, which the barrel doesn't need to advertise.)

- [ ] **Step 5: Type-check**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/domains/comments apps/api-next/packages/core/src/index.ts
git commit -m "feat(api): add comments domain (GitHub issue comments fetch)

Service has an in-memory 60-second TTL cache and returns [] on any
fetch/parse failure. parseComments is exported separately for unit
testing. Consumed only by Plan I sidebar — no HTTP endpoint."
```

---

## Task 3: Unit tests

**Files:**
- Create: `apps/api-next/packages/core/test/comments.test.ts`

- [ ] **Step 1: Write the test file**

Write `~/github/new-blog/apps/api-next/packages/core/test/comments.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import {
  commentsGetRecent,
  commentsParse,
  type RecentComment,
} from "@api-next/core";
import { __clearCommentsCache } from "../src/domains/comments/service";

const fixture = [
  {
    body: "Nice post!",
    html_url: "https://github.com/giwonn/giwon-blog/issues/1#issuecomment-1",
    created_at: "2026-04-10T12:00:00Z",
    user: {
      login: "alice",
      avatar_url: "https://example.com/alice.jpg",
    },
  },
  {
    body: "Thanks!",
    html_url: "https://github.com/giwonn/giwon-blog/issues/2#issuecomment-2",
    created_at: "2026-04-11T09:00:00Z",
    user: {
      login: "bob",
      avatar_url: "https://example.com/bob.jpg",
    },
  },
];

type FetchSignature = typeof globalThis.fetch;
const realFetch: FetchSignature = globalThis.fetch;

function mockFetchWith(resolver: () => Response | Promise<Response>) {
  globalThis.fetch = (async () => resolver()) as unknown as FetchSignature;
}

function restoreFetch() {
  globalThis.fetch = realFetch;
}

describe("commentsParse", () => {
  it("returns [] for an empty array", () => {
    expect(commentsParse([])).toEqual([]);
  });

  it("maps GitHub issue comment JSON to RecentComment[]", () => {
    const result = commentsParse(fixture);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      body: "Nice post!",
      author: "alice",
      avatarUrl: "https://example.com/alice.jpg",
      url: "https://github.com/giwonn/giwon-blog/issues/1#issuecomment-1",
      createdAt: "2026-04-10T12:00:00Z",
    });
    expect(result[1]?.author).toBe("bob");
  });
});

describe("commentsGetRecent", () => {
  beforeEach(() => {
    __clearCommentsCache();
  });

  afterAll(() => {
    restoreFetch();
  });

  it("returns parsed comments on 200 response", async () => {
    mockFetchWith(() => new Response(JSON.stringify(fixture), { status: 200 }));
    const result: RecentComment[] = await commentsGetRecent(5);
    expect(result).toHaveLength(2);
    expect(result[0]?.author).toBe("alice");
    restoreFetch();
  });

  it("returns [] on non-200 response", async () => {
    mockFetchWith(() => new Response("forbidden", { status: 403 }));
    const result = await commentsGetRecent(5);
    expect(result).toEqual([]);
    restoreFetch();
  });

  it("returns [] when fetch throws", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as unknown as FetchSignature;
    const result = await commentsGetRecent(5);
    expect(result).toEqual([]);
    restoreFetch();
  });

  it("caches successive calls within the TTL window", async () => {
    let callCount = 0;
    mockFetchWith(() => {
      callCount++;
      return new Response(JSON.stringify(fixture), { status: 200 });
    });
    await commentsGetRecent(5);
    await commentsGetRecent(5);
    await commentsGetRecent(5);
    expect(callCount).toBe(1);
    restoreFetch();
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bun test test/comments.test.ts 2>&1 | tail -15
```
Expected: 6 pass / 0 fail.

If failing:
- Mock `fetch` not taking effect: ensure the mock assignment happens **before** calling `commentsGetRecent` and that `beforeEach` clears the cache
- Cache leaking between tests: confirm `__clearCommentsCache` runs in `beforeEach`

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/test/comments.test.ts
git commit -m "test(api): add comments service unit tests

6 cases: parseComments empty + fixture, getRecentComments 200/non-200/
throw/cache. Uses inline global.fetch mock since the scope is small
and doesn't need a mocking library."
```

---

## Task 4: Monorepo verification

**Files:** (no changes)

- [ ] **Step 1: `turbo run lint`**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog
bunx turbo run lint --force 2>&1 | tail -10
```
Expected: 5/5, 0 errors.

- [ ] **Step 2: `bun run test`**

```bash
cd ~/github/new-blog
bun run test 2>&1 | tail -10
```
Expected: 4/4 successful. `@api-next/core` test count grows from 6 to 12 (6 existing + 6 comments).

- [ ] **Step 3: (Optional) Live sanity check against real GitHub**

Skip this step if offline or if the rate limit is exhausted.

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/packages/core
export $(grep -v '^#' ../../.env | xargs)
bun -e '
import { commentsGetRecent } from "./src";
const result = await commentsGetRecent(3);
console.log(JSON.stringify(result, null, 2));
'
```
Expected: an array of 0-3 `RecentComment` objects from the real GitHub repo, or `[]` if the configured repo has no issue comments or the API is unreachable. No error.

No commit.

---

## Plan H Completion Checklist

- [ ] `GITHUB_OWNER` and `GITHUB_REPO` added to env schema + example + test fixture (Task 1)
- [ ] `domains/comments/{types,service,index}.ts` created (Task 2)
- [ ] Core barrel re-exports `RecentComment`, `commentsGetRecent`, `commentsParse` (Task 2)
- [ ] 6 unit tests pass (Task 3)
- [ ] `bunx turbo run lint` 5/5 (Task 4)
- [ ] `bun run test` 4/4 (Task 4)
- [ ] (Optional) Live GitHub call returns reasonable data (Task 4 Step 3)

## Out of Scope

- Any HTTP endpoint — Plan I sidebar consumes the function
- Redis cache — in-memory TTL is sufficient at this scale
- GitHub auth / token — unauthenticated matches Kotlin
- Multi-repo support
- Write path (GitHub comment creation)
