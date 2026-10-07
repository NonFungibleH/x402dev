// Probe endpoints with a free request using the listing's HTTP method and no
// payment header. HTTP 402 with a parseable payload = the protocol working.
// Sharded by host (SHARD / SHARDS) so the per-host concurrency limit holds across
// parallel jobs; big hosts rotate via the per-host cap in selectDue.

import { readFileSync } from "node:fs";
import { normalizeUrl } from "../lib/x402/normalize";
import { parse402Response } from "../lib/x402/parse";
import { assess, selectDue, shardOf, type EpState, type Observation } from "../lib/x402/schedule";
import { getDb, fail, allRows, chunks } from "./lib/db";

const UA = "x402dev-monitor/1.0 (+https://x402.dev)";
const TIMEOUT_MS = 10_000;
const GLOBAL_CONCURRENCY = 32;
const PER_HOST_CONCURRENCY = 2;
const HOST_CAP = Number(process.env.HOST_CAP ?? 400);
const SHARDS = Number(process.env.SHARDS ?? 1);
const SHARD = Number(process.env.SHARD ?? 0);
const PROBE_ALL = process.env.PROBE_ALL === "1";
// PROBE_DRY_FILE=<bazaar listings json>: probe for real, write nothing (local testing)
const DRY_FILE = process.env.PROBE_DRY_FILE;

type Ep = EpState & { http_method: string };

interface Result extends Observation {
  parsed: ReturnType<typeof parse402Response>;
}

