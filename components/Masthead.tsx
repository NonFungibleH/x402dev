"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ttDate } from "@/lib/format";

function clockParts(d: Date) {
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  const caps = ttDate(d); // "SAT 15 AUG"
  const mixed = caps
    .split(" ")
    .map((w) => (/^\d/.test(w) ? w : w[0] + w.slice(1).toLowerCase()))
    .join(" ");
  return { date: caps, dateMixed: mixed, time: `${hh}:${mm}/${ss}` };
}

export default function Masthead({ p, demo }: { p: string; demo?: boolean }) {
  const router = useRouter();
  const [now, setNow] = useState<ReturnType<typeof clockParts> | null>(null);
  const [mode, setMode] = useState<"ceefax" | "std" | null>(null);
  const [buf, setBuf] = useState("");
  const bufTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = () => setNow(clockParts(new Date()));
    tick();
    setMode(document.documentElement.dataset.theme === "std" ? "std" : "ceefax");
    const id = setInterval(tick, reduced ? 60000 : 1000);
    return () => clearInterval(id);
  }, []);

  // type-a-page-number navigation (ceefax behaviour, works in both modes)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (!/^[0-9]$/.test(e.key)) return;
      setBuf((b) => {
        const next = (b + e.key).slice(0, 3);
        if (bufTimer.current) clearTimeout(bufTimer.current);
        if (next.length === 3) {
          router.push(`/p/${next}`);
          return "";
        }
        bufTimer.current = setTimeout(() => setBuf(""), 1500);
        return next;
      });
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  function toggleMode() {
    const next = mode === "std" ? "ceefax" : "std";
    setMode(next);
    if (next === "std") document.documentElement.dataset.theme = "std";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("x402-theme", next);
    } catch {}
  }

  const echo = buf ? `P${buf}${"_".repeat(3 - buf.length)}` : null;

  return (
    <header>
      {/* ceefax: canonical header row + status row */}
      <div className="container-tt cf-only">
        <div className="flex justify-between whitespace-nowrap overflow-hidden">
          <span className="text-tt-white">
            {p} X402.DEV {p.replace(/\D/g, "") || "???"}
          </span>
          <span className="text-tt-white">{now?.dateMixed ?? ""}</span>
          {echo ? (
            <span className="text-tt-green">{echo}</span>
          ) : (
            <span className="text-tt-yellow" suppressHydrationWarning>
              {now?.time ?? "--:--/--"}
            </span>
          )}
        </div>
        <div className="flex justify-between whitespace-nowrap overflow-hidden">
          {demo ? <span className="text-tt-magenta">TEST TRANSMISSION</span> : <span />}
          <button onClick={toggleMode} className="text-tt-cyan cursor-pointer" aria-label="Switch display mode">
            MODE:CEEFAX
          </button>
        </div>
      </div>

      {/* std: modern product nav */}
      <div className="container-tt std-only">
        <div className="flex items-baseline gap-6 py-2 font-semibold uppercase whitespace-nowrap overflow-hidden">
          <span className="brand text-tt-white">X402.DEV</span>
          <span className="text-tt-cyan">{p}</span>
          <span className="masthead-date text-tt-white">{now?.date ?? " "}</span>
          <span className="clock text-tt-yellow" suppressHydrationWarning>
            {now?.time ?? "--:--/--"} <span className="text-[0.8em]">UTC</span>
          </span>
          <span className="ml-auto flex items-baseline gap-6">
            {demo && <span className="text-tt-magenta hidden sm:inline">TEST TRANSMISSION</span>}
            <button
              onClick={toggleMode}
              className="text-tt-cyan cursor-pointer uppercase font-semibold"
              aria-label="Switch display mode"
            >
              MODE: STD
            </button>
          </span>
        </div>
      </div>
      <div className="masthead-bar" />
    </header>
  );
}
