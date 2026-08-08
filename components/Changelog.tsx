import Link from "next/link";
import type { EventRow } from "@/lib/fixtures";
import { ttDateTime } from "@/lib/format";

const KIND_LABEL: Record<EventRow["kind"], string> = {
  listed: "LISTED",
  delisted: "DELISTED",
  price_change: "PRICE CHANGE",
  schema_change: "SCHEMA CHANGE",
  died: "DIED",
  revived: "REVIVED",
};

const KIND_CLS: Record<EventRow["kind"], string> = {
  listed: "text-tt-green",
  delisted: "text-tt-white",
  price_change: "text-tt-white",
  schema_change: "text-tt-white",
  died: "text-tt-red",
  revived: "text-tt-green",
};

export default function Changelog({ events, linkRows = true }: { events: EventRow[]; linkRows?: boolean }) {
  return (
    <ul>
      {events.map((e, i) => {
        const body = (
          <span className="flex flex-wrap gap-x-3 items-baseline py-1">
            <span className="text-tt-cyan whitespace-nowrap">{ttDateTime(e.at)}</span>
            <span className={`${KIND_CLS[e.kind]} font-semibold whitespace-nowrap`}>{KIND_LABEL[e.kind]}</span>
            <span className="text-tt-yellow">{e.name}</span>
            {e.detail?.old && (
              <span className="text-tt-white">
                {e.detail.old} → {e.detail.new}
              </span>
            )}
          </span>
        );
        return (
          <li key={i}>
            {linkRows ? (
              <Link href={`/endpoints/${e.slug}`} className="quiet-link block text-inherit hover:!bg-transparent">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}
