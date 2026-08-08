import type { Status } from "@/lib/fixtures";

const MAP: Record<Status, { glyph: string; label: string; cls: string }> = {
  alive: { glyph: "■", label: "ALIVE", cls: "text-tt-green" },
  dead: { glyph: "■", label: "DEAD", cls: "text-tt-red" },
  no402: { glyph: "■", label: "NO-402", cls: "text-tt-yellow" },
  delisted: { glyph: "†", label: "DELISTED", cls: "text-tt-white" },
};

export default function StatusGlyph({ status }: { status: Status }) {
  const m = MAP[status];
  return (
    <span className={`${m.cls} font-semibold whitespace-nowrap`}>
      {m.glyph} {m.label}
    </span>
  );
}
