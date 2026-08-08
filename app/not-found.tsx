import Link from "next/link";
import Page from "@/components/Page";

export default function NotFound() {
  return (
    <Page p="P???">
      <h1 className="dh dh-white uppercase pb-2">Page not found</h1>
      <p className="uppercase text-tt-white pb-6">Check page number</p>
      <p>
        <Link href="/">P100 INDEX</Link>
      </p>
    </Page>
  );
}
