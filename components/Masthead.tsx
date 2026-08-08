"use client";

import { useEffect, useState } from "react";
import { ttDate } from "@/lib/format";

function clockParts(d: Date) {
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return { date: ttDate(d), time: `${hh}:${mm}/${ss}` };
}

export default function Masthead({ p, demo }: { p: string; demo?: boolean }) {
  const [now, setNow] = useState<{ date: string; time: string } | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = () => setNow(clockParts(new Date()));
    tick();
    const id = setInterval(tick, reduced ? 60000 : 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header>
      <div className="container-tt">
        <div className="flex items-baseline gap-6 py-2 font-semibold uppercase whitespace-nowrap overflow-hidden">
          <span className="text-tt-white">X402.DEV</span>
          <span className="text-tt-cyan">{p}</span>
          <span className="masthead-date text-tt-white">{now?.date ?? " "}</span>
          <span className="text-tt-yellow" suppressHydrationWarning>
            {now?.time ?? "--:--/--"} <span className="text-[0.8em]">UTC</span>
          </span>
          {demo && <span className="text-tt-magenta ml-auto hidden sm:inline">TEST TRANSMISSION</span>}
        </div>
      </div>
      <div className="masthead-bar" />
    </header>
  );
}
