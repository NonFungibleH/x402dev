import type { Metadata } from "next";
import { IBM_Plex_Mono, VT323 } from "next/font/google";
import "./globals.css";

const plex = IBM_Plex_Mono({
  weight: ["400", "600"],
  subsets: ["latin"],
  variable: "--font-plex",
  display: "swap",
});

const vt323 = VT323({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-vt323",
  display: "swap",
});

export const metadata: Metadata = {
  title: "x402.dev — The Agent Economy",
  description:
    "Independent numbers on the x402 agent-payments ecosystem. Uptime, price history and changes for every paid endpoint — updated every 6 hours.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plex.variable} ${vt323.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{if(localStorage.getItem('x402-theme')==='std'){document.documentElement.dataset.theme='std'}}catch(e){}})()",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
