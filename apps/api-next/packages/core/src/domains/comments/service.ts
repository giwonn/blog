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
