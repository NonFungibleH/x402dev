// Data access layer. Fixture-backed in TEST TRANSMISSION mode;
// swaps to Supabase reads when NEXT_PUBLIC_SUPABASE_URL is set (Phase A wiring).

import { ENDPOINTS, EVENTS, type EndpointRow, type EventRow } from "./fixtures";

export type { EndpointRow, EventRow };

export const IS_DEMO = !process.env.NEXT_PUBLIC_SUPABASE_URL;

export function getEndpoints(): EndpointRow[] {
  return ENDPOINTS;
}

export function getEndpoint(slug: string): EndpointRow | undefined {
  return ENDPOINTS.find((e) => e.slug === slug);
}

export function getEvents(limit = 20): EventRow[] {
  return EVENTS.slice(0, limit);
}

export function getEventsFor(slug: string): EventRow[] {
  return EVENTS.filter((e) => e.slug === slug);
}

export function getGraveyard(): EndpointRow[] {
  return ENDPOINTS.filter((e) => e.delistedAt !== null || e.status === "dead")
    .sort((a, b) => (b.diedAt ?? b.delistedAt ?? "").localeCompare(a.diedAt ?? a.delistedAt ?? ""));
}

// P-numbers: sequential by first_seen. P201.. ; past P299 the block continues at P500.
export function pNumber(slug: string): string {
  const i = ENDPOINTS.findIndex((e) => e.slug === slug);
  if (i < 0) return "P2??";
  const n = i <= 98 ? 201 + i : 500 + (i - 99);
  return `P${n}`;
}

export function bySlugOrPNumber(n: number): EndpointRow | undefined {
  const i = n >= 201 && n <= 299 ? n - 201 : n >= 500 ? 99 + (n - 500) : -1;
  return i >= 0 ? ENDPOINTS[i] : undefined;
}

export interface Stats {
  liveCount: number;
  totalListed: number;
  medianPriceUsdc: number;
  newThisWeek: number;
  delistedThisWeek: number;
  rawReportedVolume: number;
  liveSeries30d: number[];
}

export function getStats(): Stats {
  const active = ENDPOINTS.filter((e) => e.delistedAt === null);
  const alive = active.filter((e) => e.status === "alive" || e.status === "no402");
  const prices = active.map((e) => e.priceUsdc).filter((p): p is number => p !== null).sort((a, b) => a - b);
  const weekAgo = Date.now() - 7 * 86400000;

  // 30-day live-count series reconstructed from per-endpoint uptime series
  const liveSeries30d: number[] = [];
  for (let d = 0; d < 30; d++) {
    let n = 0;
    for (const e of ENDPOINTS) {
      const u = e.uptimeSeries[d];
      if (u !== undefined && u > 0) n++;
    }
    liveSeries30d.push(n);
  }

  return {
    liveCount: alive.length,
    totalListed: ENDPOINTS.length,
    medianPriceUsdc: prices.length ? prices[Math.floor(prices.length / 2)] : 0,
    newThisWeek: ENDPOINTS.filter((e) => new Date(e.firstSeen).getTime() > weekAgo).length,
    delistedThisWeek: ENDPOINTS.filter((e) => e.delistedAt && new Date(e.delistedAt).getTime() > weekAgo).length,
    rawReportedVolume: 12_400_000,
    liveSeries30d,
  };
}
