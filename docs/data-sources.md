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

## Probe-scale consequences (decided 2026-08-15)

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
