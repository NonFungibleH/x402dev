// Parsing of x402 payment-required payloads and Bazaar listing accepts.
// Network and asset tables were built from the live Bazaar on 2026-10-06
// (docs/data-sources.md); decimals were confirmed by cross-chain price parity.
//   v1: maxAmountRequired + network names ("base", "base-sepolia")
//   v2: amount + CAIP-2 networks ("eip155:8453", "solana:<genesis>"), payload
//       in the body and/or a base64 PAYMENT-REQUIRED header

import { createHash } from "node:crypto";

export interface NetworkInfo {
  chain: string; // slug for known networks, the raw network id otherwise
  isTestnet: boolean;
  known: boolean;
}

const EVM: Record<number, [string, boolean]> = {
  1: ["ethereum", false], 11155111: ["ethereum", true],
  8453: ["base", false], 84532: ["base", true],
  137: ["polygon", false], 80002: ["polygon", true],
  42161: ["arbitrum", false], 421614: ["arbitrum", true],
  10: ["optimism", false], 11155420: ["optimism", true],
  43114: ["avalanche", false], 43113: ["avalanche", true],
  56: ["bsc", false], 97: ["bsc", true],
  42220: ["celo", false], 44787: ["celo", true], 11142220: ["celo", true],
  50: ["xdc", false], 51: ["xdc", true],
  480: ["worldchain", false], 4801: ["worldchain", true],
  1329: ["sei", false], 1328: ["sei", true],
  196: ["xlayer", false], 195: ["xlayer", true],
  999: ["hyperevm", false], 998: ["hyperevm", true],
  143: ["monad", false], 10143: ["monad", true],
  4663: ["robinhood", false],
  5042: ["arc", false], 5042002: ["arc", true],
  130: ["unichain", false], 1301: ["unichain", true],
  146: ["sonic", false],
};

const V1_NAMES: Record<string, [string, boolean]> = {
  base: ["base", false], "base-sepolia": ["base", true],
  solana: ["solana", false], "solana-devnet": ["solana", true],
  polygon: ["polygon", false], "polygon-amoy": ["polygon", true],
  avalanche: ["avalanche", false], "avalanche-fuji": ["avalanche", true],
  sei: ["sei", false], "sei-testnet": ["sei", true],
  xlayer: ["xlayer", false], "xlayer-testnet": ["xlayer", true],
};

export function networkInfo(network: string | undefined | null): NetworkInfo {
  if (!network) return { chain: "unknown", isTestnet: false, known: false };
  const n = network.trim();
  const ok = (chain: string, isTestnet: boolean): NetworkInfo => ({ chain, isTestnet, known: true });

  if (V1_NAMES[n]) return ok(...V1_NAMES[n]);
  const colon = n.indexOf(":");
  const ns = colon < 0 ? n : n.slice(0, colon);
  const ref = colon < 0 ? "" : n.slice(colon + 1);
  switch (ns) {
    case "eip155": {
      const hit = EVM[Number(ref)];
      return hit ? ok(...hit) : { chain: n, isTestnet: false, known: false };
    }
    case "solana":
      // mainnet genesis appears in full and truncated forms, plus "solana:mainnet"
      return ok("solana", !(ref === "mainnet" || ref.startsWith("5eykt4UsFv8P8NJdTREp")));
    case "stellar":
      return ok("stellar", ref !== "pubnet");
    case "algorand":
      return ok("algorand", !ref.startsWith("wGHE2Pwdvd7S12BL5FaOP20EGYesN73k"));
    case "xrpl":
      return ok("xrpl", ref !== "0");
    case "hedera":
      return ok("hedera", ref !== "mainnet");
    case "cosmos":
      if (ref.startsWith("noble")) return ok("noble", ref !== "noble-1");
      return { chain: n, isTestnet: false, known: false };
    default:
      return { chain: n, isTestnet: false, known: false };
  }
}

