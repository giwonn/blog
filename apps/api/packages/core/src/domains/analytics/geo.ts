import type { GeoLocation } from "./types";

type IpApiSuccess = {
  status: "success";
  lat: number;
  lon: number;
  country?: string;
  city?: string;
};

type IpApiFailure = {
  status: "fail" | string;
};

type IpApiResponse = IpApiSuccess | IpApiFailure;

const PRIVATE_IP_PREFIXES = ["127.", "192.168.", "10."];

/**
 * Resolves a public IPv4 address to lat/lng/country/city via ip-api.com.
 * Returns null for private/loopback IPs, network failures, non-success
 * responses, or timeouts. 3-second timeout keeps page-view recording
 * non-blocking even when ip-api is slow.
 *
 * Mirrors Kotlin IpApiGeoLocationResolver.resolve.
 */
export async function resolveGeoLocation(ipAddress: string): Promise<GeoLocation | null> {
  if (PRIVATE_IP_PREFIXES.some((prefix) => ipAddress.startsWith(prefix))) {
    return null;
  }
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ipAddress}?fields=status,lat,lon,country,city`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as IpApiResponse;
    if (json.status !== "success") return null;
    const ok = json as IpApiSuccess;
    return {
      latitude: ok.lat,
      longitude: ok.lon,
      country: ok.country ?? null,
      city: ok.city ?? null,
    };
  } catch {
    return null;
  }
}
