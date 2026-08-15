-- x402.dev schema v1 — per build brief §4, adjusted 2026-08-15 for real Bazaar scale
-- (15k listings): reported-usage columns from the Bazaar quality field, a global daily
-- rollup table, and accepts_json stored only on change.

create table endpoints (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,            -- normalized (lowercase host, no trailing slash)
  name text,
  description text,
  source text not null,                -- 'bazaar' | ...
  first_seen timestamptz not null default now(),
  last_seen_listed timestamptz,
  delisted_at timestamptz,             -- absent from listings 3+ consecutive crawls
  operator_hint text,
  chain text,                          -- 'base' | 'solana' | 'other' | testnet names
  is_testnet boolean not null default false,
  pay_to_address text,
  x402_version int,
  -- Bazaar-reported usage (refreshed each crawl; unverified, labelled as such on site)
  reported_calls_30d bigint,
  reported_payers_30d bigint,
  reported_last_called_at timestamptz,
  -- probe-derived cache: tiering, 2-probe debounce, and change detection without
  -- per-endpoint queries against the probes table
  last_probe_at timestamptz,
  last_probe_alive boolean,
  prev_probe_alive boolean,
  last_accepts_hash text,
  last_price_usdc numeric,
  consecutive_missing_crawls int not null default 0,
  created_at timestamptz not null default now()
);
create index endpoints_alive_idx on endpoints (last_probe_alive, delisted_at);
create index endpoints_listed_idx on endpoints (last_seen_listed desc);

create table probes (
  id bigint generated always as identity primary key,
  endpoint_id uuid not null references endpoints(id),
  probed_at timestamptz not null default now(),
  alive boolean not null,
  status_code int,
  latency_ms int,
  price_raw text,
  price_usdc numeric,
  asset text,
  network text,
  accepts_hash text,
  accepts_json jsonb,                  -- null unless accepts_hash changed since previous probe
  error text
);
create index probes_endpoint_time_idx on probes (endpoint_id, probed_at desc);
create index probes_time_idx on probes (probed_at desc);

create table daily_stats (
  day date not null,
  endpoint_id uuid not null references endpoints(id),
  alive_ratio numeric,
  median_latency_ms int,
  price_usdc numeric,
  schema_changed boolean not null default false,
  primary key (day, endpoint_id)
);

-- global rollup: one row per day, powers P100 without scanning probes
create table daily_global (
  day date primary key,
  total_listed int not null,
  live_count int not null,
  median_price_usdc numeric,
  new_endpoints int not null default 0,
  delisted_endpoints int not null default 0,
  raw_reported_volume_30d numeric      -- Σ(reported calls × price) at crawl time
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

-- Idempotent daily rollup, called by scripts/rollup-daily.ts via rpc.
create or replace function rollup_daily(target date)
returns void
language sql
security definer
set search_path = public
as $$
  insert into daily_stats (day, endpoint_id, alive_ratio, median_latency_ms, price_usdc, schema_changed)
  select
    target,
    p.endpoint_id,
    avg(case when p.alive then 1.0 else 0.0 end),
    percentile_cont(0.5) within group (order by p.latency_ms) filter (where p.alive)::int,
    (array_agg(p.price_usdc order by p.probed_at desc) filter (where p.price_usdc is not null))[1],
    bool_or(p.accepts_json is not null and exists (
      select 1 from probes prev
      where prev.endpoint_id = p.endpoint_id and prev.probed_at < p.probed_at
    ))
  from probes p
  where p.probed_at >= target and p.probed_at < target + 1
  group by p.endpoint_id
  on conflict (day, endpoint_id) do update set
    alive_ratio = excluded.alive_ratio,
    median_latency_ms = excluded.median_latency_ms,
    price_usdc = excluded.price_usdc,
    schema_changed = excluded.schema_changed;

  insert into daily_global (day, total_listed, live_count, median_price_usdc, new_endpoints, delisted_endpoints)
  select
    target,
    (select count(*) from endpoints where delisted_at is null),
    (select count(*) from endpoints where delisted_at is null and last_probe_alive),
    (select percentile_cont(0.5) within group (order by last_price_usdc)
       from endpoints where delisted_at is null and last_price_usdc is not null),
    (select count(*) from endpoints where first_seen >= target and first_seen < target + 1),
    (select count(*) from endpoints where delisted_at >= target and delisted_at < target + 1)
  on conflict (day) do update set
    total_listed = excluded.total_listed,
    live_count = excluded.live_count,
    median_price_usdc = excluded.median_price_usdc,
    new_endpoints = excluded.new_endpoints,
    delisted_endpoints = excluded.delisted_endpoints;
$$;
