import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Page from "@/components/Page";
import Changelog from "@/components/Changelog";
import StatusGlyph from "@/components/StatusGlyph";
import LineChart from "@/components/charts/LineChart";
import Sparkline from "@/components/charts/Sparkline";
import { getEndpoint, getEndpoints, getEventsFor, pNumber } from "@/lib/data";
import { ttShortDate, usdc } from "@/lib/format";

export function generateStaticParams() {
  return getEndpoints().map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const e = getEndpoint(slug);
  if (!e) return {};
  return {
    title: `Is ${e.name} up? — x402.dev`,
    description: `${e.name}: uptime, price history and changes. ${e.uptime30d.toFixed(1)}% uptime over 30 days.`,
  };
}

export default async function EndpointPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = getEndpoint(slug);
  if (!e) notFound();
  const events = getEventsFor(slug);
  const explorer = e.chain === "solana" ? `https://solscan.io/account/${e.payTo}` : `https://basescan.org/address/${e.payTo}`;
  const thirtyAgo = new Date(Date.now() - 29 * 86400000).toISOString();
  const today = new Date().toISOString();

  return (
    <Page p={pNumber(slug)}>
      {/* identity block */}
      <h1 className="dh dh-white">{e.name}</h1>
      <p className="pb-1">
        <a href={e.url} rel="noopener noreferrer">{e.url}</a>
      </p>
      <p className="flex flex-wrap gap-x-6 gap-y-1 items-baseline pb-1">
        <StatusGlyph status={e.status} />
        <span className="uppercase text-tt-white">Net: {e.chain}</span>
        <span className="text-tt-white">First seen {ttShortDate(e.firstSeen)}</span>
        <span className="text-tt-white">Uptime 30d {e.uptime30d.toFixed(1)}%</span>
        <Sparkline values={e.uptimeSeries} />
      </p>
      <p className="text-tt-white pb-1">{e.description}</p>
      <p className="pb-2">
        <span className="uppercase text-tt-cyan font-semibold pr-3">Pay to</span>
        <a href={explorer} rel="noopener noreferrer" className="break-all">{e.payTo}</a>
      </p>

      <h2 className="bar-h mb-2 mt-4">Latency — 30 days (median ms)</h2>
      <LineChart
        values={e.latencySeries}
        color="#00E5E5"
        height={160}
        title={`${e.name} median latency, last 30 days`}
        xStart={ttShortDate(thirtyAgo)}
        xEnd={ttShortDate(today)}
      />

      {e.priceSeries.length > 1 && (
        <>
          <h2 className="bar-h mt-6 mb-2">
            Price history (USDC, currently {usdc(e.priceUsdc)})
          </h2>
          <LineChart
            values={e.priceSeries.map((p) => p.price)}
            height={160}
            title={`${e.name} price history in USDC`}
            xStart={ttShortDate(e.priceSeries[0].day)}
            xEnd={ttShortDate(e.priceSeries[e.priceSeries.length - 1].day)}
          />
        </>
      )}

      <h2 className="bar-h mb-2 mt-6">Changelog</h2>
      {events.length ? <Changelog events={events} linkRows={false} /> : (
        <p className="uppercase text-tt-white">No events recorded</p>
      )}

      {e.acceptsJson && (
        <>
          <hr className="rule" />
          <details className="payload-toggle">
            <summary className="uppercase font-semibold">Show payload</summary>
            <pre className="payload">{JSON.stringify(e.acceptsJson, null, 2)}</pre>
          </details>
        </>
      )}
    </Page>
  );
}
