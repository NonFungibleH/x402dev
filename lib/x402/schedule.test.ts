import { describe, expect, it } from "vitest";
import { assess, selectDue, shardOf, type EpState, type Observation } from "./schedule";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const HOUR = 3600_000;

function ep(id: string, over: Partial<EpState> = {}): EpState {
  return {
    id,
    url: `https://h.example/${id}`,
    host: "h.example",
    delisted_at: null,
    last_probe_at: null,
    last_probe_alive: null,
    prev_probe_alive: null,
    last_status_code: null,
    last_accepts_hash: null,
    last_price_usd: null,
    ...over,
  };
}

describe("selectDue", () => {
  const opts = { probeAll: false, hostCap: 100, minIntervalMs: 15 * 60_000 };

  it("never re-probes within the politeness window", () => {
    const recent = ep("a", { last_probe_at: new Date(NOW - 5 * 60_000).toISOString(), last_probe_alive: true });
    expect(selectDue([recent], NOW, { ...opts, probeAll: true })).toEqual([]);
  });

  it("regular runs skip unresponsive and delisted endpoints; full sweep includes them", () => {
    const old = new Date(NOW - 6 * HOUR).toISOString();
    const eps = [
      ep("alive", { last_probe_at: old, last_probe_alive: true }),
      ep("dead", { last_probe_at: old, last_probe_alive: false }),
      ep("gone", { last_probe_at: old, last_probe_alive: true, delisted_at: old }),
      ep("new"),
    ];
    expect(selectDue(eps, NOW, opts).map((e) => e.id).sort()).toEqual(["alive", "new"]);
    expect(selectDue(eps, NOW, { ...opts, probeAll: true }).map((e) => e.id).sort()).toEqual(["alive", "dead", "gone", "new"]);
  });

  it("caps endpoints per host, oldest-probed first, so big hosts rotate", () => {
    const eps = [
      ep("never"),
      ep("old", { last_probe_at: new Date(NOW - 20 * HOUR).toISOString(), last_probe_alive: true }),
      ep("mid", { last_probe_at: new Date(NOW - 10 * HOUR).toISOString(), last_probe_alive: true }),
      ep("other", { host: "other.example" }),
    ];
    const due = selectDue(eps, NOW, { ...opts, hostCap: 2 }).map((e) => e.id);
    expect(due).toContain("other");
    expect(due.filter((id) => id !== "other")).toEqual(["never", "old"]);
  });
});

describe("shardOf", () => {
  it("is stable and in range", () => {
    expect(shardOf("api.example.com", 4)).toBe(shardOf("api.example.com", 4));
    for (const h of ["a.com", "b.io", "market.datapackvibe.com", "x"]) {
      const s = shardOf(h, 4);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(4);
    }
  });
});

function obs(over: Partial<Observation> = {}): Observation {
  return { alive: true, status: 402, latencyMs: 300, error: null, hash: "h1", priceUsd: 0.01, ...over };
}

describe("assess", () => {
  it("first probe is always recorded, with no events", () => {
    const r = assess(ep("a"), obs());
    expect(r.record).toBe(true);
    expect(r.events).toEqual([]);
  });

  it("unchanged state is not recorded as a new row", () => {
    const prev = ep("a", { last_probe_at: "x", last_probe_alive: true, prev_probe_alive: true, last_status_code: 402, last_accepts_hash: "h1", last_price_usd: 0.01 });
    expect(assess(prev, obs()).record).toBe(false);
  });

  it("price change → recorded + price_change event (not schema_change)", () => {
    const prev = ep("a", { last_probe_at: "x", last_probe_alive: true, prev_probe_alive: true, last_status_code: 402, last_accepts_hash: "h1", last_price_usd: 0.01 });
    const r = assess(prev, obs({ hash: "h2", priceUsd: 0.02 }));
    expect(r.record).toBe(true);
    expect(r.events).toEqual([{ kind: "price_change", detail: { old: 0.01, new: 0.02 } }]);
  });

  it("hash change at same price → schema_change", () => {
    const prev = ep("a", { last_probe_at: "x", last_probe_alive: true, prev_probe_alive: true, last_status_code: 402, last_accepts_hash: "h1", last_price_usd: 0.01 });
    expect(assess(prev, obs({ hash: "h2" })).events).toEqual([{ kind: "schema_change" }]);
  });

  it("a failed probe keeps the last known hash and price (no phantom changes)", () => {
    const prev = ep("a", { last_probe_at: "x", last_probe_alive: true, prev_probe_alive: true, last_status_code: 402, last_accepts_hash: "h1", last_price_usd: 0.01 });
    const r = assess(prev, obs({ alive: false, status: null, hash: null, priceUsd: null, error: "timeout" }));
    expect(r.record).toBe(true);
    expect(r.events).toEqual([]);
    expect(r.next.last_accepts_hash).toBe("h1");
    expect(r.next.last_price_usd).toBe(0.01);
  });

  it("second consecutive failure after alive → died; recovery after 2 dead → revived", () => {
    const dying = ep("a", { last_probe_at: "x", last_probe_alive: false, prev_probe_alive: true, last_status_code: null });
    expect(assess(dying, obs({ alive: false, status: null, hash: null, priceUsd: null })).events).toEqual([{ kind: "died" }]);
    const dead = ep("a", { last_probe_at: "x", last_probe_alive: false, prev_probe_alive: false, last_status_code: null, last_accepts_hash: "h1", last_price_usd: 0.01 });
    expect(assess(dead, obs()).events).toEqual([{ kind: "revived" }]);
  });
});
