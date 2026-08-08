import type { Metadata } from "next";
import Link from "next/link";
import Page from "@/components/Page";
import { getGraveyard } from "@/lib/data";
import { lifespanDays, ttShortDate, usdc } from "@/lib/format";

export const metadata: Metadata = {
  title: "P404 Graveyard — x402.dev",
  description: "Dead and delisted x402 endpoints, sorted by date of death.",
};

export default function GraveyardPage() {
  const rows = getGraveyard();
  return (
    <Page p="P404">
      <h1 className="dh dh-white uppercase pb-1">Graveyard</h1>
      <p className="text-tt-cyan uppercase font-semibold pb-4">
        Dead & delisted endpoints · In order of departure
      </p>
      <div className="table-scroll">
        <table className="tt">
          <thead>
            <tr>
              <th>Name</th>
              <th>Died</th>
              <th className="num">Lifespan</th>
              <th className="num">Last price</th>
              <th>Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const end = r.diedAt ?? r.delistedAt;
              return (
                <tr key={r.slug}>
                  <td>
                    <span className="text-tt-white pr-2">†</span>
                    <Link href={`/endpoints/${r.slug}`}>{r.name}</Link>
                  </td>
                  <td>{end ? ttShortDate(end) : "—"}</td>
                  <td className="num">{lifespanDays(r.firstSeen, end)} days</td>
                  <td className="num">{usdc(r.priceUsdc)}</td>
                  <td className="uppercase">{r.chain}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="uppercase">No deaths recorded — first broadcast pending</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
