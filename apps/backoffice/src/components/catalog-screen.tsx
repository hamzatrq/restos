"use client";

/**
 * B-6's screen frame: the published menu on the left, one editor on the right, the `14-F28` pending
 * queue below.
 *
 * **The two version axes stay two.** `catalog.published` is what devices have; `catalog.pending` is
 * what is staged and cancellable. They are rendered as separate sections and never merged, because
 * a single list would show an owner a menu no till has, and a cancelled edit would go on looking
 * as though it had shipped (`services/api/src/catalog.ts` names this as the trap it is shaped
 * against).
 *
 * The only state here is WHICH entry the owner has open — an intent, not a copy of server data.
 *
 * **`01-F60`'s enabled `(branch, channel)` set comes from `catalog.enabled` and from NOWHERE ELSE
 * (August 2026).** It used to come from this app's own `NEXT_PUBLIC_ENABLED_*`, which made the
 * axes `14-F29`'s grid is drawn on and the axes `assertSavable` refuses a save against two
 * declarations that could disagree — and when they do, an owner prices a menu whose every tile
 * reads `no price set` on the till, with every process reporting success. There is deliberately
 * **no fallback** when that query fails: a grid drawn on a guess is how the bug comes back, and
 * this app has no honest guess to make (`01-F60` refuses a fallback price for the same reason,
 * and the deleted `lib/env.ts` recorded why the two plausible guesses are both worse). The screen
 * names what is unreachable and draws no editor at all.
 */

import { useQuery } from "@tanstack/react-query";
import { ListTree, Plus, RefreshCw } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { CatalogEntry, EnabledSet } from "../lib/catalog-types";
import { formatPaisa } from "../lib/money";
import { Named, usePlaceNames } from "../lib/names";
import { strings } from "../lib/strings";
import { useTRPC } from "../lib/trpc";
import { cn } from "../lib/utils";
import { EntryEditor, nounForKind } from "./entry-editor";
import { PendingEdits } from "./pending-edits";
import { Button } from "./ui/button";
import { Caption, Card, CardBody, CardHeader, CardTitle, Problem } from "./ui/surface";

/** `"new"` is the unsaved entry; a string is a published entry's `kind id`. */
type Selection = { kind: string; id: string } | "new" | null;

const selectionKey = (selection: Selection): string =>
  selection === null ? "none" : selection === "new" ? "new" : `${selection.kind} ${selection.id}`;

/** The axes half of the editor's remount key — see the `EntryEditor` call site for why. */
const axesKey = (enabled: EnabledSet): string =>
  `${enabled.branches.join(",")}|${enabled.channels.join(",")}`;

/**
 * How deep an entry sits on the `01-F21` parent chain, so the list can render the TREE the
 * catalog actually is.
 *
 * The list was flat: five categories, sixteen items and five modifiers as siblings in one stack,
 * each captioned with its own `kind` in grey because nothing else said what it was. That caption
 * is two dozen repetitions of what the structure already carries — and it still could not say
 * that "Chicken Karahi" sits under "Karahi & Handi", which is the thing an owner scanning a menu
 * needs first.
 *
 * **Depth only — never a re-sort.** The order on screen stays the publisher's (`sort`);
 * rearranging it here would be this screen inventing a menu nobody wrote. A missing parent or a
 * cycle stops the walk instead of looping: reference data is edited by hand, and a `parent_id`
 * pointing at nothing is a thing that happens.
 */
const depthOf = (entry: CatalogEntry, byId: ReadonlyMap<string, CatalogEntry>): number => {
  const seen = new Set<string>([entry.id]);
  let depth = 0;
  let parent = entry.parent_id ?? null;
  while (parent !== null && !seen.has(parent) && depth < 4) {
    const next = byId.get(parent);
    if (next === undefined) break;
    seen.add(parent);
    depth += 1;
    parent = next.parent_id ?? null;
  }
  return depth;
};

