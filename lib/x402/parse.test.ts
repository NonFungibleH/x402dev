import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./normalize";
import {
  canonicalHash,
  networkInfo,
  parseAccept,
  parse402Body,
  parse402Response,
  parsePaymentRequiredHeader,
  priceToUsd,
} from "./parse";
import { transition } from "./status";

describe("normalizeUrl", () => {
  it("lowercases scheme and host, keeps path case", () => {
    expect(normalizeUrl("HTTPS://Api.Example.COM/Thing")).toBe("https://api.example.com/Thing");
  });
  it("strips trailing slash but keeps root", () => {
    expect(normalizeUrl("https://a.com/x/")).toBe("https://a.com/x");
    expect(normalizeUrl("https://a.com/")).toBe("https://a.com");
  });
  it("drops default ports and fragments, keeps query", () => {
    expect(normalizeUrl("https://a.com:443/x?b=1#frag")).toBe("https://a.com/x?b=1");
    expect(normalizeUrl("http://a.com:80/x")).toBe("http://a.com/x");
    expect(normalizeUrl("https://a.com:8443/x")).toBe("https://a.com:8443/x");
  });
});

describe("networkInfo", () => {
  it("maps CAIP-2 EVM chains seen in the Bazaar", () => {
    expect(networkInfo("eip155:8453")).toEqual({ chain: "base", isTestnet: false, known: true });
    expect(networkInfo("eip155:84532")).toEqual({ chain: "base", isTestnet: true, known: true });
    expect(networkInfo("eip155:137").chain).toBe("polygon");
    expect(networkInfo("eip155:42161").chain).toBe("arbitrum");
    expect(networkInfo("eip155:5042").chain).toBe("arc");
    expect(networkInfo("eip155:143").chain).toBe("monad");
    expect(networkInfo("eip155:4663").chain).toBe("robinhood");
    expect(networkInfo("eip155:56").chain).toBe("bsc");
  });
  it("maps v1 network names", () => {
    expect(networkInfo("base")).toEqual({ chain: "base", isTestnet: false, known: true });
    expect(networkInfo("base-sepolia")).toEqual({ chain: "base", isTestnet: true, known: true });
    expect(networkInfo("polygon").chain).toBe("polygon");
    expect(networkInfo("solana")).toEqual({ chain: "solana", isTestnet: false, known: true });
  });
  it("maps non-EVM namespaces, including variant spellings", () => {
    expect(networkInfo("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")).toEqual({ chain: "solana", isTestnet: false, known: true });
    expect(networkInfo("solana:mainnet").chain).toBe("solana");
    expect(networkInfo("solana:5eykt4UsFv8P8NJdTREpYbfj1W7N2H4").isTestnet).toBe(false);
    expect(networkInfo("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1")).toEqual({ chain: "solana", isTestnet: true, known: true });
    expect(networkInfo("stellar:pubnet").chain).toBe("stellar");
    expect(networkInfo("algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=").chain).toBe("algorand");
    expect(networkInfo("algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k").chain).toBe("algorand");
    expect(networkInfo("xrpl:0").chain).toBe("xrpl");
    expect(networkInfo("cosmos:noble-1").chain).toBe("noble");
    expect(networkInfo("hedera:mainnet").chain).toBe("hedera");
  });
  it("keeps unknown networks verbatim rather than guessing", () => {
    expect(networkInfo("eip155:1187947933")).toEqual({ chain: "eip155:1187947933", isTestnet: false, known: false });
    expect(networkInfo(undefined)).toEqual({ chain: "unknown", isTestnet: false, known: false });
  });
});

