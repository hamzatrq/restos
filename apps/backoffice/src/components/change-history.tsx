"use client";

/**
 * **B-7 — `14-F3`: "The change history of any entity is browsable IN PLACE … the audit trail is a
 * first-class UI element, not a hidden log."**
 *
 * In place means filtered to the entity the owner has open, which is why this takes `entity` and
 * `entity_id` and does the narrowing here: `catalog.history` is org-scoped and a screen that
 * listed every change in the org would be the hidden log this FR exists to replace.
 *
 * It reads the LEDGER (`catalog.changed`), not the catalog. `14-F6` and `01-F52` are held together
 * rather than in tension — the artifact is reference data, the audit record is an event — and the
 * whole reason to render from the second is that the first cannot say who or when.
 *
 * **`14-F3` NOW RENDERS ITS OWN EXAMPLE — *"price changed by Ali, 2 Jul, 450 → 480"*.** This header
 * used to carry a standing apology in its place: when B-7 was built, `LedgerRecord` carried the
 * actor and two content hashes and nothing else, so the screen could say *who* and had to state
 * outright that the date and the two numbers were absent. **That claim is retired (August 2026),
 * because it is now false**: `01-F62` made `catalog.changed` org-scoped and gave it
 * `server_received_at`, and `services/api`'s publish path computes `payload.price_changes` — the
 * cells that actually moved — where both sides of the edit are in hand. A screen that goes on
 * claiming a gap it no longer has misleads the next reader exactly as badly as one that hides a
 * gap it does have.
 *
 * **THE DATE IS THE SERVER INSTANT IN Asia/Karachi, NOT THE `01-F46` BUSINESS DAY, and that is a
 * decision rather than an oversight.** `01-F46`'s 05:00 cutover exists so that a sale rung at 01:30
 * counts against the night it was served — it is a rule about which trading day an *operational*
 * figure belongs to, and every daily total, shift report and cash reconciliation inherits it. An
 * audit line is none of those. It answers "when did Ali change this", and bucketing a 02:00 edit
 * into the previous calendar date would answer a question nobody asked with a date the record does
 * not contain — restating a recorded instant, which is what commandment 1 forbids of a history.
 * `domain`'s `businessDate()` is right there and is deliberately *not* called. The zone still
 * comes from `01-F46` (`BUSINESS_TIMEZONE`, not configurable), so "2 Jul" does not depend on which
 * timezone the owner's laptop happens to be in.
 *
 * `server_received_at` is server time and that is legitimate here, not a law-2 exception: `01-F62`
 * says an org-scoped event has neither a branch nor a hub to ask, and makes `server_received_at`
 * its ordering authority under `01-F18`. The instant rendered is therefore the same instant the
 * record is ordered by — and it is a stored fact, never a rendering-time `Date.now()`, which would
 * print today beside a change made in July and be right only on the day it was written.
 *
 * **Still not renderable, and named rather than hidden:** a change to any field that is *not* a
 * price. `price_changes` is a price delta by construction, and the before/after refs are one-way
 * `payloadHash` digests indexed by nothing, so a rename or a `03-F50` station move shows as
 * "changed" at a catalog version with no before/after values. The footnote says so.
 */

import { BUSINESS_TIMEZONE, type CatalogPriceChangeT } from "@restos/domain";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { formatPaisa } from "../lib/money";
import { strings } from "../lib/strings";
import { useTRPC } from "../lib/trpc";
import { Note } from "./ui/surface";

/**
 * `14-F3`'s *"2 Jul"*.
 *
 * `en-GB` for the day-before-month order the FR's own example is written in and that this market
 * reads; `27-F22` is satisfied either way, since every `en-*` locale is CLDR `latn` and no Eastern
 * digit can reach the string. The zone is pinned so the rendered date is a property of the record
 * rather than of the reader's machine. The clock is `h23`, stated rather than left to `hour12`,
 * whose h23/h24 mapping has historically differed between engines and would render midnight as
 * "24:05".
 */
const changedAtText = (server_received_at: number): string =>
  new Date(server_received_at).toLocaleString("en-GB", {
    timeZone: BUSINESS_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

/**
 * One side of `14-F3`'s *"450 → 480"*.
 *
 * `null` is a real state on either side (`CatalogPriceChange`): a cell that did not exist before
 * this edit, or one the edit dropped. It renders as the absence it is — collapsing it to `0` would
 * print "free" where the truth is "absent", which is the exact confusion `01-F60`'s explicit-zero
 * rule exists to prevent.
 *
 * The rupee conversion is `lib/money.ts`'s and only ever that: this file does no arithmetic on a
 * money value (`DEC-MONEY-005`), and a second converter here is how a display drifts a factor of
 * 100 from the one the editor writes through.
 */
const priceText = (paisa_value: number | null): string =>
  paisa_value === null ? strings.history.absent : formatPaisa(paisa_value);

const changeText = (change: CatalogPriceChangeT): string =>
  `${priceText(change.before_paisa)} → ${priceText(change.after_paisa)}`;

export const ChangeHistory = ({
  entity,
  entity_id,
}: {
  entity: string;
  entity_id: string;
}): ReactNode => {
  const trpc = useTRPC();
  const history = useQuery(trpc.catalog.history.queryOptions());

  if (history.isPending) {
    return <p className="text-sm text-muted-foreground">{strings.errors.loading}</p>;
  }
  if (history.error !== null) return <Note tone="fault">{history.error.message}</Note>;

  // IN PLACE — this entity's records, newest first. The append order is the ledger's; reversing it
  // is a display choice and touches no projected value (`01-F34`).
  const mine = history.data
    .filter((record) => record.payload.entity === entity && record.payload.entity_id === entity_id)
    .slice()
    .reverse();

  if (mine.length === 0) {
    return <p className="text-sm text-muted-foreground">{strings.history.empty}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-1.5">
        {mine.map((record) => (
          <li
            key={`${record.payload.version}-${record.payload.after_ref ?? ""}`}
            className="flex flex-col gap-1 rounded-md border border-border px-3 py-2 text-sm"
          >
            <span>
              <span className="font-medium">
                {/* `before_ref === null` means the entry is NEW — there was nothing to change from. */}
                {record.payload.before_ref === null
                  ? strings.history.created
                  : strings.history.changed}
              </span>
              {/* `14-F3`'s "by Ali, 2 Jul". `actor_user_id` is `null`-able in `LedgerRecord` because
                  "appended with no actor" has to be a constructible mistake or no test can prove it
                  does not happen — so it renders as the absence it is, never as an attribution. */}
              <span>{` ${strings.history.by} ${record.actor_user_id ?? strings.history.absent} · `}</span>
              <span>{changedAtText(record.server_received_at)}</span>
              <span className="text-muted-foreground">
                {` · ${strings.history.version} ${record.payload.version}`}
              </span>
            </span>
            {/* `14-F3`'s "450 → 480", one row per `(branch, channel)` cell that moved. Named cells
                rather than a bare pair: `01-F60` prices per (branch, channel), so "450 → 480" with
                no key is ambiguous across every cell in the grid. Deliberately NOT a nested list —
                the `<li>`s of this screen are its history rows, and a reader counting them (a
                person or a test) must not have price rows folded into that count. */}
            {record.payload.price_changes.map((change) => (
              <span key={`${change.branch_id} ${change.channel}`} className="text-xs tabular-nums">
                <span className="text-muted-foreground">{`${change.branch_id} · ${change.channel} `}</span>
                <span>{changeText(change)}</span>
              </span>
            ))}
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">{strings.history.nonPriceFields}</p>
    </div>
  );
};
