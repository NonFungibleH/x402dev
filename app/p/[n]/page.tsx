import { notFound, permanentRedirect } from "next/navigation";
import { bySlugOrPNumber } from "@/lib/data";

const STATIC: Record<number, string> = {
  100: "/",
  200: "/endpoints",
  300: "/reports",
  310: "/methodology",
  404: "/graveyard",
};

export default async function PNumberPage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const num = parseInt(n, 10);
  if (!Number.isFinite(num)) notFound();
  if (STATIC[num]) permanentRedirect(STATIC[num]);
  const e = bySlugOrPNumber(num);
  if (e) permanentRedirect(`/endpoints/${e.slug}`);
  notFound();
}
