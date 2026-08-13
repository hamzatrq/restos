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

import type { CatalogPriceChangeT } from "@restos/domain";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { formatPaisa } from "../lib/money";
import { strings } from "../lib/strings";
import { useTRPC } from "../lib/trpc";
import { formatInstant } from "../lib/when";
import { Note } from "./ui/surface";

/**
 * `14-F3`'s *"2 Jul"*.
 *
 * The format and every reason for it now live in `lib/when.ts`, because the `14-F28` pending
 * queue and the save receipt were each rendering a bare `en-US` `toLocaleString` — so one page
 * showed "Lands 8/8/2026, 05:00:00" above "2 Aug 2026, 05:00". One format, one place.
 */
const changedAtText = formatInstant;

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
    return <p className="text-body text-muted-foreground">{strings.errors.loading}</p>;
  }
  if (history.error !== null) return <Note tone="fault">{history.error.message}</Note>;

  // IN PLACE — this entity's records, newest first. The append order is the ledger's; reversing it
  // is a display choice and touches no projected value (`01-F34`).
  const mine = history.data
    .filter((record) => record.payload.entity === entity && record.payload.entity_id === entity_id)
    .slice()
    .reverse();

  if (mine.length === 0) {
    return <p className="text-body text-muted-foreground">{strings.history.empty}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {/*
        A timeline, not a stack of identical boxes. `14-F3` calls the audit trail *"a first-class
        UI element, not a hidden log"*, and four equally-weighted rectangles say nothing about
        order — a reader had to parse four dates to learn which came first. The rule down the
        left and the tick per entry carry the sequence; entries are newest first.

        ⚠ The text COMPOSITION below is unchanged on purpose. `shell.dom.test.tsx` reads each
        row's `textContent` and asserts contiguous strings — `"by u-ali · "`, `"2 Jul 2026"`,
        `"branch-main · counter Rs 450 → Rs 480"` — so the literal spaces inside these template
        strings are load-bearing, and the spans holding them may be restyled but never re-split.
      */}
      {/*
        **The cell rows are a TABLE now, not nine sentences.** `01-F60` prices per (branch,
        channel), so a fully-priced 3x3 org logs nine movements per edit — and they rendered as
        nine ragged lines of `<branch> · <channel> — → Rs 1,850`, where the key, the arrow and the
        two numbers all started at a different x on every line. Nothing in that block could be
        compared down a column, which is the only thing a reader wants from it.

        A two-column grid fixes the comparison without touching the text COMPOSITION, which is
        load-bearing: `shell.dom.test.tsx` reads each row's `textContent` and asserts contiguous
        strings including the literal spaces inside these template strings, so the spans may be
        restyled and re-laid-out but never re-split.
      */}
      <ol className="flex flex-col border-l border-border pl-4">
        {mine.map((record) => (
          <li
            key={`${record.payload.version}-${record.payload.after_ref ?? ""}`}
            className="relative flex flex-col gap-2 py-3 text-label before:absolute before:-left-[1.3125rem] before:top-4 before:size-2 before:rounded-full before:bg-border-strong"
          >
            <span>
              <span className="text-foreground">
                {/* `before_ref === null` means the entry is NEW — there was nothing to change from. */}
                {record.payload.before_ref === null
                  ? strings.history.created
                  : strings.history.changed}
              </span>
              {/* `14-F3`'s "by Ali, 2 Jul". `actor_user_id` is `null`-able in `LedgerRecord` because
                  "appended with no actor" has to be a constructible mistake or no test can prove it
                  does not happen — so it renders as the absence it is, never as an attribution. */}
              <span>{` ${strings.history.by} ${record.actor_user_id ?? strings.history.absent} · `}</span>
              <span className="text-muted-foreground">
                {changedAtText(record.server_received_at)}
              </span>
              <span className="text-muted-foreground">
                {` · ${strings.history.version} ${record.payload.version}`}
              </span>
            </span>
            {/* `14-F3`'s "450 → 480", one row per `(branch, channel)` cell that moved. Named cells
                rather than a bare pair: `01-F60` prices per (branch, channel), so "450 → 480" with
                no key is ambiguous across every cell in the grid. Deliberately NOT a nested list —
                the `<li>`s of this screen are its history rows, and a reader counting them (a
                person or a test) must not have price rows folded into that count. */}
            {record.payload.price_changes.length === 0 ? null : (
              /*
                **The moved cells are a TABLE now, not a stack of sentences.** A fully-priced
                3x3 org logs NINE movements per edit, and they rendered as nine ragged lines
                where the key, the arrow and both numbers started at a different x on every one
                — so nothing in the block could be compared down a column, which is the only
                thing a reader wants from it. A two-column subgrid puts every key left and every
                movement right, on their own sunken ground so the block reads as one artifact
                belonging to the line above it.

                ⚠ The text COMPOSITION is untouched. `shell.dom.test.tsx` asserts contiguous
                strings, so the literal spaces in these template strings are load-bearing: these
                spans may be restyled and re-laid-out, never re-split.
              */
              <span className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1 rounded-md bg-muted px-3 py-2">
                {record.payload.price_changes.map((change) => (
                  <span
                    key={`${change.branch_id} ${change.channel}`}
                    className="col-span-2 grid grid-cols-subgrid text-xs tabular-nums text-muted-foreground"
                  >
                    <span className="truncate">{`${change.branch_id} · ${change.channel} `}</span>
                    {/* `27-F25` — these two numbers are the payload of an audit line and were
                        the DIMMEST thing on it: 12px muted, under a metadata header at full
                        contrast. Full contrast now, cell key muted, which is the correct way
                        round. `27-F16` keeps them uncoloured: a price rise is not abnormal. */}
                    <span className="text-right text-foreground">{changeText(change)}</span>
                  </span>
                ))}
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">{strings.history.nonPriceFields}</p>
    </div>
  );
};
