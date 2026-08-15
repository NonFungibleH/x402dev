"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import StatusGlyph from "@/components/StatusGlyph";
import { ttShortDate, pct, usdc } from "@/lib/format";
import type { EndpointRow } from "@/lib/fixtures";

type Row = Pick<
  EndpointRow,
  "slug" | "name" | "url" | "status" | "priceUsdc" | "priceDelta30d" | "uptime30d" | "chain" | "firstSeen"
>;

type SortKey = "status" | "name" | "priceUsdc" | "priceDelta30d" | "uptime30d" | "chain" | "firstSeen";

const COLS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: "status", label: "Status" },
  { key: "name", label: "Name" },
  { key: "priceUsdc", label: "Price", num: true },
  { key: "priceDelta30d", label: "Δ30D", num: true },
  { key: "uptime30d", label: "Uptime", num: true },
  { key: "chain", label: "Net" },
  { key: "firstSeen", label: "First seen" },
];

const PER_SUBPAGE = 14;

export default function DirectoryTable({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("uptime30d");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [sub, setSub] = useState(0);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? rows.filter((r) => r.name.toLowerCase().includes(needle) || r.url.toLowerCase().includes(needle))
      : rows;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return cmp * dir;
    });
  }, [rows, q, sortKey, dir]);

  const subpages = Math.max(1, Math.ceil(shown.length / PER_SUBPAGE));
  const subClamped = Math.min(sub, subpages - 1);
  const subRows = shown.slice(subClamped * PER_SUBPAGE, (subClamped + 1) * PER_SUBPAGE);

  // ceefax subpage carousel: auto-advance every 15s (frozen for reduced motion / while filtering)
  useEffect(() => {
    if (q) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (document.documentElement.dataset.theme === "std") return;
    const id = setInterval(() => setSub((s) => (s + 1) % subpages), 15000);
    return () => clearInterval(id);
  }, [subpages, q]);

  function sortBy(k: SortKey) {
    if (k === sortKey) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setDir(k === "name" || k === "status" || k === "chain" ? 1 : -1);
    }
    setSub(0);
  }

  const rowEls = (list: Row[]) =>
    list.map((r) => (
      <tr key={r.slug}>
        <td><StatusGlyph status={r.status} /></td>
        <td>
          <Link href={`/endpoints/${r.slug}`}>{r.name}</Link>
        </td>
        <td className="num">{usdc(r.priceUsdc)}</td>
        <td className={`num ${r.priceDelta30d && r.priceDelta30d > 0 ? "text-tt-green" : r.priceDelta30d && r.priceDelta30d < 0 ? "text-tt-red" : ""}`}>
          {pct(r.priceDelta30d)}
        </td>
        <td className="num">{r.uptime30d.toFixed(1)}%</td>
        <td className="uppercase">{r.chain}</td>
        <td>{ttShortDate(r.firstSeen)}</td>
      </tr>
    ));

  const empty = (
    <tr>
      <td colSpan={7} className="text-tt-white uppercase">
        No endpoints match — clear filter
      </td>
    </tr>
  );

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="find-line pb-4">
          <label htmlFor="find" className="uppercase">Find:</label>
          <input
            id="find"
            value={q}
            onChange={(e) => { setQ(e.target.value); setSub(0); }}
            spellCheck={false}
            autoComplete="off"
          />
          <span aria-hidden className="find-cursor text-tt-cyan">▊</span>
        </div>
        <button
          className="cf-only text-tt-cyan cursor-pointer"
          onClick={() => setSub((s) => (s + 1) % subpages)}
          aria-label="Next subpage"
        >
          {subClamped + 1}/{subpages}
        </button>
      </div>
      <div className="table-scroll">
        <table className="tt">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className={`${c.num ? "num " : ""}${sortKey === c.key ? "sorted" : ""}`}>
                  <button onClick={() => sortBy(c.key)}>
                    {c.label}
                    {sortKey === c.key ? (dir === -1 ? " ▼" : " ▲") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="std-only">{shown.length ? rowEls(shown) : empty}</tbody>
          <tbody className="cf-only">{subRows.length ? rowEls(subRows) : empty}</tbody>
        </table>
      </div>
      <p className="std-only sm:hidden text-tt-cyan uppercase pt-2 text-[12px]">→ More: scroll table sideways</p>
    </>
  );
}
