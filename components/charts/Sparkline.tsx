// Uptime sparkline: 1.5px stroke, green if latest >= series median, red otherwise.

export default function Sparkline({ values, width = 120, height = 24 }: { values: number[]; width?: number; height?: number }) {
  const shown = values.filter((v) => v >= 0);
  if (shown.length < 2) return <span className="text-tt-white">—</span>;
  const sorted = [...shown].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const latest = shown[shown.length - 1];
  const color = latest >= median ? "#2BD94A" : "#FF3B30";
  const min = Math.min(...shown);
  const max = Math.max(...shown);
  const span = max - min || 1;
  const x = (i: number) => (i / (shown.length - 1)) * (width - 2) + 1;
  const y = (v: number) => 2 + (1 - (v - min) / span) * (height - 4);
  const path = shown.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden xmlns="http://www.w3.org/2000/svg">
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}
