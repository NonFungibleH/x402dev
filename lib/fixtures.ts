// Deterministic demo data for TEST TRANSMISSION mode.
// Everything on the site derives from these rows so the numbers stay internally consistent.

export type Status = "alive" | "dead" | "no402" | "delisted";

export interface EndpointRow {
  slug: string;
  url: string;
  name: string;
  description: string;
  source: string;
  chain: "base" | "solana" | "other";
  payTo: string;
  firstSeen: string;
  delistedAt: string | null;
  diedAt: string | null;
  status: Status;
  priceUsdc: number | null;
  priceDelta30d: number | null;
  uptime30d: number;
  uptimeSeries: number[];
  latencySeries: number[];
  priceSeries: { day: string; price: number }[];
  acceptsJson: object | null;
}

export interface EventRow {
  at: string;
  kind: "listed" | "delisted" | "price_change" | "schema_change" | "died" | "revived";
  slug: string;
  name: string;
  detail?: { old?: string; new?: string };
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOW = new Date();
const DAY = 86400000;
const iso = (d: Date) => d.toISOString();
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

interface Seed {
  name: string; host: string; path: string; desc: string;
  chain: "base" | "solana" | "other"; status: Status;
  price: number | null; ageDays: number; deadDays?: number;
}

const SEEDS: Seed[] = [
  { name: "Tollbooth Search", host: "api.tollbooth.dev", path: "/search", desc: "Web search results for agents, paid per query.", chain: "base", status: "alive", price: 0.005, ageDays: 92 },
  { name: "Pinquery Embeddings", host: "x402.pinquery.io", path: "/v1/embed", desc: "Text embeddings, 1536-dim, per-call billing.", chain: "base", status: "alive", price: 0.0008, ageDays: 88 },
  { name: "Mnemosyne Memory", host: "api.mnemosyne.sh", path: "/recall", desc: "Long-term memory store and retrieval for autonomous agents.", chain: "base", status: "alive", price: 0.002, ageDays: 71 },
  { name: "Chainsight Quotes", host: "quotes.chainsight.xyz", path: "/spot", desc: "Real-time token spot prices across 40 venues.", chain: "solana", status: "alive", price: 0.001, ageDays: 84 },
  { name: "Parcelwatch", host: "api.parcelwatch.co", path: "/track", desc: "Parcel tracking lookups across 60 carriers.", chain: "base", status: "alive", price: 0.01, ageDays: 63 },
  { name: "Veridex KYB", host: "kyb.veridex.io", path: "/check", desc: "Business registry lookups for counterparty checks.", chain: "base", status: "no402", price: null, ageDays: 55 },
  { name: "Sonnet Weather", host: "wx.sonnet.ag", path: "/forecast", desc: "Hyperlocal forecasts, per-request pricing.", chain: "solana", status: "alive", price: 0.0005, ageDays: 79 },
  { name: "Ledgerline OCR", host: "ocr.ledgerline.app", path: "/parse", desc: "Receipt and invoice OCR to structured JSON.", chain: "base", status: "alive", price: 0.02, ageDays: 47 },
  { name: "Nightjar Proxy", host: "api.nightjar.cc", path: "/fetch", desc: "Headless fetch with JS rendering for agent crawlers.", chain: "base", status: "dead", price: 0.003, ageDays: 66, deadDays: 4 },
  { name: "Cartouche Translate", host: "x402.cartouche.dev", path: "/translate", desc: "Machine translation, 90 language pairs.", chain: "base", status: "alive", price: 0.0015, ageDays: 58 },
  { name: "Hexline RPC Relay", host: "relay.hexline.net", path: "/rpc", desc: "Metered multi-chain RPC relay.", chain: "solana", status: "alive", price: 0.0002, ageDays: 90 },
  { name: "Stipple Images", host: "img.stipple.art", path: "/generate", desc: "Image generation, per-render billing.", chain: "base", status: "alive", price: 0.04, ageDays: 39 },
  { name: "Corvid Classify", host: "api.corvid.ml", path: "/classify", desc: "Zero-shot text classification endpoint.", chain: "base", status: "delisted", price: 0.001, ageDays: 81, deadDays: 12 },
  { name: "Fathom Depth", host: "api.fathomdepth.io", path: "/bathy", desc: "Bathymetric and elevation tile data.", chain: "other", status: "dead", price: 0.008, ageDays: 74, deadDays: 19 },
  { name: "Quill Summarise", host: "x402.quill.ink", path: "/summarise", desc: "Document summarisation, per-page pricing.", chain: "base", status: "alive", price: 0.006, ageDays: 33 },
  { name: "Beacon Geocode", host: "geo.beacon.works", path: "/geocode", desc: "Forward and reverse geocoding.", chain: "solana", status: "alive", price: 0.0004, ageDays: 52 },
  { name: "Tessera Scrape", host: "api.tessera.tools", path: "/extract", desc: "Structured extraction from arbitrary URLs.", chain: "base", status: "no402", price: null, ageDays: 26 },
  { name: "Drover Compute", host: "gpu.drover.run", path: "/infer", desc: "Serverless GPU inference, per-second metering.", chain: "base", status: "alive", price: 0.09, ageDays: 44 },
];

const PARTS_A = ["Argus", "Bellman", "Cinder", "Dovetail", "Ember", "Foxglove", "Gannet", "Harrier", "Isobar", "Junction", "Kestrel", "Lantern", "Marrow", "Nimbus", "Osprey", "Pallet", "Quarry", "Rushlight", "Saltire", "Tamarind", "Umber", "Vellum", "Wicket", "Yarrow"];
const PARTS_B = ["Search", "Feeds", "Lookup", "Index", "Signals", "Vision", "Audio", "Graph", "Cache", "Router", "Notary", "Archive"];
const TLDS = ["dev", "io", "xyz", "app", "net", "sh", "co", "tools"];

function genSeeds(count: number, rnd: () => number): Seed[] {
  const out: Seed[] = [];
  for (let i = 0; i < count; i++) {
    const a = PARTS_A[Math.floor(rnd() * PARTS_A.length)];
    const b = PARTS_B[Math.floor(rnd() * PARTS_B.length)];
    const name = `${a} ${b}`;
    if (out.some((s) => s.name === name) || SEEDS.some((s) => s.name === name)) { i--; continue; }
    const r = rnd();
    const status: Status = r < 0.68 ? "alive" : r < 0.78 ? "no402" : r < 0.88 ? "dead" : "delisted";
    const chain = rnd() < 0.62 ? "base" : rnd() < 0.85 ? "solana" : "other";
    const price = status === "no402" ? null : Math.round(rnd() * 200 + 2) / 10000;
    const ageDays = Math.floor(rnd() * 88) + 2;
    const deadDays = status === "dead" || status === "delisted" ? Math.min(ageDays - 2, Math.floor(rnd() * 25) + 1) : undefined;
    out.push({
      name,
      host: `api.${a.toLowerCase()}${b.toLowerCase()}.${TLDS[Math.floor(rnd() * TLDS.length)]}`,
      path: `/${b.toLowerCase()}`,
      desc: `${b} API for autonomous agents, per-call pricing.`,
      chain, status, price, ageDays, deadDays,
    });
  }
  return out;
}

function series(rnd: () => number, seed: Seed): { uptime: number[]; latency: number[] } {
  const uptime: number[] = [];
  const latency: number[] = [];
  const base = 120 + Math.floor(rnd() * 500);
  for (let d = 29; d >= 0; d--) {
    let u = rnd() < 0.06 ? 0.75 : 1;
    if (seed.deadDays !== undefined && d < seed.deadDays) u = 0;
    if (seed.ageDays < 30 && 29 - d < 30 - seed.ageDays) u = -1; // not yet listed
    uptime.push(u);
    latency.push(u > 0 ? Math.round(base * (0.85 + rnd() * 0.5)) : 0);
  }
  return { uptime, latency };
}

function build(): { endpoints: EndpointRow[]; events: EventRow[] } {
  const rnd = mulberry32(0x402);
  const seeds = [...SEEDS, ...genSeeds(28, rnd)];
  const events: EventRow[] = [];

  const endpoints = seeds.map((s) => {
    const { uptime, latency } = series(rnd, s);
    const live = uptime.filter((u) => u >= 0);
    const uptimePct = live.length ? Math.round((live.reduce((a, b) => a + (b > 0 ? b : 0), 0) / live.length) * 1000) / 10 : 0;
    const slug = `${s.host.replace(/\./g, "-")}${s.path.replace(/\//g, "-")}`;
    const firstSeen = daysAgo(s.ageDays);
    const diedAt = s.deadDays !== undefined ? daysAgo(s.deadDays) : null;
    const delistedAt = s.status === "delisted" ? daysAgo(Math.max(0, (s.deadDays ?? 3) - 3)) : null;

    const priceSeries: { day: string; price: number }[] = [];
    let p = s.price;
    let delta: number | null = null;
    if (p !== null) {
      const steps = Math.floor(rnd() * 3);
      let cur = p;
      const changes: number[] = [];
      for (let k = 0; k < steps; k++) changes.push(Math.floor(rnd() * 25) + 2);
      for (let d = Math.min(s.ageDays, 60); d >= 0; d--) {
        if (changes.includes(d)) {
          const old = cur;
          cur = Math.round(cur * (rnd() < 0.6 ? 1.5 : 0.66) * 10000) / 10000 || old;
          if (d <= (s.deadDays ?? -1)) { cur = old; } else {
            events.push({ at: iso(daysAgo(d)), kind: "price_change", slug, name: s.name, detail: { old: `${old} USDC`, new: `${cur} USDC` } });
          }
        }
        priceSeries.push({ day: daysAgo(d).toISOString().slice(0, 10), price: cur });
      }
      p = cur;
      const p30 = priceSeries.find((x) => x.day === daysAgo(30).toISOString().slice(0, 10))?.price ?? priceSeries[0].price;
      delta = p30 ? Math.round(((p - p30) / p30) * 1000) / 10 : 0;
    }

    events.push({ at: iso(firstSeen), kind: "listed", slug, name: s.name });
    if (diedAt && s.status === "dead") events.push({ at: iso(diedAt), kind: "died", slug, name: s.name });
    if (delistedAt) {
      if (diedAt) events.push({ at: iso(diedAt), kind: "died", slug, name: s.name });
      events.push({ at: iso(delistedAt), kind: "delisted", slug, name: s.name });
    }
    if (rnd() < 0.22 && s.status === "alive") {
      events.push({ at: iso(daysAgo(Math.floor(rnd() * 10) + 1)), kind: "schema_change", slug, name: s.name });
    }
    if (rnd() < 0.1 && s.status === "alive") {
      const d = Math.floor(rnd() * 14) + 2;
      events.push({ at: iso(daysAgo(d)), kind: "died", slug, name: s.name });
      events.push({ at: iso(daysAgo(d - 1)), kind: "revived", slug, name: s.name });
    }

    const row: EndpointRow = {
      slug,
      url: `https://${s.host}${s.path}`,
      name: s.name,
      description: s.desc,
      source: "bazaar",
      chain: s.chain,
      payTo: s.chain === "solana"
        ? "7fUAJdStEuGbc3sM84cKRL6yYaaSstyLSU4ve5oovLS7"
        : "0x" + Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(rnd() * 16)]).join(""),
      firstSeen: iso(firstSeen),
      delistedAt: delistedAt ? iso(delistedAt) : null,
      diedAt: diedAt ? iso(diedAt) : null,
      status: s.status,
      priceUsdc: p,
      priceDelta30d: delta,
      uptime30d: uptimePct,
      uptimeSeries: uptime,
      latencySeries: latency,
      priceSeries,
      acceptsJson: p === null ? null : {
        x402Version: 1,
        accepts: [{
          scheme: "exact",
          network: s.chain === "solana" ? "solana" : "base",
          maxAmountRequired: String(Math.round(p * 1e6)),
          resource: `https://${s.host}${s.path}`,
          description: s.desc,
          mimeType: "application/json",
          payTo: s.chain === "solana" ? "7fUAJdStEuGbc3sM84cKRL6yYaaSstyLSU4ve5oovLS7" : "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
          maxTimeoutSeconds: 60,
          asset: s.chain === "solana" ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        }],
      },
    };
    return row;
  });

  endpoints.sort((a, b) => a.firstSeen.localeCompare(b.firstSeen));
  events.sort((a, b) => b.at.localeCompare(a.at));
  return { endpoints, events };
}

const data = build();
export const ENDPOINTS = data.endpoints;
export const EVENTS = data.events;
