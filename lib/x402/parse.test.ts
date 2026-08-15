import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./normalize";
import {
  canonicalHash,
  networkInfo,
  parseAccept,
  parse402Body,
  priceToUsdc,
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
  it("maps v2 CAIP-2 ids", () => {
    expect(networkInfo("eip155:8453")).toEqual({ chain: "base", isTestnet: false });
    expect(networkInfo("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")).toEqual({ chain: "solana", isTestnet: false });
    expect(networkInfo("eip155:84532")).toEqual({ chain: "base", isTestnet: true });
    expect(networkInfo("eip155:56")).toEqual({ chain: "other", isTestnet: false });
  });
  it("maps v1 names", () => {
    expect(networkInfo("base")).toEqual({ chain: "base", isTestnet: false });
    expect(networkInfo("base-sepolia")).toEqual({ chain: "base", isTestnet: true });
    expect(networkInfo("solana")).toEqual({ chain: "solana", isTestnet: false });
  });
  it("unknown → other", () => {
    expect(networkInfo("algorand:wGHE2Pwd")).toEqual({ chain: "other", isTestnet: false });
    expect(networkInfo(undefined)).toEqual({ chain: "other", isTestnet: false });
  });
});

describe("priceToUsdc", () => {
  const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  it("converts atomic USDC on base (6dp), case-insensitive", () => {
    expect(priceToUsdc("3000", USDC_BASE.toLowerCase())).toBe(0.003);
    expect(priceToUsdc("1000000", USDC_BASE)).toBe(1);
  });
  it("converts USDC on solana", () => {
    expect(priceToUsdc("500", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")).toBe(0.0005);
  });
  it("returns null for unknown assets and junk", () => {
    expect(priceToUsdc("3000", "0xdeadbeef00000000000000000000000000000000")).toBeNull();
    expect(priceToUsdc("not-a-number", USDC_BASE)).toBeNull();
    expect(priceToUsdc(undefined, USDC_BASE)).toBeNull();
  });
});

describe("parseAccept", () => {
  it("parses a real v2 accept (amount + CAIP-2)", () => {
    const a = {
      amount: "3000",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      network: "eip155:8453",
      payTo: "0x52E29e0d2Aa49bfBfC548C0A9F2196F4aa51f3ea",
      scheme: "exact",
      maxTimeoutSeconds: 3600,
    };
    expect(parseAccept(a)).toEqual({
      priceRaw: "3000",
      priceUsdc: 0.003,
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      network: "eip155:8453",
      chain: "base",
      isTestnet: false,
      payTo: "0x52E29e0d2Aa49bfBfC548C0A9F2196F4aa51f3ea",
      scheme: "exact",
    });
  });
  it("parses a v1 accept (maxAmountRequired + network name)", () => {
    const a = {
      maxAmountRequired: "10000",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      network: "base",
      payTo: "0xAb",
      scheme: "exact",
    };
    const parsed = parseAccept(a);
    expect(parsed.priceRaw).toBe("10000");
    expect(parsed.priceUsdc).toBe(0.01);
    expect(parsed.chain).toBe("base");
  });
  it("survives an empty accept", () => {
    const parsed = parseAccept({});
    expect(parsed.priceRaw).toBeNull();
    expect(parsed.priceUsdc).toBeNull();
    expect(parsed.chain).toBe("other");
  });
});

describe("parse402Body", () => {
  it("extracts first accept and a stable hash", () => {
    const body = {
      x402Version: 1,
      accepts: [{ maxAmountRequired: "5000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", network: "base", payTo: "0x1" }],
    };
    const r = parse402Body(body);
    expect(r).not.toBeNull();
    expect(r!.accept.priceUsdc).toBe(0.005);
    expect(r!.acceptsHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("returns null when there is no accepts array", () => {
    expect(parse402Body({ hello: "world" })).toBeNull();
    expect(parse402Body(null)).toBeNull();
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
