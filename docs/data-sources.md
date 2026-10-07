# Data sources

> Verified live on **2026-08-15** (Europe/London). Everything below was tested by hand on that
> date; shapes may drift — re-verify before changing parser behaviour.

## Primary: Coinbase CDP Bazaar discovery API

```
GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?limit=100&offset=0
```

- **No authentication required.** Plain GET, JSON response.
- Response: `{ items: [...], pagination: { limit, offset, total }, x402Version }`
- **15,070 total resources** at verification time, across **1,548 unique hosts**. All
  `resource` URLs were unique after normalization — heavy multi-listing per host
  (api.m2mcent.com alone lists 965 resources).
- Page through with `offset` steps of 100. Full sweep ≈ 151 requests; be polite (≥150ms gap).

### Item shape (x402Version 2, 97% of listings)

```jsonc
{
  "resource": "https://api.example.com/thing",   // the endpoint URL — our primary key source
  "type": "http",
  "x402Version": 2,
  "lastUpdated": "2026-08-15T18:21:30.876Z",
  "description": "…",
  "accepts": [{
    "amount": "3000",                 // atomic units (USDC = 6dp) — v1 used maxAmountRequired
    "asset": "0x8335…2913",           // token contract / mint
    "network": "eip155:8453",         // CAIP-2 in v2; v1 used names like "base"
    "payTo": "0x…", "recipient": "0x…",
    "scheme": "exact",                // also seen: batch-settlement
    "maxTimeoutSeconds": 3600,
    "extra": { ... }
  }],
  "extensions": { "bazaar": { "info": {...}, "schema": {...} } },  // request/response schema
  "quality": {                        // ★ usage telemetry reported by the Bazaar
    "l30DaysTotalCalls": 836,
    "l30DaysUniquePayers": 832,
    "lastCalledAt": "2026-08-15T18:21:30.731Z"
  }
}
```

### Version differences the parser must handle

| Field | v1 (441 listings) | v2 (14,629 listings) |
|---|---|---|
| price | `maxAmountRequired` | `amount` |
| network | `"base"`, `"base-sepolia"` | CAIP-2: `"eip155:8453"`, `"solana:5eykt…"` |

Network distribution at verification: eip155:8453 (base) 14,300 · base 429 ·
solana 202 · eip155:84532 (base-sepolia, testnet) 99 · eip155:196 (X Layer) 18 ·
base-sepolia 16 · algorand 3 · eip155:56 (BSC) 1.

### The `quality` field is load-bearing

The Bazaar self-reports 30-day usage per endpoint. Sweep totals on 2026-08-15:

- **15,003 of 15,070** endpoints report >0 calls in 30 days (suspicious on its face)
- **333,824 total reported calls**, **41,462 unique payers**
- **Σ(calls × price) ≈ $20,141.63** reported 30-day volume across the entire ecosystem

This powers the P100 "RAW REPORTED VOLUME" figure (label: *as reported by Bazaar listings,
unverified*) and later feeds Real Agent Volume analysis (calls-per-payer distribution is an
obvious wash signal). We store `reported_calls_30d` / `reported_payers_30d` per endpoint at
each crawl.

## Secondary / cross-reference only

- **x402scan.com** — live explorer, but no public REST API (tRPC internals, guessed public
  paths 404). Use manually to sanity-check figures; do not scrape.
- **x402.org/facilitator** — testnet facilitator, no discovery route (404 on
  /discovery/resources).
- Others from the brief (x402-list.com, agentic.market, pay.sh, ampersend) — not evaluated;
  Bazaar coverage (15k resources) makes additional sources a Phase-2 question rather than a
  launch need.

## Re-verification 2026-10-06/07

The Bazaar more than doubled: **35,119 listings across 2,135 hosts** (from 15,070 / 1,548
in August). Growth is concentrated: one host (market.datapackvibe.com) alone lists 13,773
(39%). 34,931 listings are x402 v2.

