import { describe, it, expect, afterEach } from "bun:test";
import { analyticsResolveGeoLocation } from "@api-next/core";

type FetchSignature = typeof globalThis.fetch;
const realFetch: FetchSignature = globalThis.fetch;

function mockFetchWith(resolver: () => Response | Promise<Response>) {
  globalThis.fetch = (async () => resolver()) as unknown as FetchSignature;
}

function restoreFetch() {
  globalThis.fetch = realFetch;
}

describe("resolveGeoLocation", () => {
  afterEach(() => {
    restoreFetch();
  });

  it("returns null for 127.0.0.1 without fetching", async () => {
    let called = false;
    mockFetchWith(() => {
      called = true;
      return new Response("[]", { status: 200 });
    });
    const result = await analyticsResolveGeoLocation("127.0.0.1");
    expect(result).toBeNull();
    expect(called).toBe(false);
  });

  it("returns null for 192.168.x.x", async () => {
    expect(await analyticsResolveGeoLocation("192.168.1.5")).toBeNull();
  });

  it("returns null for 10.x.x.x", async () => {
    expect(await analyticsResolveGeoLocation("10.0.0.1")).toBeNull();
  });

  it("returns parsed location on success", async () => {
    mockFetchWith(() =>
      new Response(
        JSON.stringify({
          status: "success",
          lat: 37.5,
          lon: 127.0,
          country: "South Korea",
          city: "Seoul",
        }),
        { status: 200 },
      ),
    );
    const result = await analyticsResolveGeoLocation("8.8.8.8");
    expect(result).toEqual({
      latitude: 37.5,
      longitude: 127.0,
      country: "South Korea",
      city: "Seoul",
    });
  });

  it("returns null on status=fail", async () => {
    mockFetchWith(() =>
      new Response(JSON.stringify({ status: "fail", message: "invalid query" }), { status: 200 }),
    );
    expect(await analyticsResolveGeoLocation("8.8.8.8")).toBeNull();
  });

  it("returns null on HTTP error", async () => {
    mockFetchWith(() => new Response("server down", { status: 503 }));
    expect(await analyticsResolveGeoLocation("8.8.8.8")).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as unknown as FetchSignature;
    expect(await analyticsResolveGeoLocation("8.8.8.8")).toBeNull();
  });
});
