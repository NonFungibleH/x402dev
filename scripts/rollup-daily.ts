// Aggregate yesterday's probes into daily_stats + daily_global.
// Pure SQL (rollup_daily function in the schema), idempotent, safe to re-run.

import { getDb, fail } from "./lib/db";

async function main() {
  const db = getDb();
  if (!db) return;

  const target = process.env.ROLLUP_DAY ?? new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const { error } = await db.rpc("rollup_daily", { target });
  if (error) fail(`rollup_daily(${target}): ${error.message}`);
  console.log(`rollup done for ${target}`);
}

main().catch((e) => fail(String(e)));
