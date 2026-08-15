import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Returns null (with a loud notice) when Supabase isn't configured yet, so the
// scheduled workflows are safe to commit before the project exists. Once the
// secrets land, the same workflows start recording with no further changes.
export function getDb(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("::notice::SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping run (A1 pending)");
    return null;
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export function fail(msg: string): never {
  console.error(`CRON_FAIL ${msg}`);
  process.exit(1);
}

export async function allRows<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query(from, from + pageSize - 1);
    if (error) fail(`paged query: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
  }
  return out;
}

export function chunks<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
