// Crawl the Bazaar discovery listings into the endpoints registry.
// Shape verified 2026-08-15 and 2026-10-06 — see docs/data-sources.md.

import { normalizeUrl } from "../lib/x402/normalize";
import { mainnetChains, parseAccept } from "../lib/x402/parse";
import { getDb, fail, allRows, chunks } from "./lib/db";

const DISCOVERY = "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources";
const UA = "x402dev-monitor/1.0 (+https://x402.dev)";
const DELIST_AFTER_MISSING = 3;
const MAX_SANE_PRICE_USD = 10_000;

interface BazaarItem {
  resource?: string;
  description?: string;
  x402Version?: number;
  accepts?: Record<string, unknown>[];
  extensions?: { bazaar?: { info?: { input?: { method?: string } } } };
  quality?: { l30DaysTotalCalls?: number; l30DaysUniquePayers?: number; lastCalledAt?: string };
}

async function fetchListings(): Promise<BazaarItem[]> {
  const items: BazaarItem[] = [];
  for (let offset = 0; ; offset += 100) {
    let body: { items: BazaarItem[]; pagination: { total: number } } | null = null;
    for (let attempt = 1; attempt <= 3 && !body; attempt++) {
      const res = await fetch(`${DISCOVERY}?limit=100&offset=${offset}`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(30000),
      }).catch(() => null);
      if (res?.ok) body = await res.json();
      else await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
    if (!body) fail(`discovery fetch failed 3x at offset ${offset}`);
    items.push(...body.items);
    if (offset + 100 >= body.pagination.total || body.items.length === 0) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  return items;
}

function method(it: BazaarItem): string {
  const m = it.extensions?.bazaar?.info?.input?.method?.toUpperCase();
  return m === "POST" || m === "PUT" || m === "DELETE" || m === "PATCH" ? m : "GET";
}

async function main() {
  const db = getDb();
  if (!db) return;

  const items = await fetchListings();
  if (items.length === 0) fail("discovery returned zero items");
  console.log(`fetched ${items.length} listings`);

  const byUrl = new Map<string, BazaarItem>();
  for (const it of items) {
    if (!it.resource) continue;
    try {
      byUrl.set(normalizeUrl(it.resource), it);
    } catch {
      /* unparseable URL — skip */
    }
  }

  const existing = await allRows<{ id: string; url: string; delisted_at: string | null }>((from, to) =>
    db.from("endpoints").select("id,url,delisted_at").range(from, to)
  );
  const existingByUrl = new Map(existing.map((e) => [e.url, e]));
  const bootstrap = existing.length === 0; // first crawl: don't flood the changelog with "listed"

  const now = new Date().toISOString();
  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const events: { endpoint_id: string; kind: string; detail?: unknown }[] = [];
  let reportedVolume = 0;
  let relisted = 0;

  for (const [url, it] of byUrl) {
    const parsed = (it.accepts ?? []).map((a) => parseAccept(a));
    const primary = parsed[0] ?? parseAccept({});
    const q = it.quality ?? {};
    if (primary.priceUsd !== null && primary.priceUsd <= MAX_SANE_PRICE_USD) {
      reportedVolume += (q.l30DaysTotalCalls ?? 0) * primary.priceUsd;
    }
    const row = {
      url,
      host: new URL(url).host,
      http_method: method(it),
      name: url.replace(/^https?:\/\//, "").slice(0, 80),
      description: it.description?.slice(0, 500) ?? null,
      source: "bazaar",
      last_seen_listed: now,
      consecutive_missing_crawls: 0,
      chain: primary.chain,
      chains: mainnetChains(parsed),
      is_testnet: parsed.length > 0 && parsed.every((p) => p.isTestnet),
      pay_to_address: primary.payTo,
      x402_version: it.x402Version ?? null,
      listed_price_usd: primary.priceUsd,
      reported_calls_30d: q.l30DaysTotalCalls ?? null,
      reported_payers_30d: q.l30DaysUniquePayers ?? null,
      reported_last_called_at: q.lastCalledAt ?? null,
    };
    const ex = existingByUrl.get(url);
    if (!ex) inserts.push(row);
    else {
      updates.push({ ...row, id: ex.id, delisted_at: null });
      if (ex.delisted_at) {
        relisted++;
        events.push({ endpoint_id: ex.id, kind: "listed", detail: { relisted: true } });
      }
    }
  }

  for (const batch of chunks(inserts, 500)) {
    const { data, error } = await db.from("endpoints").insert(batch).select("id");
    if (error) fail(`insert endpoints: ${error.message}`);
    if (!bootstrap) for (const r of data ?? []) events.push({ endpoint_id: r.id, kind: "listed" });
  }
  for (const batch of chunks(updates, 500)) {
    const { error } = await db.from("endpoints").upsert(batch, { onConflict: "id" });
    if (error) fail(`update endpoints: ${error.message}`);
  }

  const missing = existing.filter((e) => !byUrl.has(e.url) && !e.delisted_at).map((e) => e.id);
  let delisted = 0;
  for (const batch of chunks(missing, 1000)) {
    const { data, error } = await db.rpc("bump_missing", { ids: batch, delist_after: DELIST_AFTER_MISSING, at: now });
    if (error) fail(`bump_missing: ${error.message}`);
    for (const id of (data as (string | null)[] | null) ?? []) {
      if (!id) continue;
      events.push({ endpoint_id: id, kind: "delisted" });
      delisted++;
    }
  }

  for (const batch of chunks(events, 500)) {
    const { error } = await db.from("events").insert(batch);
    if (error) fail(`insert events: ${error.message}`);
  }

  const { error: gErr } = await db
    .from("daily_global")
    .upsert({ day: now.slice(0, 10), raw_reported_volume_30d: Math.round(reportedVolume * 100) / 100 }, { onConflict: "day" });
  if (gErr) fail(`daily_global upsert: ${gErr.message}`);

  console.log(
    `crawl done: ${byUrl.size} listed${bootstrap ? " (bootstrap)" : ""}, +${inserts.length} new, ` +
      `${relisted} relisted, ${delisted} delisted, ${missing.length} missing, reported 30d volume $${reportedVolume.toFixed(2)}`
  );
}

main().catch((e) => fail(String(e)));
