import type { Metadata } from "next";
import Page from "@/components/Page";

export const metadata: Metadata = {
  title: "P310 Methodology — x402.dev",
  description: "What we probe, how often, what alive/dead/amber mean, and what we deliberately do not do.",
};

export default function MethodologyPage() {
  return (
    <Page p="P310">
      <h1 className="dh dh-white uppercase pb-4">Methodology</h1>
      <div className="longform">
        <h2>What we do</h2>
        <p>
          x402.dev sends a plain, unauthenticated HTTP request to every known x402 endpoint every
          6 hours and records what comes back: the status code, the response time, and — when the
          endpoint answers with HTTP 402 as the protocol intends — the advertised price, asset,
          network and pay-to address from the payment-required payload. Listings are re-crawled on
          the same schedule, so new endpoints appear within hours and vanished ones are noticed.
        </p>

        <h2>What the statuses mean</h2>
        <p>
          <span className="text-tt-green font-semibold">■ ALIVE</span> — the endpoint responded
          with HTTP 402 and a parseable payment-required payload. That is the protocol working.
        </p>
        <p>
          <span className="text-tt-yellow font-semibold">■ NO-402</span> — the endpoint responded
          (2xx, 3xx, or an auth error such as 401/403/429), but not with a 402. The server is up;
          it is not payment-gated at the probed URL.
        </p>
        <p>
          <span className="text-tt-red font-semibold">■ DEAD</span> — timeouts, DNS failures, 404s
          or 5xx errors. To avoid flapping noise, an endpoint is only marked dead after two
          consecutive failed probes, and only marked revived after two consecutive successes. A
          real death therefore surfaces up to 12 hours after it happens.
        </p>
        <p>
          <span className="text-tt-white font-semibold">† DELISTED</span> — the endpoint has been
          absent from its discovery listing for three consecutive crawls. Delisted endpoints are
          still probed once daily to catch zombie servers.
        </p>

        <h2>What we deliberately do not do</h2>
        <p>
          We never pay endpoints. Probes are free requests only, so we verify that an endpoint asks
          for payment correctly — not that it delivers after being paid. We never rank by opinion:
          every number on this site is an observation, and the language stays that way. An endpoint
          that &ldquo;did not respond to probes&rdquo; is exactly that; we do not speculate about why.
        </p>
        <p>
          We are polite. Probes run at most once per endpoint per 6 hours (hard-capped in code at
          once per 15 minutes under any configuration), identify themselves with the user agent
          x402dev-monitor/1.0, and never retry aggressively.
        </p>

        <h2>Data sources</h2>
        <p>
          Endpoint listings come from public discovery layers for the x402 ecosystem. Each
          endpoint&rsquo;s record notes which source it came from, and the exact sources and response
          shapes in use are documented in the repository so the record is auditable.
        </p>

        <h2>The record</h2>
        <p>
          Probes are stored raw and forever. Daily rollups are computed from the raw record and
          can be recomputed at any time. History cannot be backfilled — a day not recorded is
          lost — which is why the recorder shipped before this website did.
        </p>
      </div>
    </Page>
  );
}
