// Probe endpoints: free GET, no payment header. 402 = protocol working.
// Tiered cadence: responsive endpoints every 6h; unresponsive ones (and delisted
// zombie-watch) only on the daily full sweep (PROBE_ALL=1).
// Hard politeness guard: never probe the same endpoint more than once per 15 min.

import { parse402Body, type ParsedAccept } from "../lib/x402/parse";
import { transition } from "../lib/x402/status";
import { getDb, fail, allRows, chunks } from "./lib/db";

const UA = "x402dev-monitor/1.0 (+https://x402.dev)";
const TIMEOUT_MS = 10000;
const CONCURRENCY = 25;
const MIN_INTERVAL_MS = 15 * 60 * 1000;
const PROBE_ALL = process.env.PROBE_ALL === "1";

interface Ep {
  id: string;
  url: string;
  delisted_at: string | null;
  last_probe_at: string | null;
  last_probe_alive: boolean | null;
  prev_probe_alive: boolean | null;
  last_accepts_hash: string | null;
  last_price_usdc: number | null;
}

interface ProbeResult {
  alive: boolean;
  status: number | null;
  latency: number;
  error: string | null;
  parsed: { accept: ParsedAccept; acceptsHash: string; accepts: unknown[] } | null;
}

async function probe(url: string): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const latency = Date.now() - start;
    const s = res.status;
    // 402 healthy; any response except 404/5xx counts as alive (see methodology)
    const alive = s === 402 || (s < 500 && s !== 404);
    let parsed: ProbeResult["parsed"] = null;
    if (s === 402) {
      try {
        parsed = parse402Body(await res.json());
      } catch {
        /* unparseable 402 body — alive, but no payload data */
      }
    }
    return { alive, status: s, latency, error: null, parsed };
  } catch (e) {
    const latency = Date.now() - start;
    const msg = e instanceof Error ? (e.name === "TimeoutError" ? "timeout" : e.message.slice(0, 120)) : "error";
    return { alive: false, status: null, latency, error: msg, parsed: null };
  }
}

async function main() {
  const db = getDb();
  if (!db) return;

  const all = await allRows<Ep>((from, to) =>
    db
      .from("endpoints")
      .select("id,url,delisted_at,last_probe_at,last_probe_alive,prev_probe_alive,last_accepts_hash,last_price_usdc")
      .range(from, to)
  );

  const cutoff = Date.now() - MIN_INTERVAL_MS;
  const due = all.filter((e) => {
    if (e.last_probe_at && new Date(e.last_probe_at).getTime() > cutoff) return false; // politeness
    if (PROBE_ALL) return true; // daily sweep incl. delisted zombie-watch
    if (e.delisted_at) return false;
    return e.last_probe_alive !== false; // responsive or never probed
  });
  console.log(`probing ${due.length} of ${all.length} endpoints (PROBE_ALL=${PROBE_ALL})`);
  if (due.length === 0) {
    console.log("nothing due");
    return;
  }

  let done = 0;
  const probeRows: Record<string, unknown>[] = [];
  const epUpdates: Record<string, unknown>[] = [];
  const events: { endpoint_id: string; kind: string; detail?: unknown }[] = [];

  for (const batch of chunks(due, CONCURRENCY)) {
    const results = await Promise.all(batch.map((e) => probe(e.url)));
    const now = new Date().toISOString();
    for (let i = 0; i < batch.length; i++) {
      const e = batch[i];
      const r = results[i];
      const acc = r.parsed?.accept ?? null;
      const hash = r.parsed?.acceptsHash ?? null;
      const hashChanged = hash !== null && hash !== e.last_accepts_hash;

      probeRows.push({
        endpoint_id: e.id,
        probed_at: now,
        alive: r.alive,
        status_code: r.status,
        latency_ms: r.latency,
        price_raw: acc?.priceRaw ?? null,
        price_usdc: acc?.priceUsdc ?? null,
        asset: acc?.asset ?? null,
        network: acc?.network ?? null,
        accepts_hash: hash,
        accepts_json: hashChanged ? r.parsed?.accepts : null,
        error: r.error,
      });

      // events
      const history: boolean[] = [];
      if (e.last_probe_alive !== null) history.push(e.last_probe_alive);
      if (e.prev_probe_alive !== null) history.push(e.prev_probe_alive);
      const t = transition(history, r.alive);
      if (t) events.push({ endpoint_id: e.id, kind: t });
      if (acc?.priceUsdc != null && e.last_price_usdc != null && acc.priceUsdc !== Number(e.last_price_usdc)) {
        events.push({
          endpoint_id: e.id,
          kind: "price_change",
          detail: { old: `${e.last_price_usdc} USDC`, new: `${acc.priceUsdc} USDC` },
        });
      } else if (hashChanged && e.last_accepts_hash !== null) {
        events.push({ endpoint_id: e.id, kind: "schema_change" });
      }

      epUpdates.push({
        id: e.id,
        last_probe_at: now,
        prev_probe_alive: e.last_probe_alive,
        last_probe_alive: r.alive,
        last_accepts_hash: hash ?? e.last_accepts_hash,
        last_price_usdc: acc?.priceUsdc ?? e.last_price_usdc,
      });
    }
    done += batch.length;
    if (done % 500 < CONCURRENCY) console.log(`…${done}/${due.length}`);
  }

  for (const batch of chunks(probeRows, 500)) {
    const { error } = await db.from("probes").insert(batch);
    if (error) fail(`insert probes: ${error.message}`);
  }
  for (const batch of chunks(epUpdates, 500)) {
    const { error } = await db.from("endpoints").upsert(batch, { onConflict: "id" });
    if (error) fail(`update endpoints: ${error.message}`);
  }
  for (const batch of chunks(events, 500)) {
    const { error } = await db.from("events").insert(batch);
    if (error) fail(`insert events: ${error.message}`);
  }

  const aliveCount = probeRows.filter((p) => p.alive).length;
  if (probeRows.length === 0) fail("wrote zero probe rows");
  console.log(`probe done: ${probeRows.length} probes, ${aliveCount} alive, ${events.length} events`);
}

main().catch((e) => fail(String(e)));
