const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function ttDate(d: Date): string {
  return `${DAYS[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]}`;
}

export function ttShortDate(isoStr: string): string {
  const d = new Date(isoStr);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]}`;
}

export function ttDateTime(isoStr: string): string {
  const d = new Date(isoStr);
  return `${ttShortDate(isoStr)} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function usd(n: number): string {
  return `$${n.toLocaleString("en-GB")}`;
}

export function usdc(n: number | null): string {
  if (n === null) return "—";
  return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, ".0");
}

export function pct(n: number | null): string {
  if (n === null) return "—";
  const sign = n > 0 ? "▲" : n < 0 ? "▼" : "";
  return `${sign}${Math.abs(n).toFixed(1)}%`;
}

export function lifespanDays(firstSeen: string, end: string | null): number {
  const e = end ? new Date(end).getTime() : Date.now();
  return Math.max(1, Math.round((e - new Date(firstSeen).getTime()) / 86400000));
}
