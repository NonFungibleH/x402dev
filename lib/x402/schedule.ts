// Probe scheduling and change detection, kept pure so the cron script stays thin.
//
// Storage model: a probe row is written only when an endpoint's observable state
// changes (alive, status code, accepts hash, price). Unchanged probes only bump the
// daily counters. Runs of identical probes are therefore lossless to reconstruct
// from the change rows plus daily_stats.

import { transition } from "./status";

export interface EpState {
  id: string;
  url: string;
  host: string;
  delisted_at: string | null;
  last_probe_at: string | null;
  last_probe_alive: boolean | null;
  prev_probe_alive: boolean | null;
  last_status_code: number | null;
  last_accepts_hash: string | null;
  last_price_usd: number | null;
}

export interface Observation {
  alive: boolean;
  status: number | null;
  latencyMs: number;
  error: string | null;
  hash: string | null;
  priceUsd: number | null;
}

export interface ScheduleOpts {
  probeAll: boolean; // daily full sweep: include unresponsive + delisted (zombie watch)
  hostCap: number; // max endpoints per host per run; big hosts rotate oldest-first
  minIntervalMs: number; // hard politeness guard
}

export function selectDue(eps: EpState[], nowMs: number, o: ScheduleOpts): EpState[] {
  const cutoff = nowMs - o.minIntervalMs;
  const byHost = new Map<string, EpState[]>();
  for (const e of eps) {
    if (e.last_probe_at && Date.parse(e.last_probe_at) > cutoff) continue;
    if (!o.probeAll && (e.delisted_at || e.last_probe_alive === false)) continue;
    const list = byHost.get(e.host) ?? [];
    list.push(e);
    byHost.set(e.host, list);
  }
  const out: EpState[] = [];
  for (const list of byHost.values()) {
    list.sort((a, b) => (a.last_probe_at ? Date.parse(a.last_probe_at) : 0) - (b.last_probe_at ? Date.parse(b.last_probe_at) : 0));
    out.push(...list.slice(0, o.hostCap));
  }
  return out;
}

// FNV-1a; sharding by host keeps every host's requests inside one job, so the
// per-host concurrency limit holds across parallel shards.
export function shardOf(host: string, shards: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < host.length; i++) {
    h ^= host.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % shards;
}

export interface Assessment {
  record: boolean;
  events: { kind: string; detail?: Record<string, unknown> }[];
  next: Pick<EpState, "last_probe_alive" | "prev_probe_alive" | "last_status_code" | "last_accepts_hash" | "last_price_usd">;
}

export function assess(prev: EpState, o: Observation): Assessment {
  const events: Assessment["events"] = [];
  const history: boolean[] = [];
  if (prev.last_probe_alive !== null) history.push(prev.last_probe_alive);
  if (prev.prev_probe_alive !== null) history.push(prev.prev_probe_alive);
  const t = transition(history, o.alive);
  if (t) events.push({ kind: t });

  const hashChanged = o.hash !== null && prev.last_accepts_hash !== null && o.hash !== prev.last_accepts_hash;
  const priceChanged = o.priceUsd !== null && prev.last_price_usd !== null && o.priceUsd !== Number(prev.last_price_usd);
  if (priceChanged) events.push({ kind: "price_change", detail: { old: Number(prev.last_price_usd), new: o.priceUsd } });
  else if (hashChanged) events.push({ kind: "schema_change" });

  const record =
    prev.last_probe_at === null ||
    o.alive !== prev.last_probe_alive ||
    o.status !== prev.last_status_code ||
    (o.hash !== null && o.hash !== prev.last_accepts_hash) ||
    priceChanged;

  return {
    record,
    events,
    next: {
      prev_probe_alive: prev.last_probe_alive,
      last_probe_alive: o.alive,
      last_status_code: o.status,
      last_accepts_hash: o.hash ?? prev.last_accepts_hash,
      last_price_usd: o.priceUsd ?? prev.last_price_usd,
    },
  };
}
