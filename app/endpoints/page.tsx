import type { Metadata } from "next";
import Page from "@/components/Page";
import DirectoryTable from "./DirectoryTable";
import { getEndpoints } from "@/lib/data";

export const metadata: Metadata = {
  title: "P200 Endpoints — x402.dev",
  description: "Directory of every tracked x402 endpoint: status, uptime, price and 30-day change.",
};

export default function EndpointsPage() {
  const rows = getEndpoints()
    .filter((e) => e.delistedAt === null)
    .map(({ slug, name, url, status, priceUsdc, priceDelta30d, uptime30d, chain, firstSeen }) => ({
      slug, name, url, status, priceUsdc, priceDelta30d, uptime30d, chain, firstSeen,
    }));

  return (
    <Page p="P200">
      <h1 className="dh dh-white uppercase pb-4">Endpoints</h1>
      <DirectoryTable rows={rows} />
    </Page>
  );
}
