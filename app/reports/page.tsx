import type { Metadata } from "next";
import Page from "@/components/Page";

export const metadata: Metadata = {
  title: "P300 Reports — x402.dev",
  description: "State of the Agent Economy — report archive.",
};

export default function ReportsPage() {
  return (
    <Page p="P300">
      <h1 className="dh dh-white uppercase pb-4">State of the Agent Economy</h1>
      <div className="longform">
        <p className="uppercase text-tt-white">No data yet — first broadcast pending</p>
        <p className="text-tt-white">
          Reports are generated from recorded probe data over a full observation window. The first
          report publishes once the monitor has at least 14 days of continuous history.
        </p>
      </div>
    </Page>
  );
}
