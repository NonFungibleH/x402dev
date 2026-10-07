-- x402.dev schema v1. Build brief §4, adjusted for real Bazaar scale
-- (35k listings / 2.1k hosts / 25+ networks on 2026-10-06):
--   * probes holds one row per STATE CHANGE, not per probe; unchanged probes only
--     bump daily_stats counters (see lib/x402/schedule.ts)
--   * multi-chain: every mainnet chain an endpoint accepts, prices in USD
--   * host + http_method so probes use the listed method and big hosts rotate
--   * batched SQL functions so cron scripts never issue per-row updates

create table endpoints (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,            -- normalized (lowercase host, no trailing slash)
  host text not null,
  http_method text not null default 'GET',
  name text,
  description text,
  source text not null,                -- 'bazaar' | ...
  first_seen timestamptz not null default now(),
  last_seen_listed timestamptz,
  delisted_at timestamptz,             -- absent from listings 3+ consecutive crawls
  consecutive_missing_crawls int not null default 0,
  operator_hint text,
  chain text,                          -- primary (first-accepted) chain slug
  chains text[] not null default '{}', -- every mainnet chain accepted
  is_testnet boolean not null default false,
  pay_to_address text,
  x402_version int,
  listed_price_usd numeric,            -- what the listing advertises
  -- Bazaar-reported usage, refreshed each crawl; unverified, labelled as such on site
  reported_calls_30d bigint,
  reported_payers_30d bigint,
  reported_last_called_at timestamptz,
  -- probe cache: scheduling, 2-probe debounce and change detection
  last_probe_at timestamptz,
  last_probe_alive boolean,
  prev_probe_alive boolean,
  last_status_code int,
  last_accepts_hash text,
  last_price_usd numeric,
  created_at timestamptz not null default now()
);
create index endpoints_host_idx on endpoints (host);
create index endpoints_alive_idx on endpoints (last_probe_alive, delisted_at);
create index endpoints_chains_idx on endpoints using gin (chains);

create table probes (
  id bigint generated always as identity primary key,
  endpoint_id uuid not null references endpoints(id),
  probed_at timestamptz not null default now(),
  alive boolean not null,
  status_code int,
  latency_ms int,
  price_raw text,
  price_usd numeric,
  asset text,
  network text,
  chains text[],
  accepts_hash text,
  accepts_json jsonb,                  -- only when accepts_hash differs from the previous row
  error text
);
create index probes_endpoint_time_idx on probes (endpoint_id, probed_at desc);
create index probes_time_idx on probes (probed_at desc);

create table daily_stats (
  day date not null,
  endpoint_id uuid not null references endpoints(id),
  probes_total int not null default 0,
  probes_alive int not null default 0,
  latency_sum_ms bigint not null default 0,
  latency_count int not null default 0,
  alive_ratio numeric,                 -- filled by rollup_daily
  avg_latency_ms int,                  -- filled by rollup_daily
  price_usd numeric,
  primary key (day, endpoint_id)
);

create table daily_global (
  day date primary key,
  total_listed int not null default 0,
  total_hosts int not null default 0,
  live_count int not null default 0,
  median_price_usd numeric,
  new_endpoints int not null default 0,
  delisted_endpoints int not null default 0,
  raw_reported_volume_30d numeric,     -- Σ(reported calls × listed price) at crawl time
  chain_counts jsonb                   -- {"base": n, "solana": n, ...} live endpoints per chain
);

create table events (
  id bigint generated always as identity primary key,
  endpoint_id uuid not null references endpoints(id),
  occurred_at timestamptz not null default now(),
  kind text not null,                  -- listed|delisted|price_change|schema_change|died|revived
  detail jsonb
);
create index events_time_idx on events (occurred_at desc);
create index events_endpoint_idx on events (endpoint_id, occurred_at desc);

-- RLS: public read, writes only via service role (cron scripts)
alter table endpoints enable row level security;
alter table probes enable row level security;
alter table daily_stats enable row level security;
alter table daily_global enable row level security;
alter table events enable row level security;