/**
 * The one `(branch, channel)` this list quotes, and it is stated ONCE — in the card header, not
 * on every row.
 *
 * `01-F60` prices per pair with no fallback, so a bare number beside an item's name is ambiguous
 * across the whole grid: with three branches and three channels it is one of nine, and an owner
 * has no way to know which. The old list rendered `prices[0]` with no key at all, which reads as
 * *the* price. Naming the pair on each row fixes the ambiguity and immediately reintroduces the
 * noise it was meant to replace — sixteen repetitions of the same six words. So it is a column
 * heading, which is what a column heading is for.
 *
 * The pair comes from the ENABLED set rather than from `prices[0]`, so every row quotes the same
 * cell and the column is comparable down its length. `prices[0]` is whatever order the writer
 * happened to serialise, and a list where row 3 quotes foodpanda while row 4 quotes the counter
 * is a price comparison that lies.
 *
 * **The set is the SERVER's** — the same argument as the grid's axes, one layer out. A list
 * heading that quoted a locally-configured pair while the editor below it drew the server's
 * would tell an owner she is comparing a column that is not there.
 */
const referencePair = (enabled: EnabledSet): { branch_id: string; channel: string } | null => {
  const branch_id = enabled.branches[0];
  const channel = enabled.channels[0];
  return branch_id === undefined || channel === undefined ? null : { branch_id, channel };
};

/**
 * `27-F23` — `Rs`, symbol-first, no operational decimals. `27-F25` — the number is the payload of
 * its region, so it is no longer the dimmest thing in the row.
 *
 * **An entry priced everywhere EXCEPT this pair renders the `01-F60` gap rather than a blank.**
 * That is not a display convenience: an unpriced enabled pair is an item the till cannot sell,
 * and surfacing it in the list is how an owner finds one without opening twenty editors.
 */
const ListPrice = ({
  entry,
  pair,
  archived,
}: {
  entry: CatalogEntry;
  pair: { branch_id: string; channel: string } | null;
  /** `14-F7` — an archived entry sells on no till, so its price is not a live price. */
  archived: boolean;
}): ReactNode => {
  // A category or a modifier group is priced by nothing (`01-F60`), so it quotes nothing.
  if (entry.prices === undefined || pair === null) return null;
  const here = entry.prices.find(
    (price) => price.branch_id === pair.branch_id && price.channel === pair.channel,
  );
  if (here === undefined) {
    return (
      <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
        {strings.grid.unpriced}
      </span>
    );
  }
  // A fixed column, not a shrink-to-fit tail: `tabular-nums` only aligns by place value if the
  // column has a place to align to. 26 rows of it is the densest money on this screen.
  // The whole ROW recedes when archived, not just its name. It read as a live price at full
  // contrast beside a greyed-out dish, which is the row contradicting itself: `14-F7` archiving
  // hides an item from every menu and POS grid, so the number is history, not an offer.
  return (
    <span
      className={cn(
        "w-24 shrink-0 text-right text-label tabular-nums",
        archived ? "text-muted-foreground" : "text-foreground",
      )}
    >
      {formatPaisa(here.price_paisa)}
    </span>
  );
};

/**
 * The one failed-query surface this screen renders, for either of its two queries.
 *
 * `Problem` is the app's only way to render a failure and the reasons live in `ui/surface.tsx`;
 * what this adds is that both queries reach the SAME one. A second, hand-rolled copy for the
 * enabled query is how `error.message` in a red bar came back the first time.
 */
const Unreachable = ({
  detail,
  busy,
  onRetry,
}: {
  detail: string;
  busy: boolean;
  onRetry: () => void;
}): ReactNode => (
  <Problem
    heading={strings.unreachable.heading}
    body={strings.unreachable.body}
    action={strings.unreachable.action}
    detail={detail}
  >
    <Button type="button" variant="secondary" disabled={busy} onClick={onRetry}>
      <RefreshCw aria-hidden="true" className="size-4" />
      {busy ? strings.unreachable.retrying : strings.unreachable.retry}
    </Button>
  </Problem>
);