describe("priceToUsd", () => {
  it("converts 6-decimal USDC across chains, case-insensitive for EVM", () => {
    expect(priceToUsd("3000", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913")).toBe(0.003);
    expect(priceToUsd("1000000", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")).toBe(1);
    expect(priceToUsd("5000", "0x3600000000000000000000000000000000000000")).toBe(0.005); // arc
    expect(priceToUsd("500", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")).toBe(0.0005);
    expect(priceToUsd("10000", "31566704")).toBe(0.01); // algorand USDC ASA
  });
  it("handles non-6 decimals: BSC 18dp, Stellar 7dp", () => {
    expect(priceToUsd("5000000000000000", "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d")).toBe(0.005);
    expect(priceToUsd("50000", "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75")).toBe(0.005);
  });
  it("returns null for non-USD assets and junk", () => {
    expect(priceToUsd("3000", "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42")).toBeNull(); // EURC
    expect(priceToUsd("3000", "So11111111111111111111111111111111111111112")).toBeNull(); // wSOL
    expect(priceToUsd("not-a-number", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")).toBeNull();
    expect(priceToUsd(undefined, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")).toBeNull();
  });
});

describe("parseAccept", () => {
  it("parses a v2 accept (amount + CAIP-2)", () => {
    expect(
      parseAccept({
        amount: "3000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        network: "eip155:8453",
        payTo: "0x52E29e0d2Aa49bfBfC548C0A9F2196F4aa51f3ea",
        scheme: "exact",
      })
    ).toEqual({
      priceRaw: "3000",
      priceUsd: 0.003,
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      network: "eip155:8453",
      chain: "base",
      isTestnet: false,
      payTo: "0x52E29e0d2Aa49bfBfC548C0A9F2196F4aa51f3ea",
      scheme: "exact",
    });
  });
  it("parses a v1 accept (maxAmountRequired + network name)", () => {
    const p = parseAccept({ maxAmountRequired: "10000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", network: "base", payTo: "0xAb" });
    expect(p.priceUsd).toBe(0.01);
    expect(p.chain).toBe("base");
  });
  it("survives an empty accept", () => {
    const p = parseAccept({});
    expect(p.priceRaw).toBeNull();
    expect(p.priceUsd).toBeNull();
    expect(p.chain).toBe("unknown");
  });
});

const MULTI = {
  x402Version: 2,
  accepts: [
    { amount: "5000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", network: "eip155:8453", payTo: "0x1" },
    { amount: "5000", asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", payTo: "So1" },
    { amount: "5000", asset: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", network: "eip155:137", payTo: "0x1" },
    { amount: "5000", asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", network: "eip155:84532", payTo: "0x1" },
  ],
};

describe("parse402Body", () => {
  it("takes the first accept as primary and a stable hash", () => {
    const r = parse402Body(MULTI)!;
    expect(r.accept.priceUsd).toBe(0.005);
    expect(r.accept.chain).toBe("base");
    expect(r.acceptsHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("lists every mainnet chain the endpoint accepts, deduped, testnets excluded", () => {
    expect(parse402Body(MULTI)!.chains).toEqual(["base", "solana", "polygon"]);
  });
  it("returns null when there is no accepts array", () => {
    expect(parse402Body({ hello: "world" })).toBeNull();
    expect(parse402Body(null)).toBeNull();
  });
});

describe("payment-required header (v2 transport)", () => {
  const b64 = Buffer.from(JSON.stringify(MULTI)).toString("base64");
  it("decodes a base64 header", () => {
    expect(parsePaymentRequiredHeader(b64)?.accept.chain).toBe("base");
  });
  it("accepts a raw-JSON header", () => {
    expect(parsePaymentRequiredHeader(JSON.stringify(MULTI))?.chains).toEqual(["base", "solana", "polygon"]);
  });
  it("returns null for junk", () => {
    expect(parsePaymentRequiredHeader("not base64 or json!!")).toBeNull();
    expect(parsePaymentRequiredHeader(null)).toBeNull();
  });
  it("parse402Response prefers the body, falls back to the header", () => {
    expect(parse402Response(JSON.stringify(MULTI), null)?.chains.length).toBe(3);
    expect(parse402Response("", b64)?.accept.chain).toBe("base");
    expect(parse402Response("<html>pay me</html>", b64)?.accept.chain).toBe("base");
    expect(parse402Response("", null)).toBeNull();
  });
});

describe("canonicalHash", () => {
  it("is independent of key order, sensitive to values", () => {
    const a = canonicalHash([{ b: 1, a: { d: 2, c: 3 } }]);
    const b = canonicalHash([{ a: { c: 3, d: 2 }, b: 1 }]);
    const c = canonicalHash([{ a: { c: 3, d: 99 }, b: 1 }]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("transition (2-probe debounce)", () => {
  // history is most-recent-first, BEFORE the current probe
  it("died: was alive, now two consecutive failures", () => {
    expect(transition([false, true], false)).toBe("died");
  });
  it("no died on first failure", () => {
    expect(transition([true, true], false)).toBeNull();
  });
  it("no died repeat while staying dead", () => {
    expect(transition([false, false], false)).toBeNull();
  });
  it("revived: first success after ≥2 dead probes", () => {
    expect(transition([false, false], true)).toBe("revived");
  });
  it("no revived after a single blip", () => {
    expect(transition([false, true], true)).toBeNull();
  });
  it("steady alive → null", () => {
    expect(transition([true, true], true)).toBeNull();
  });
  it("short history → null", () => {
    expect(transition([], true)).toBeNull();
    expect(transition([false], false)).toBeNull();
  });
});
