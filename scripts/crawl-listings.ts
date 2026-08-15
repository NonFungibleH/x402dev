// Crawl the Bazaar discovery listings into the endpoints registry.
// Shape verified 2026-08-15 — see docs/data-sources.md before changing.

import { normalizeUrl } from "../lib/x402/normalize";
import { parseAccept } from "../lib/x402/parse";
import { getDb, fail, allRows, chunks } from "./lib/db";

const DISCOVERY = "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources";
const UA = "x402dev-monitor/1.0 (+https://x402.dev)";
const DELIST_AFTER_MISSING = 3;

interface BazaarItem {
  resource?: string;
  description?: string;
  x402Version?: number;
  lastUpdated?: string;
  accepts?: Record<string, unknown>[];
  quality?: { l30DaysTotalCalls?: number; l30DaysUniquePayers?: number; lastCalledAt?: string };
}

async function fetchListings(): Promise<BazaarItem[]> {
  const items: BazaarItem[] = [];
  for (let offset = 0; ; offset += 100) {
    const res = await fetch(`${DISCOVERY}?limit=100&offset=${offset}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) fail(`discovery fetch HTTP ${res.status} at offset ${offset}`);
    const body = (await res.json()) as { items: BazaarItem[]; pagination: { total: number } };
    items.push(...body.items);
    if (offset + 100 >= body.pagination.total || body.items.length === 0) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  return items;
}

async function main() {
  const db = getDb();
  if (!db) return;

  const items = await fetchListings();
  if (items.length === 0) fail("discovery returned zero items");
  console.log(`fetched ${items.length} listings`);

  // dedupe on normalized URL, last listing wins
  const byUrl = new Map<string, BazaarItem>();
  for (const it of items) {
    if (!it.resource) continue;
    try {
      byUrl.set(normalizeUrl(it.resource), it);
    } catch {
      /* unparseable URL — skip */
    }
  }

  const existing = await allRows<{
    id: string;
    url: string;
    delisted_at: string | null;
    consecutive_missing_crawls: number;
  }>((from, to) =>
    db.from("endpoints").select("id,url,delisted_at,consecutive_missing_crawls").range(from, to)
  );
  const existingByUrl = new Map(existing.map((e) => [e.url, e]));

  const now = new Date().toISOString();
  let inserted = 0;
  let relisted = 0;
  const events: { endpoint_id: string; kind: string; detail?: unknown }[] = [];

  // volume figure for daily_global
  let reportedVolume = 0;

  const updates: Record<string, unknown>[] = [];
  const inserts: Record<string, unknown>[] = [];

  for (const [url, it] of byUrl) {
    const acc = parseAccept((it.accepts?.[0] as Record<string, unknown>) ?? {});
    const q = it.quality ?? {};
    const calls = q.l30DaysTotalCalls ?? 0;
    if (acc.priceUsdc !== null && acc.priceUsdc <= 10000) reportedVolume += calls * acc.priceUsdc;

    const base = {
      url,
      name: url.replace(/^https?:\/\//, "").slice(0, 80),
      description: it.description?.slice(0, 500) ?? null,
      source: "bazaar",
      last_seen_listed: now,
      chain: acc.chain,
      is_testnet: acc.isTestnet,
      pay_to_address: acc.payTo,
      x402_version: it.x402Version ?? null,
      reported_calls_30d: q.l30DaysTotalCalls ?? null,
      reported_payers_30d: q.l30DaysUniquePayers ?? null,
      reported_last_called_at: q.lastCalledAt ?? null,
      consecutive_missing_crawls: 0,
    };

    const ex = existingByUrl.get(url);
    if (!ex) {
      inserts.push(base);
      inserted++;
    } else {
      const upd: Record<string, unknown> = { ...base, id: ex.id };
      if (ex.delisted_at) {
        upd.delisted_at = null;
        relisted++;
        events.push({ endpoint_id: ex.id, kind: "listed", detail: { relisted: true } });
      }
      updates.push(upd);
    }
  }

  for (const batch of chunks(inserts, 500)) {
    const { data, error } = await db.from("endpoints").insert(batch).select("id");
    if (error) fail(`insert endpoints: ${error.message}`);
    for (const row of data ?? []) events.push({ endpoint_id: row.id, kind: "listed" });
  }
  for (const batch of chunks(updates, 500)) {
    const { error } = await db.from("endpoints").upsert(batch, { onConflict: "id" });
    if (error) fail(`update endpoints: ${error.message}`);
  }

  // endpoints absent from this crawl
  let delisted = 0;
  const missing = existing.filter((e) => !byUrl.has(e.url) && !e.delisted_at);
  for (const e of missing) {
    const n = e.consecutive_missing_crawls + 1;
    const upd: Record<string, unknown> = { consecutive_missing_crawls: n };
    if (n >= DELIST_AFTER_MISSING) {
      upd.delisted_at = now;
      events.push({ endpoint_id: e.id, kind: "delisted" });
      delisted++;
    }
    const { error } = await db.from("endpoints").update(upd).eq("id", e.id);
    if (error) fail(`delist update: ${error.message}`);
  }

  for (const batch of chunks(events, 500)) {
    const { error } = await db.from("events").insert(batch);
    if (error) fail(`insert events: ${error.message}`);
  }

  // today's global row gets the fresh reported-volume + listing count
  const today = now.slice(0, 10);
  const { error: gErr } = await db.from("daily_global").upsert(
    {
      day: today,
      total_listed: byUrl.size,
      live_count: 0, // refined by rollup
      raw_reported_volume_30d: Math.round(reportedVolume * 100) / 100,
    },
    { onConflict: "day", ignoreDuplicates: false }
  );
  if (gErr) console.error(`daily_global upsert warning: ${gErr.message}`);

  console.log(
    `crawl done: ${byUrl.size} listed, +${inserted} new, ${relisted} relisted, ${delisted} delisted, reported 30d volume $${reportedVolume.toFixed(2)}`
  );
}

main().catch((e) => fail(String(e)));
