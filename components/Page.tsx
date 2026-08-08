import Link from "next/link";
import Masthead from "./Masthead";
import { IS_DEMO } from "@/lib/data";

const NAV = [
  { p: "P100", label: "INDEX", href: "/" },
  { p: "P200", label: "ENDPOINTS", href: "/endpoints" },
  { p: "P300", label: "REPORTS", href: "/reports" },
  { p: "P310", label: "METHOD", href: "/methodology" },
  { p: "P404", label: "GRAVEYARD", href: "/graveyard" },
];

export default function Page({ p, children }: { p: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Masthead p={p} demo={IS_DEMO} />
      <nav className="container-tt w-full py-2 uppercase font-semibold">
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {NAV.map((n, i) => (
            <li key={n.p} className="whitespace-nowrap">
              {i > 0 && <span aria-hidden className="text-tt-white pr-3">·</span>}
              <Link href={n.href}>
                {n.p} {n.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main className="container-tt w-full flex-1 pb-10 pt-3">{children}</main>
      <footer className="container-tt w-full pb-8 text-[12px] leading-relaxed">
        <nav aria-label="Fastext" className="fastext text-[14px]">
          <Link href="/" className="ft-red">Index</Link>
          <Link href="/endpoints" className="ft-green">Endpoints</Link>
          <Link href="/reports" className="ft-yellow">Reports</Link>
          <Link href="/graveyard" className="ft-cyan">Graveyard</Link>
        </nav>
        <hr className="rule !mt-1" />
        {IS_DEMO && (
          <p className="text-tt-magenta uppercase font-semibold pb-2">
            Test transmission — all figures are simulated demonstration data. First live broadcast pending.
          </p>
        )}
        <p className="text-tt-white">
          x402 is an open standard stewarded by the x402 Foundation. x402.dev is an independent
          community project and is not affiliated with or endorsed by the x402 Foundation or Coinbase.
        </p>
        <p className="text-tt-white uppercase pt-2">An autonomous broadcast by 3UILD</p>
      </footer>
    </div>
  );
}
