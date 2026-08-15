// Parsing of x402 payment-required payloads and Bazaar listing accepts.
// Handles both spec generations observed live on 2026-08-15 (docs/data-sources.md):
//   v1: maxAmountRequired + network names ("base", "base-sepolia")
//   v2: amount + CAIP-2 networks ("eip155:8453", "solana:<genesis>")

import { createHash } from "node:crypto";

export interface NetworkInfo {
  chain: "base" | "solana" | "other";
  isTestnet: boolean;
}

const SOLANA_MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

export function networkInfo(network: string | undefined | null): NetworkInfo {
  if (!network) return { chain: "other", isTestnet: false };
  const n = network.trim();
  if (n === "base" || n === "eip155:8453") return { chain: "base", isTestnet: false };
  if (n === "base-sepolia" || n === "eip155:84532") return { chain: "base", isTestnet: true };
  if (n === "solana" || n === `solana:${SOLANA_MAINNET_GENESIS}`) return { chain: "solana", isTestnet: false };
  if (n.startsWith("solana:")) return { chain: "solana", isTestnet: true };
  return { chain: "other", isTestnet: false };
}

// Known USDC assets → decimals. Anything else: price in USDC is unknown (null),
// price_raw is still recorded verbatim.
const USDC_ASSETS: Record<string, number> = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 6, // base
  "0x036cbd53842c5426634e7929541ec2318f3dcf7e": 6, // base-sepolia
  "epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v": 6, // solana
};

export function priceToUsdc(amount: string | undefined | null, asset: string | undefined | null): number | null {
  if (amount == null || asset == null) return null;
  const decimals = USDC_ASSETS[asset.toLowerCase()];
  if (decimals === undefined) return null;
  if (!/^\d+$/.test(amount.trim())) return null;
  const n = Number(amount.trim());
  if (!Number.isFinite(n)) return null;
  return n / 10 ** decimals;
}

export interface ParsedAccept {
  priceRaw: string | null;
  priceUsdc: number | null;
  asset: string | null;
  network: string | null;
  chain: NetworkInfo["chain"];
  isTestnet: boolean;
  payTo: string | null;
  scheme: string | null;
}

interface RawAccept {
  amount?: string;
  maxAmountRequired?: string;
  asset?: string;
  network?: string;
  payTo?: string;
  recipient?: string;
  scheme?: string;
  [k: string]: unknown;
}

export function parseAccept(a: RawAccept): ParsedAccept {
  const priceRaw = a.amount ?? a.maxAmountRequired ?? null;
  const asset = a.asset ?? null;
  const network = a.network ?? null;
  const { chain, isTestnet } = networkInfo(network);
  return {
    priceRaw,
    priceUsdc: priceToUsdc(priceRaw, asset),
    asset,
    network,
    chain,
    isTestnet,
    payTo: a.payTo ?? a.recipient ?? null,
    scheme: a.scheme ?? null,
  };
}

function sortKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeysDeep((v as Record<string, unknown>)[k])])
    );
  }
  return v;
}

export function canonicalHash(accepts: unknown): string {
  return createHash("sha256").update(JSON.stringify(sortKeysDeep(accepts))).digest("hex");
}

export function parse402Body(
  body: unknown
): { accept: ParsedAccept; acceptsHash: string; accepts: unknown[] } | null {
  if (!body || typeof body !== "object") return null;
  const accepts = (body as { accepts?: unknown }).accepts;
  if (!Array.isArray(accepts) || accepts.length === 0) return null;
  return {
    accept: parseAccept(accepts[0] as RawAccept),
    acceptsHash: canonicalHash(accepts),
    accepts,
  };
}
