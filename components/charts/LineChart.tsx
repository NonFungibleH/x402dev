// Inline SVG line chart, teletext palette. Server-rendered, export-friendly:
// stands alone when copied out of the page.

interface Props {
  values: number[];
  color?: string;
  height?: number;
  yLabel?: string;
  xStart?: string;
  xEnd?: string;
  title: string;
}

export default function LineChart({ values, color = "#FFD400", height = 200, yLabel, xStart, xEnd, title }: Props) {
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
  const fmtTick = (t: number) =>
    Number.isInteger(t) ? String(t) : t >= 100 ? t.toFixed(0) : t >= 1 ? t.toFixed(1) : t.toFixed(4);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={title}
      className="w-full h-auto"
      xmlns="http://www.w3.org/2000/svg"
      style={{ fontFamily: "IBM Plex Mono, monospace" }}
    >
      <title>{title}</title>
      {/* axes: 1px dotted white */}
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#F2F2F2" strokeWidth="1" strokeDasharray="1 3" />
      <line x1={PAD_L} y1={H - PAD_B} x2={W - 8} y2={H - PAD_B} stroke="#F2F2F2" strokeWidth="1" strokeDasharray="1 3" />
      {yTicks.map((t) => (
        <text key={t} x={PAD_L - 6} y={y(t) + 4} fontSize="12" fill="#F2F2F2" textAnchor="end">
          {fmtTick(t)}
        </text>
      ))}
      {xStart && (
        <text x={PAD_L} y={H - 6} fontSize="12" fill="#F2F2F2">{xStart}</text>
      )}
      {xEnd && (
        <text x={W - 8} y={H - 6} fontSize="12" fill="#F2F2F2" textAnchor="end">{xEnd}</text>
      )}
      {yLabel && (
        <text x={PAD_L} y={PAD_T - 2} fontSize="12" fill="#F2F2F2">{yLabel}</text>
      )}
      <path d={path} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}