// USD stablecoins → decimals. EVM keys lowercased; other chains keep their case.
// Anything not listed (EURC, wSOL, XRP, unrecognised tokens) has no USD price;
// price_raw is still recorded verbatim.
const USD_ASSETS: Record<string, number> = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 6, // base USDC
  "0x036cbd53842c5426634e7929541ec2318f3dcf7e": 6, // base-sepolia USDC
  "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": 6, // polygon USDC
  "0xc2132d05d31c914a87c6611c10748aeb04b58e8f": 6, // polygon USDT
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831": 6, // arbitrum USDC
  "0x0b2c639c533813f4aa9d7837caf62653d097ff85": 6, // optimism USDC
  "0x3600000000000000000000000000000000000000": 6, // arc USDC (ERC-20 interface)
  "0x754704bc059f8c67012fed69bc8a327a5aafb603": 6, // monad USDC
  "0x5fc5360d0400a0fd4f2af552add042d716f1d168": 6, // robinhood Global Dollar (USDG)
  "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e": 6, // avalanche USDC
  "0xe15fc38f6d8c56af07bbcbe3baf5708a2bf42392": 6, // sei USDC
  "0xceba9300f2b948710d2653dd7b07f33a8b32118c": 6, // celo USDC
  "0x79a02482a880bce3f13e09da970dc34db4cd24d1": 6, // worldchain USDC
  "0x779ded0c9e1022225f8e0630b35a9b54be713736": 6, // xlayer USD₮0
  "0xb88339cb7199b77e23db6e890353e22632ba630f": 6, // hyperevm USDC
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 6, // ethereum USDC
  "0x078d782b760474a361dda0af3839290b0ef57ad6": 6, // unichain USDC
  "0x29219dd400f2bf60e5a23d13be72b486d4038894": 6, // sonic USDC.e
  "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d": 18, // bsc USD1
  "0xce24439f2d9c6a2289f741120fe202248b666666": 18, // bsc United Stables
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": 18, // bsc USDC
  "0x55d398326f99059ff775485246999027b3197955": 18, // bsc USDT
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 6, // solana USDC
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 6, // solana USDT
  "31566704": 6, // algorand USDC ASA
  CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75: 7, // stellar USDC (SAC)
  "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN": 7, // stellar USDC (classic)
  uusdc: 6, // noble USDC
  "0.0.456858": 6, // hedera USDC
};

export function priceToUsd(amount: string | undefined | null, asset: string | undefined | null): number | null {
  if (amount == null || asset == null) return null;
  const key = asset.startsWith("0x") ? asset.toLowerCase() : asset;
  const decimals = USD_ASSETS[key];
  if (decimals === undefined) return null;
  const a = String(amount).trim();
  if (!/^\d+$/.test(a)) return null;
  const n = Number(a);
  if (!Number.isFinite(n)) return null;
  return n / 10 ** decimals;
}

export interface ParsedAccept {
  priceRaw: string | null;
  priceUsd: number | null;
  asset: string | null;
  network: string | null;
  chain: string;
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
    priceUsd: priceToUsd(priceRaw, asset),
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

export interface Parsed402 {
  accept: ParsedAccept; // first accept = the server's preferred terms
  accepts: unknown[];
  acceptsHash: string;
  chains: string[]; // every mainnet chain accepted, in order, deduped
}

export function mainnetChains(accepts: ParsedAccept[]): string[] {
  const out: string[] = [];
  for (const a of accepts) if (!a.isTestnet && !out.includes(a.chain)) out.push(a.chain);
  return out;
}

export function parse402Body(body: unknown): Parsed402 | null {
  if (!body || typeof body !== "object") return null;
  const accepts = (body as { accepts?: unknown }).accepts;
  if (!Array.isArray(accepts) || accepts.length === 0) return null;
  const parsed = accepts.map((a) => parseAccept((a ?? {}) as RawAccept));
  return {
    accept: parsed[0],
    accepts,
    acceptsHash: canonicalHash(accepts),
    chains: mainnetChains(parsed),
  };
}

export function parsePaymentRequiredHeader(value: string | null | undefined): Parsed402 | null {
  if (!value) return null;
  const v = value.trim();
  for (const candidate of [v, Buffer.from(v, "base64").toString("utf8")]) {
    try {
      const p = parse402Body(JSON.parse(candidate));
      if (p) return p;
    } catch {
      /* try next encoding */
    }
  }
  return null;
}

export function parse402Response(bodyText: string, headerValue: string | null | undefined): Parsed402 | null {
  try {
    const fromBody = parse402Body(JSON.parse(bodyText));
    if (fromBody) return fromBody;
  } catch {
    /* body not JSON — header carries the payload */
  }
  return parsePaymentRequiredHeader(headerValue);
}