create policy public_read_endpoints on endpoints for select using (true);
create policy public_read_probes on probes for select using (true);
create policy public_read_daily_stats on daily_stats for select using (true);
create policy public_read_daily_global on daily_global for select using (true);
create policy public_read_events on events for select using (true);

-- ————— batched write functions (called via rpc by the cron scripts) —————

-- Mark endpoints missing from a crawl; delist after `delist_after` consecutive misses.
-- Returns the ids delisted by this call.
create or replace function bump_missing(ids uuid[], delist_after int, at timestamptz)
returns setof uuid
language sql
security definer
set search_path = public
as $$
  update endpoints e
     set consecutive_missing_crawls = e.consecutive_missing_crawls + 1,
         delisted_at = case when e.consecutive_missing_crawls + 1 >= delist_after then at else null end
   where e.id = any(ids) and e.delisted_at is null
  returning case when e.delisted_at is not null then e.id end;
$$;

-- Apply probe results: refresh the endpoint cache and add to today's counters.
-- rows: [{id, at, alive, status, latency_ms, hash, price_usd, prev_alive}]
create or replace function apply_probe_results(rows jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update endpoints e set
    last_probe_at    = r.at,
    prev_probe_alive = r.prev_alive,
    last_probe_alive = r.alive,
    last_status_code = r.status,
    last_accepts_hash = coalesce(r.hash, e.last_accepts_hash),
    last_price_usd   = coalesce(r.price_usd, e.last_price_usd)
  from jsonb_to_recordset(rows) as r(
    id uuid, at timestamptz, alive boolean, status int, latency_ms int,
    hash text, price_usd numeric, prev_alive boolean)
  where e.id = r.id;

  insert into daily_stats as d (day, endpoint_id, probes_total, probes_alive, latency_sum_ms, latency_count, price_usd)
  select (r.at at time zone 'utc')::date, r.id, 1,
         case when r.alive then 1 else 0 end,
         case when r.alive then coalesce(r.latency_ms, 0) else 0 end,
         case when r.alive and r.latency_ms is not null then 1 else 0 end,
         r.price_usd
  from jsonb_to_recordset(rows) as r(id uuid, at timestamptz, alive boolean, latency_ms int, price_usd numeric)
  on conflict (day, endpoint_id) do update set
    probes_total   = d.probes_total + excluded.probes_total,
    probes_alive   = d.probes_alive + excluded.probes_alive,
    latency_sum_ms = d.latency_sum_ms + excluded.latency_sum_ms,
    latency_count  = d.latency_count + excluded.latency_count,
    price_usd      = coalesce(excluded.price_usd, d.price_usd);
end;
$$;

-- Idempotent daily rollup for `target`, safe to re-run.
create or replace function rollup_daily(target date)
returns void
language sql
security definer
set search_path = public
as $$
  update daily_stats set
    alive_ratio = case when probes_total > 0 then probes_alive::numeric / probes_total end,
    avg_latency_ms = case when latency_count > 0 then (latency_sum_ms / latency_count)::int end
  where day = target;

  insert into daily_global as g (day, total_listed, total_hosts, live_count, median_price_usd,
                                 new_endpoints, delisted_endpoints, chain_counts)
  select
    target,
    (select count(*) from endpoints where delisted_at is null),
    (select count(distinct host) from endpoints where delisted_at is null),
    (select count(*) from endpoints where delisted_at is null and last_probe_alive),
    (select percentile_cont(0.5) within group (order by last_price_usd)
       from endpoints where delisted_at is null and last_price_usd is not null),
    (select count(*) from endpoints where first_seen >= target and first_seen < target + 1),
    (select count(*) from endpoints where delisted_at >= target and delisted_at < target + 1),
    (select coalesce(jsonb_object_agg(c, n), '{}'::jsonb) from (
       select c, count(*) as n from endpoints, unnest(chains) as c
        where delisted_at is null and last_probe_alive group by c) t)
  on conflict (day) do update set
    total_listed = excluded.total_listed,
    total_hosts = excluded.total_hosts,
    live_count = excluded.live_count,
    median_price_usd = excluded.median_price_usd,
    new_endpoints = excluded.new_endpoints,
    delisted_endpoints = excluded.delisted_endpoints,
    chain_counts = excluded.chain_counts;
$$;
