import Link from "next/link";
import Page from "@/components/Page";
import Changelog from "@/components/Changelog";
import LineChart from "@/components/charts/LineChart";
import { getEvents, getStats } from "@/lib/data";
import { ttShortDate, usd, usdc } from "@/lib/format";

export default function Home() {
  const stats = getStats();
  const events = getEvents(20);
  const thirtyAgo = new Date(Date.now() - 29 * 86400000).toISOString();
  const today = new Date().toISOString();
  const labels30 = Array.from({ length: 30 }, (_, i) =>
    ttShortDate(new Date(Date.now() - (29 - i) * 86400000).toISOString())
  );

  return (
    <Page p="P100">
      <div className="flex items-center gap-4 pt-1 pb-2">
        <span className="mosaic" aria-hidden>
          <i style={{ background: "var(--tt-red)" }} />
          <i style={{ background: "var(--tt-green)" }} />
          <i style={{ background: "var(--tt-yellow)" }} />
          <i style={{ background: "var(--tt-cyan)" }} />
          <i style={{ background: "var(--tt-magenta)" }} />
          <i style={{ background: "var(--tt-blue)" }} />
        </span>
        <span className="dh text-[3em] leading-none" aria-hidden>
          X402.DEV
        </span>
      </div>
      <h1 className="dh headline-bar uppercase mb-1">The Agent Economy</h1>
      <p className="text-tt-cyan uppercase font-semibold pb-3">
        Independent numbers · Updated every 6 hours
      </p>

      {/* headline number block */}
      <div className="pb-2">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span className="uppercase text-tt-cyan font-semibold w-64">Real agent volume</span>
          <span className="dh">$—.—</span>
          <span className="text-tt-magenta uppercase font-semibold">Coming soon</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 pt-1">
          <span className="uppercase text-tt-cyan font-semibold w-64">Raw reported volume</span>
          <span className="strike-red text-tt-white text-[1.4em]">{usd(stats.rawReportedVolume)}</span>
          <span className="text-tt-white text-[12px] uppercase">Source: reported listings, unverified</span>
        </div>
      </div>

      <hr className="rule" />

      {/* stat block */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-3 pb-1">
        <div>
          <div className="uppercase text-tt-cyan font-semibold">Live endpoints</div>
          <div className="dh">
            {stats.liveCount} / {stats.totalListed}
          </div>
        </div>
        <div>
          <div className="uppercase text-tt-cyan font-semibold">Median price / call</div>
          <div className="dh">{usdc(stats.medianPriceUsdc)} <span className="text-[0.5em]">USDC</span></div>
        </div>
        <div>
          <div className="uppercase text-tt-cyan font-semibold">New / delisted 7d</div>
          <div className="dh">
            <span className="text-tt-green">+{stats.newThisWeek}</span>{" "}
            <span className="text-tt-red">−{stats.delistedThisWeek}</span>
          </div>
        </div>
      </div>

      <h2 className="bar-h mb-2 mt-4">Live endpoints — 30 days</h2>
      <LineChart
        values={stats.liveSeries30d}
        labels={labels30}
        unit="LIVE"
        title="Live x402 endpoints over the last 30 days"
        xStart={ttShortDate(thirtyAgo)}
        xEnd={ttShortDate(today)}
      />

      <h2 className="bar-h mb-2 mt-4">Latest</h2>
      <Changelog events={events} />

      <h2 className="bar-h mb-2 mt-4">Index</h2>
      <ul className="max-w-[560px]">
        {[
          { label: "Endpoint directory", n: "200", href: "/endpoints" },
          { label: "State of the agent economy", n: "300", href: "/reports" },
          { label: "Methodology", n: "310", href: "/methodology" },
          { label: "Graveyard", n: "404", href: "/graveyard" },
        ].map((r) => (
          <li key={r.n}>
            <Link href={r.href} className="leader-row quiet-link uppercase font-semibold">
              <span className="text-tt-white">{r.label}</span>
              <span className="dots" aria-hidden />
              <span className="text-tt-cyan">{r.n}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
