// Applies the real migration to an in-process Postgres (PGlite) and exercises the
// batched write functions the cron scripts depend on.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const MIGRATION = readFileSync(join(__dirname, "migrations/00001_init.sql"), "utf8");
let db: PGlite;

async function addEndpoint(url: string, host: string, chains: string[] = ["base"]) {
  const r = await db.query<{ id: string }>(
    "insert into endpoints (url, host, source, chains) values ($1, $2, 'bazaar', $3) returning id",
    [url, host, chains]
  );
  return r.rows[0].id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(MIGRATION);
});

describe("migration", () => {
  it("applies cleanly and enables RLS on every table", async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class where relname in ('endpoints','probes','daily_stats','daily_global','events')"
    );
    expect(r.rows).toHaveLength(5);
    expect(r.rows.every((x) => x.relrowsecurity)).toBe(true);
  });
});

describe("bump_missing", () => {
  it("delists only on the third consecutive miss and returns those ids", async () => {
    const id = await addEndpoint("https://gone.example/a", "gone.example");
    const at = "2026-10-07T00:00:00Z";
    const call = async () =>
      (await db.query<{ bump_missing: string | null }>("select bump_missing($1::uuid[], 3, $2)", [[id], at])).rows
        .map((r) => r.bump_missing)
        .filter(Boolean);
    expect(await call()).toEqual([]);
    expect(await call()).toEqual([]);
    expect(await call()).toEqual([id]);
    const row = (await db.query<{ delisted_at: string | null; consecutive_missing_crawls: number }>(
      "select delisted_at, consecutive_missing_crawls from endpoints where id = $1", [id])).rows[0];
    expect(row.delisted_at).not.toBeNull();
    expect(row.consecutive_missing_crawls).toBe(3);
    expect(await call()).toEqual([]); // already delisted: untouched
  });
});

describe("apply_probe_results + rollup_daily", () => {
  it("refreshes the cache, accumulates counters, and rolls up the day", async () => {
    const a = await addEndpoint("https://p.example/a", "p.example", ["base", "solana"]);
    const b = await addEndpoint("https://p.example/b", "p.example", ["polygon"]);
    const run = (at: string, aliveA: boolean, latA: number) =>
      db.query("select apply_probe_results($1::jsonb)", [JSON.stringify([
        { id: a, at, alive: aliveA, status: aliveA ? 402 : null, latency_ms: latA, hash: aliveA ? "h1" : null, price_usd: aliveA ? 0.01 : null, prev_alive: null },
        { id: b, at, alive: false, status: 404, latency_ms: 50, hash: null, price_usd: null, prev_alive: null },
      ])]);
    await run("2026-10-07T00:30:00Z", true, 200);
    await run("2026-10-07T06:30:00Z", true, 400);
    await run("2026-10-07T12:30:00Z", false, 10000);

    const ea = (await db.query<{ last_probe_alive: boolean; last_accepts_hash: string; last_price_usd: string }>(
      "select last_probe_alive, last_accepts_hash, last_price_usd from endpoints where id = $1", [a])).rows[0];
    expect(ea.last_probe_alive).toBe(false);
    expect(ea.last_accepts_hash).toBe("h1"); // failed probe keeps last known
    expect(Number(ea.last_price_usd)).toBe(0.01);

    await db.query("select rollup_daily('2026-10-07')");
    const s = (await db.query<{ probes_total: number; probes_alive: number; alive_ratio: string; avg_latency_ms: number }>(
      "select probes_total, probes_alive, alive_ratio, avg_latency_ms from daily_stats where endpoint_id = $1 and day = '2026-10-07'", [a])).rows[0];
    expect(s.probes_total).toBe(3);
    expect(s.probes_alive).toBe(2);
    expect(Number(s.alive_ratio)).toBeCloseTo(2 / 3);
    expect(s.avg_latency_ms).toBe(300); // dead probe's latency excluded

    await db.query("update endpoints set last_probe_alive = true where id = $1", [a]);
    await db.query("select rollup_daily('2026-10-07')"); // idempotent re-run
    const g = (await db.query<{ total_hosts: number; chain_counts: Record<string, number> }>(
      "select total_hosts, chain_counts from daily_global where day = '2026-10-07'")).rows[0];
    expect(g.total_hosts).toBeGreaterThanOrEqual(1);
    expect(g.chain_counts).toMatchObject({ base: 1, solana: 1 });
    expect(g.chain_counts.polygon).toBeUndefined(); // b is dead
  });
});