async function probe(e: Ep): Promise<Result> {
  const start = Date.now();
  const hasBody = e.http_method !== "GET" && e.http_method !== "DELETE";
  try {
    const res = await fetch(e.url, {
      method: e.http_method,
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      body: hasBody ? "{}" : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const latencyMs = Date.now() - start;
    const s = res.status;
    let parsed: Result["parsed"] = null;
    if (s === 402) {
      const text = await res.text().catch(() => "");
      parsed = parse402Response(text, res.headers.get("payment-required") ?? res.headers.get("x-payment-required"));
    } else {
      res.body?.cancel().catch(() => {});
    }
    // 402 healthy; any other response except 404/5xx means the server is up (see methodology)
    const alive = s === 402 || (s < 500 && s !== 404);
    return {
      alive,
      status: s,
      latencyMs,
      error: null,
      hash: parsed?.acceptsHash ?? null,
      priceUsd: parsed?.accept.priceUsd ?? null,
      parsed,
    };
  } catch (err) {
    const msg = err instanceof Error ? (err.name === "TimeoutError" ? "timeout" : err.message.slice(0, 120)) : "error";
    return { alive: false, status: null, latencyMs: Date.now() - start, error: msg, hash: null, priceUsd: null, parsed: null };
  }
}

// global pool with a per-host limit
async function runAll(eps: Ep[], onResult: (e: Ep, r: Result) => void) {
  const queue = [...eps];
  const active = new Map<string, number>();
  let running = 0;
  await new Promise<void>((resolve) => {
    const pump = () => {
      if (queue.length === 0 && running === 0) return resolve();
      for (let i = 0; i < queue.length && running < GLOBAL_CONCURRENCY; ) {
        const e = queue[i];
        if ((active.get(e.host) ?? 0) >= PER_HOST_CONCURRENCY) {
          i++;
          continue;
        }
        queue.splice(i, 1);
        running++;
        active.set(e.host, (active.get(e.host) ?? 0) + 1);
        probe(e).then((r) => {
          onResult(e, r);
          running--;
          active.set(e.host, (active.get(e.host) ?? 1) - 1);
          pump();
        });
      }
    };
    pump();
  });
}

function dryEndpoints(file: string): Ep[] {
  type Item = { resource?: string; extensions?: { bazaar?: { info?: { input?: { method?: string } } } } };
  const items: Item[] = JSON.parse(readFileSync(file, "utf8"));
  const out = new Map<string, Ep>();
  for (const it of items) {
    if (!it.resource) continue;
    let url: string;
    try { url = normalizeUrl(it.resource); } catch { continue; }
    const m = it.extensions?.bazaar?.info?.input?.method?.toUpperCase() ?? "GET";
    out.set(url, {
      id: url, url, host: new URL(url).host, http_method: m, delisted_at: null, last_probe_at: null,
      last_probe_alive: null, prev_probe_alive: null, last_status_code: null, last_accepts_hash: null, last_price_usd: null,
    });
  }
  return [...out.values()];
}

async function main() {
  const db = DRY_FILE ? null : getDb();
  if (!db && !DRY_FILE) return;

  const all: Ep[] = DRY_FILE
    ? dryEndpoints(DRY_FILE)
    : await allRows<Ep>((from, to) =>
        db!
          .from("endpoints")
          .select("id,url,host,http_method,delisted_at,last_probe_at,last_probe_alive,prev_probe_alive,last_status_code,last_accepts_hash,last_price_usd")
          .range(from, to)
      );
  const mine = all.filter((e) => shardOf(e.host, SHARDS) === SHARD);
  const due = selectDue(mine, Date.now(), { probeAll: PROBE_ALL, hostCap: HOST_CAP, minIntervalMs: 15 * 60_000 }) as Ep[];
  console.log(`shard ${SHARD}/${SHARDS}: probing ${due.length} of ${mine.length} endpoints (PROBE_ALL=${PROBE_ALL})`);
  if (due.length === 0) return console.log("nothing due");

  const changeRows: Record<string, unknown>[] = [];
  const results: Record<string, unknown>[] = [];
  const events: { endpoint_id: string; kind: string; detail?: unknown }[] = [];
  let done = 0;
  let alive = 0;

  await runAll(due, (e, r) => {
    const at = new Date().toISOString();
    const a = assess(e, r);
    if (r.alive) alive++;
    for (const ev of a.events) events.push({ endpoint_id: e.id, ...ev });
    if (a.record) {
      const acc = r.parsed?.accept;
      changeRows.push({
        endpoint_id: e.id,
        probed_at: at,
        alive: r.alive,
        status_code: r.status,
        latency_ms: r.latencyMs,
        price_raw: acc?.priceRaw ?? null,
        price_usd: acc?.priceUsd ?? null,
        asset: acc?.asset ?? null,
        network: acc?.network ?? null,
        chains: r.parsed?.chains ?? null,
        accepts_hash: r.hash,
        accepts_json: r.hash && r.hash !== e.last_accepts_hash ? r.parsed?.accepts : null,
        error: r.error,
      });
    }
    results.push({
      id: e.id,
      at,
      alive: r.alive,
      status: r.status,
      latency_ms: r.latencyMs,
      hash: r.hash,
      price_usd: r.priceUsd,
      prev_alive: a.next.prev_probe_alive,
    });
    if (++done % 1000 === 0) console.log(`…${done}/${due.length}`);
  });

  if (!db) {
    const by = (f: (r: Record<string, unknown>) => boolean) => changeRows.filter(f).length;
    const statuses = new Map<string, number>();
    for (const r of changeRows) statuses.set(String(r.status_code ?? r.error), (statuses.get(String(r.status_code ?? r.error)) ?? 0) + 1);
    console.log(`DRY RUN — nothing written. ${results.length} probed, ${alive} alive`);
    console.log(`402 with parsed payload: ${by((r) => r.status_code === 402 && r.accepts_hash !== null)}; 402 unparsed: ${by((r) => r.status_code === 402 && r.accepts_hash === null)}`);
    console.log("status/error mix:", Object.fromEntries([...statuses].sort((a, b) => b[1] - a[1]).slice(0, 12)));
    const chainCount = new Map<string, number>();
    for (const r of changeRows) for (const c of (r.chains as string[] | null) ?? []) chainCount.set(c, (chainCount.get(c) ?? 0) + 1);
    console.log("live chains:", Object.fromEntries([...chainCount].sort((a, b) => b[1] - a[1])));
    return;
  }
  for (const batch of chunks(changeRows, 500)) {
    const { error } = await db.from("probes").insert(batch);
    if (error) fail(`insert probes: ${error.message}`);
  }
  for (const batch of chunks(results, 1000)) {
    const { error } = await db.rpc("apply_probe_results", { rows: batch });
    if (error) fail(`apply_probe_results: ${error.message}`);
  }
  for (const batch of chunks(events, 500)) {
    const { error } = await db.from("events").insert(batch);
    if (error) fail(`insert events: ${error.message}`);
  }

  if (results.length === 0) fail("wrote zero probe results");
  console.log(`probe done: ${results.length} probed, ${alive} alive, ${changeRows.length} state changes, ${events.length} events`);
}

main().catch((e) => fail(String(e)));
