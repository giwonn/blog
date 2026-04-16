import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import {
  commentsGetRecent,
  commentsParse,
  type RecentComment,
} from "@api/core";
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
