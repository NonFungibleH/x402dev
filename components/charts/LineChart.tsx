"use client";

// Inline SVG line chart, teletext palette, with hover crosshair + tooltip.
// Flat and square in both modes; colors flow through the theme tokens.

import { useRef, useState } from "react";

interface Props {
  values: number[];
  labels?: string[];
  unit?: string;
  color?: string;
  height?: number;
  yLabel?: string;
  xStart?: string;
  xEnd?: string;
  title: string;
}

const fmtTick = (t: number) =>
  Number.isInteger(t) ? String(t) : t >= 100 ? t.toFixed(0) : t >= 1 ? t.toFixed(1) : t.toFixed(4);

export default function LineChart({
  values,
  labels,
  unit,
  color = "var(--tt-yellow, #FFD400)",
  height = 200,
  yLabel,
  xStart,
  xEnd,
  title,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const W = 1048;
  const H = height;
  const PAD_L = 64;
  const PAD_B = 24;
  const PAD_T = 12;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const lo = min - span * 0.1;
  const hi = max + span * 0.1;

  const x = (i: number) => PAD_L + (i / (values.length - 1)) * (W - PAD_L - 8);
  const y = (v: number) => PAD_T + (1 - (v - lo) / (hi - lo)) * (H - PAD_T - PAD_B);
  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const allInts = values.every((v) => Number.isInteger(v));
  const mid = allInts ? Math.round((min + max) / 2) : (min + max) / 2;
  const yTicks = [...new Set([min, mid, max])];

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD_L) / (W - PAD_L - 8)) * (values.length - 1));
    setHover(Math.max(0, Math.min(values.length - 1, i)));
  }

  const tip = hover !== null && (() => {
    const vTxt = `${fmtTick(values[hover])}${unit ? ` ${unit}` : ""}`;
    const lTxt = labels?.[hover] ?? "";
    const wTip = Math.max(vTxt.length, lTxt.length) * 7.6 + 20;
    const hTip = lTxt ? 42 : 26;
    const cx = x(hover);
    const cy = y(values[hover]);
    const bx = Math.min(Math.max(cx + 12, PAD_L), W - 8 - wTip);
    const by = Math.max(PAD_T, cy - hTip - 10);
    return { vTxt, lTxt, wTip, hTip, cx, cy, bx, by };
  })();

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={title}
      className="w-full h-auto touch-none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ fontFamily: "IBM Plex Mono, monospace" }}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
    >
      <title>{title}</title>
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="var(--tt-white, #F2F2F2)" strokeWidth="1" strokeDasharray="1 3" />
      <line x1={PAD_L} y1={H - PAD_B} x2={W - 8} y2={H - PAD_B} stroke="var(--tt-white, #F2F2F2)" strokeWidth="1" strokeDasharray="1 3" />
      {yTicks.map((t) => (
        <text key={t} x={PAD_L - 6} y={y(t) + 4} fontSize="12" fill="var(--tt-white, #F2F2F2)" textAnchor="end">
          {fmtTick(t)}
        </text>
      ))}
      {xStart && (
        <text x={PAD_L} y={H - 6} fontSize="12" fill="var(--tt-white, #F2F2F2)">{xStart}</text>
      )}
      {xEnd && (
        <text x={W - 8} y={H - 6} fontSize="12" fill="var(--tt-white, #F2F2F2)" textAnchor="end">{xEnd}</text>
      )}
      {yLabel && (
        <text x={PAD_L} y={PAD_T - 2} fontSize="12" fill="var(--tt-white, #F2F2F2)">{yLabel}</text>
      )}
      <path d={path} fill="none" stroke={color} strokeWidth="2" />
      {tip && (
        <g pointerEvents="none">
          <line x1={tip.cx} y1={PAD_T} x2={tip.cx} y2={H - PAD_B} stroke="var(--tt-white, #F2F2F2)" strokeWidth="1" strokeDasharray="2 3" />
          <rect x={tip.cx - 3.5} y={tip.cy - 3.5} width="7" height="7" fill={color} />
          <rect x={tip.bx} y={tip.by} width={tip.wTip} height={tip.hTip} fill="var(--tt-black, #0A0A0A)" stroke="var(--tt-white, #F2F2F2)" strokeWidth="1" />
          {tip.lTxt && (
            <text x={tip.bx + 10} y={tip.by + 17} fontSize="12" fill="var(--tt-white, #F2F2F2)">{tip.lTxt}</text>
          )}
          <text x={tip.bx + 10} y={tip.by + (tip.lTxt ? 34 : 18)} fontSize="13" fontWeight="600" fill={color}>{tip.vTxt}</text>
        </g>
      )}
    </svg>
  );
}