**Multi-chain is now the norm.** 9,893 listings accept more than one network; 25+ networks
appear. Listing counts by network (any accept): Base 34,628 · Solana 7,136 · Polygon 4,139 ·
Arbitrum 2,507 · Optimism 1,613 · Arc (eip155:5042) 1,111 · Monad 891 · Robinhood Chain 727 ·
Avalanche 680 · Sei 658 · XRPL 638 · Celo 610 · Stellar 605 · Algorand 480 · World Chain 320 ·
X Layer 125 · BNB Chain 115 · HyperEVM 82 · Ethereum 75 · Noble 49 (plus testnets and a tail
of rarer networks).

**Stablecoin decimals were confirmed from the data, not assumed:** for listings quoting the
same service on several chains, the amount ratio against Base USDC gives each token's
decimals. All USDC deployments are 6dp, including Arc's 0x3600…0000; Robinhood Chain prices
in USDG (6dp); BNB Chain stablecoins (USD1, United Stables, BSC-USDC, BSC-USDT) are 18dp;
Stellar USDC is 7dp. The table lives in `lib/x402/parse.ts` (`USD_ASSETS`). EURC, wSOL, XRP
and unrecognised tokens get no USD price.

**v2 transport:** 252 of 262 sampled 402 responses also carry the payload in a base64
`PAYMENT-REQUIRED` header; some send it only there. The parser reads the body first and
falls back to the header.

**HTTP method matters.** In a 400-endpoint sample probed with GET, 60 (15%) returned 405 —
all were listings that declare `POST` in `extensions.bazaar.info.input.method`. Probing with
the listed method (empty JSON body) fixed it: in a 938-endpoint dry run, 896 returned 402
(895 parsed) and only 1 returned 405.

**Dead listings.** Sampling one endpoint per host, 53 of 400 hosts (13%) answered 404 —
listed but gone. Per-listing the rate is lower because large hosts dominate the count; the
site should report both.

## Storage model (revised 2026-10-07)

Per-probe rows don't fit the free tier at 35k endpoints, so the schema stores:

- **`probes`: one row per state change** (alive, status code, accepts hash or price
  differs from the cached last state). Unchanged probes write nothing there.
- **`daily_stats`: one row per endpoint per day** with probe counters
  (`probes_total`, `probes_alive`, latency sum/count). Uptime and average latency are
  exact; per-probe latency for unchanged probes is not kept.
- Together these reconstruct every endpoint's state history losslessly.

Estimated growth ≈ 4–5 MB/day (dominated by `daily_stats`), so the 500 MB free tier lasts
roughly 3–4 months. Before then: archive old `daily_stats` to a public compressed dump, or
move to Supabase Pro.

## Probe scheduling (revised 2026-10-07)

- 4 parallel jobs, **sharded by host** so the per-host limit holds globally.
- At most 2 concurrent requests per host, 32 per job, 10s timeout.
- At most 400 endpoints per host per run, oldest-probed first — large hosts rotate
  through their listings instead of being hammered every 6 hours.
- Responsive endpoints every 6h; unresponsive and delisted ones in the 00:30 UTC full sweep.
- Hard guard: never the same endpoint twice within 15 minutes.
- Dry-run locally against a listings file: `PROBE_DRY_FILE=listings.json npx tsx scripts/probe-endpoints.ts`

## Original scale notes (2026-08-15, superseded above)

The build brief assumed a few hundred endpoints; reality is 15k listings / 1.5k hosts:

1. **Probe cadence is tiered by our own observations** (Bazaar quality data can't be used for
   tiering — 99.6% of listings claim usage): endpoints that responded to their last probe are
   probed every 6h; unresponsive ones daily. First cycle probes everything.
2. **`accepts_json` is stored only when `accepts_hash` changes**, otherwise null — keeps the
   probes table lean at this row rate.
3. Politeness guard stays: never probe the same endpoint more than once per 15 minutes; probe
   batches of 25 with 10s timeout; UA `x402dev-monitor/1.0 (+https://x402.dev)`.
4. Supabase free tier (500MB) holds roughly 4–6 months of probes at this scale. Decision on
   Pro vs cold archival deferred until the data is real (tracked in launch checklist).
