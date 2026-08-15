"use client";

// Teletext mosaic block chart: one column per sample, quantized to 1/3-cell
// sixel resolution, drawn with cell backgrounds on the character grid.
// Hover paints the column white and echoes the value in the info row.

import { useState } from "react";

interface Props {
  values: number[];
  labels?: string[];
  unit?: string;
  rows?: number;
  cyan?: boolean;
  title: string;
  xStart?: string;
  xEnd?: string;
}

const fmt = (t: number) =>
  Number.isInteger(t) ? String(t) : t >= 100 ? t.toFixed(0) : t >= 1 ? t.toFixed(1) : t.toFixed(4);

export default function MosaicChart({ values, labels, unit, rows = 6, cyan, title, xStart, xEnd }: Props) {
  const [hov, setHov] = useState<number | null>(null);

  // cap at 36 columns to stay inside the 40-column frame
  let vals = values;
  let labs = labels;
  if (values.length > 36) {
    const stride = values.length / 36;
    vals = Array.from({ length: 36 }, (_, i) => values[Math.floor(i * stride)]);
    labs = labels && Array.from({ length: 36 }, (_, i) => labels[Math.floor(i * stride)]);
  }

  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const span = max - min || 1;
  const steps = rows * 3;
  const subs = vals.map((v) => Math.max(1, Math.round(((v - min) / span) * (steps - 1)) + 1));

  return (
    <div className={`cf-chart${cyan ? " cyan" : ""}`} role="img" aria-label={title}>
      <div className="cf-chart-info">
        <span>{fmt(max)}</span>
        <span aria-live="polite">
          {hov !== null ? `${labs?.[hov] ?? ""} ${fmt(vals[hov])}${unit ? " " + unit : ""}` : ""}
        </span>
      </div>
      <div
        className="cf-chart-grid"
        style={{ gridTemplateColumns: `repeat(${vals.length}, 1fr)` }}
        onPointerLeave={() => setHov(null)}
      >
        {subs.map((s, i) => {
          const full = Math.floor(s / 3);
          const rem = s % 3;
          return (
            <div key={i} className={`cf-col${hov === i ? " hov" : ""}`} onPointerEnter={() => setHov(i)}>
              {Array.from({ length: rows }, (_, r) => {
                const fromBottom = rows - 1 - r;
                const cls = fromBottom < full ? "f3" : fromBottom === full && rem > 0 ? (rem === 2 ? "f2" : "f1") : "";
                return <i key={r} className={cls} />;
              })}
            </div>
          );
        })}
      </div>
      <div className="cf-chart-base" />
      <div className="cf-chart-info">
        <span>{fmt(min)}</span>
        <span>{xStart && xEnd ? `${xStart}–${xEnd}` : ""}</span>
      </div>
    </div>
  );
}