export const CatalogScreen = (): ReactNode => {
  const trpc = useTRPC();
  /** `01-F69` — the branch in the price-column heading is a NAME (`21-F15`). */
  const places = usePlaceNames();
  const published = useQuery(trpc.catalog.published.queryOptions());
  /**
   * `01-F60`'s axes, asked of the server. Read where it is needed and passed down as a prop —
   * never copied into state, which is the `18 §6` line `two-plane.test.ts` draws.
   */
  const enabled = useQuery(trpc.catalog.enabled.queryOptions());
  const [selection, setSelection] = useState<Selection>(null);

  if (published.isPending || enabled.isPending) {
    return <p className="text-body text-muted-foreground">{strings.errors.loading}</p>;
  }
  // The bare red bar this replaced is the screen the reviewer actually met: a `fetch failed` from
  // undici, rendered verbatim and alone. See `ui/surface.tsx`'s `Problem` for what it owes an
  // owner instead — and note the raw message is still here, under `detail`.
  //
  // **Either query failing stops the screen, and the enabled one is the load-bearing half.** There
  // is NO fallback to a locally-configured set: a grid drawn on a guess is how `01-F60`'s drift
  // comes back, and it comes back silently — the owner prices a menu, every process reports
  // success, and every tile reads `no price set` on the till. Refusing to draw is the same
  // fail-closed direction `assertSavable` takes on an empty set.
  //
  // Two `if`s rather than one, because each narrows its OWN query: collapsing them into a shared
  // `failed` variable widens both `data` back to `| undefined` and the screen stops compiling.
  if (enabled.error !== null) {
    return (
      <Unreachable
        detail={enabled.error.message}
        busy={enabled.isFetching}
        onRetry={() => void enabled.refetch()}
      />
    );
  }
  if (published.error !== null) {
    return (
      <Unreachable
        detail={published.error.message}
        busy={published.isFetching}
        onRetry={() => void published.refetch()}
      />
    );
  }

  const { version, entries } = published.data;
  const axes = enabled.data;
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const pair = referencePair(axes);
  const open =
    selection === null || selection === "new"
      ? null
      : (entries.find((e) => e.kind === selection.kind && e.id === selection.id) ?? null);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <CardTitle>{strings.catalog.heading}</CardTitle>
              {/* The version devices actually have (`01-F52`..`01-F56`), not the staged axis.
                  It is the one figure on this card an owner cross-checks against a till, so it is
                  a labelled VALUE — caption above, number below at content scale — rather than a
                  bolded word at the end of a sentence (`27-F25`, direction move 2). */}
              <span className="flex shrink-0 flex-col items-end leading-tight">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  {strings.catalog.publishedVersion}
                </span>
                <span className="text-body tabular-nums text-foreground">{version}</span>
              </span>
            </div>
            {/* The column heading for the money column below — `01-F60`'s pair, said once.
                The branch half is a NAME (`21-F15`); the channel half is a closed vocabulary
                (`02-F42`) and an owner's own word for it, so it is not an identifier and gets no
                treatment. */}
            {pair === null ? null : (
              <p className="text-xs text-muted-foreground">
                {strings.catalog.pricesShown} <Named naming={places.branch(pair.branch_id)} />
                {` · ${pair.channel}`}
              </p>
            )}
          </CardHeader>
          <CardBody>
            {/* `secondary`, and sized to itself. It shipped as the default `primary` inside a
                `flex-col` body, so it rendered as a full-width saturated blue bar across the top
                of the menu — the loudest object on the screen, above the 26 rows that are the
                content, while `Save` (the act that reaches every till) sat below the fold in the
                same colour. See `ui/button.tsx` for the reading of `27-F14` that decides this. */}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() => setSelection("new")}
            >
              <Plus aria-hidden="true" className="size-4" />
              {strings.catalog.newEntry}
            </Button>
            {entries.length === 0 ? (
              <p className="text-body text-muted-foreground">{strings.catalog.empty}</p>
            ) : (
              /*
                **Density is the back office's answer where size is the till's** (`27-F11`:
                *"density is a professional-tool decision, not a taste one"*). A cashier wants few
                large targets; an owner scanning a menu wants to see the whole menu. Every row was
                two lines — a name over a repeated `kind` caption — which on this 26-entry menu
                spent ~500 px saying "category" five times. Every row is now ONE line and the
                kind rides inline, so a third more of the menu is on screen at once.
              */
              /* Full-bleed to the card's edges (`-mx-5` against `CardBody`'s `p-5`) so a category
                 band is a band across the panel and not a floating grey pill inset from it. The
                 rows' own left offset is restored by the depth arithmetic below, whose base is
                 therefore the card's padding rather than zero. */
              <ul className="-mx-5 flex flex-col">
                {entries.map((entry) => {
                  const chosen =
                    selection !== null &&
                    selection !== "new" &&
                    selection.kind === entry.kind &&
                    selection.id === entry.id;
                  const depth = depthOf(entry, byId);
                  const archived = entry.deleted === true;
                  // A container is priced by nothing (`01-F60`), which is also what makes it a
                  // SECTION on this list: it groups the rows under it and is not itself a thing
                  // a till sells. It takes the caption register and its own ground.
                  const container = entry.prices === undefined;
                  return (
                    <li key={`${entry.kind} ${entry.id}`}>
                      <button
                        type="button"
                        aria-current={chosen ? "true" : undefined}
                        onClick={() => setSelection({ kind: entry.kind, id: entry.id })}
                        /*
                          `27-F66` — a state difference between two neutral fills is carried by an
                          independent MARK meeting 3:1, never by the fill step alone. Before this
                          there was no selected style at all: the only row treatment was
                          `hover:bg-muted`, so the row under the cursor and the row being edited
                          were the same appearance, and neither could be told from a plain row in
                          a screenshot. The mark here is the left accent rule plus the border; the
                          fill is depth, and is no longer load-bearing.
                        */
                        className={cn(
                          "flex w-full items-baseline justify-between gap-3 border-l-2 py-2 pr-5 text-left",
                          container && "mt-3 bg-muted first:mt-0",
                          chosen
                            ? "border-l-primary bg-muted"
                            : "border-l-transparent hover:border-l-border-strong hover:bg-muted",
                        )}
                      >
                        <span
                          className="flex min-w-0 items-baseline gap-2"
                          /* The `01-F21` chain, as indentation. A depth token would be a token
                             for one screen's tree; `21-F3` bans arbitrary utilities, not inline
                             layout arithmetic derived from data. */
                          style={{ paddingLeft: `${1.125 + depth * 0.875}rem` }}
                        >
                          <span
                            className={cn(
                              "truncate",
                              container
                                ? "text-label uppercase tracking-wider text-foreground"
                                : "text-label",
                              archived && "text-muted-foreground",
                            )}
                          >
                            {entry.name}
                          </span>
                          {/* The kind caption still appears exactly where it did — on a container
                              (which has no price to give it away) and on an archived row, whose
                              `14-F7` state must never be silent. It is INLINE now rather than a
                              second line: same words, half the height.

                              ⚠ It rendered `entry.kind` VERBATIM until August 2026, so this list
                              read *"Karahi & Handi category"* — the schema's own word, on the one
                              screen an owner scans most. `14-F32` gives every kind an owner-facing
                              noun and says it is this surface's name for that kind *everywhere*;
                              `14-F38` bans the raw string outright. Found by sweeping the rendered
                              text of the running app, not by a test: the editor's oracle never
                              draws this list, and nothing else looks at it. */}
                          {container || archived ? (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {archived
                                ? `${nounForKind(entry.kind)} · ${strings.catalog.archived}`
                                : nounForKind(entry.kind)}
                            </span>
                          ) : null}
                        </span>
                        <ListPrice entry={entry} pair={pair} archived={archived} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        {selection === null ? (
          // An empty screen is an invitation to act, not a void. Nothing was rendered here
          // before, so a 1440-wide desk showed a 22rem list and a thousand pixels of nothing.
          <div className="hidden h-80 flex-col items-center justify-center gap-4 self-start rounded-lg border border-dashed border-border p-10 text-center lg:flex">
            <ListTree aria-hidden="true" className="size-8 text-muted-foreground" />
            <p className="max-w-sm text-body text-muted-foreground">{strings.catalog.chooseOne}</p>
          </div>
        ) : (
          // KEYED by the selection AND by the axes, which is what makes the editor's `useState`
          // seeds legal: choosing another entry — or the server changing the enabled set under an
          // open editor — MOUNTS a new editor rather than reconciling a stale one.
          //
          // The axes half became load-bearing when they stopped being a build-time constant. The
          // draft is seeded from `enabled` (`emptyDraft`/`draftFromPrices`), so an editor that
          // survived a change of axes would hold cells for a channel that is no longer enabled and
          // none for one that now is — and `resolveGrid` would refuse a save the owner cannot see
          // the cause of. A remount is the seed-once pattern applied to the second prop.
          <EntryEditor
            key={`${selectionKey(selection)} ${axesKey(axes)}`}
            initial={open}
            enabled={axes}
            onSaved={() => setSelection(null)}
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{strings.timing.pendingHeading}</CardTitle>
          <Caption>{strings.timing.cancelHelp}</Caption>
        </CardHeader>
        <CardBody>
          <PendingEdits />
        </CardBody>
      </Card>
    </div>
  );
};
