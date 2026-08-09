"use client";

/**
 * **`14-F29` — the screen that matters.**
 *
 * A row per branch, a column per enabled channel, prefilled from one number with a fill-across
 * action and overrides typed on top. The arithmetic and the completeness rule are not here — they
 * are in `lib/price-grid.ts`, so `01-F60` can be asserted without a DOM. What is here is the
 * interaction, and one property of it is load-bearing:
 *
 * **the fill-across is not a convenience.** A five-branch org faces 25 cells per item, most of them
 * equal. Without one action that sets them all, an owner routes around the editor — and routing
 * around it is exactly what a house-price fallback would have institutionalised.
 */

import type { OrderChannel } from "@restos/domain";
import { ArrowRightToLine } from "lucide-react";
import { useState } from "react";
import type { EnabledPairs, GridDraft, GridFault } from "../lib/price-grid";
import { cellKey } from "../lib/price-grid";
import { strings } from "../lib/strings";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Field, Input, Label } from "./ui/field";
import { Note } from "./ui/surface";

/**
 * `27-F23` — *"Money format: `Rs`, symbol-first."* On the money, at the keystroke where it
 * matters: this app stores integer paisa and an owner typing `245000` where `2450` was meant is
 * a hundredfold error `01-F53` then freezes into every line. Nine to twenty-five of these read
 * as texture rather than noise because they are muted and small — the number beside them is what
 * `27-F25` makes the payload.
 *
 * `aria-hidden`, deliberately: the cell's accessible name is its `(branch, channel)` pair and
 * nothing else, so a screen reader hears "gulberg counter" rather than "Rs gulberg counter".
 */
const RupeeMark = ({ className }: { className?: string }): React.ReactNode => (
  <span aria-hidden="true" className={cn("shrink-0 text-xs text-muted-foreground", className)}>
    Rs
  </span>
);

export type PriceGridProps = {
  readonly enabled: EnabledPairs;
  readonly draft: GridDraft;
  readonly faults: readonly GridFault[];
  readonly onCellChange: (branch_id: string, channel: OrderChannel, text: string) => void;
  readonly onFillAcross: (text: string) => void;
};

export const PriceGrid = ({
  enabled,
  draft,
  faults,
  onCellChange,
  onFillAcross,
}: PriceGridProps): React.ReactNode => {
  // The fill value is the owner's unsent keystrokes, not server state — `18 §6` bans copying the
  // second into a store and says nothing about the first, which has nowhere else to live.
  const [fillValue, setFillValue] = useState("");

  if (enabled.branches.length === 0 || enabled.channels.length === 0) {
    // Fail-closed and SAYS SO, mirroring the API's `unconfiguredCatalog`: an empty enabled set is
    // refused rather than treated as "nothing to check", because an empty cross product makes
    // every entry vacuously complete.
    return <Note tone="fault">{strings.grid.notEnabled}</Note>;
  }

  const faultAt = new Map(
    faults.map((fault) => [cellKey(fault.branch_id, fault.channel), fault.reason]),
  );

  return (
    /*
      **THE SIGNATURE ELEMENT OF THIS APP.**

      `plans/wave-1/design-direction.md` gives the till one: the money figure at display scale,
      because "the figure is the product". The back office is a different room with a different
      product — an owner does not read a total here, she SETS one, and this grid is the only place
      in RestOS where a number she types reaches every device in the organisation. So the boldness
      budget is spent here, on the same axis: `27-F25`'s "numbers are the operational payload and
      the largest element in their region", taken literally.

      The cells were 16 px inside 36 px boxes — the same size as the field labels above them, one
      step below the entry name, and indistinguishable from the `Order` and `Kitchen station`
      inputs an owner touches once a year. They are now `text-numeric-primary`, the manifest's own
      28 px/600 tabular composite, which is the second-largest style `packages/ui` defines.

      Everything around them got quieter to pay for it: the two help sentences are captions, the
      column and row headers are the label register, and the grid is one ruled object on a sunken
      ground instead of a heading, a bar, a table and three loose paragraphs.
    */
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h3 className="text-label uppercase tracking-wider text-foreground">
          {strings.grid.heading}
        </h3>
        <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
          {strings.grid.help}
        </p>
      </div>

      {/*
        The grid and its fill-across are ONE ruled object, not a stray field sitting above a
        table. `14-F29` calls the fill *"prefilled with a single value and settable across the
        whole grid in one action"*, and the plan calls it what makes the honest schema usable —
        so it is the table's own header bar, sharing its border, rather than a control an owner
        has to notice. Before this it was a 12rem input with a two-line caption that pushed the
        button off the shared baseline, and it read as less important than the 25 cells it sets.
      */}
      <div className="overflow-hidden rounded-md border border-border-strong bg-card">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-b border-border-strong bg-muted px-4 py-3.5">
          {/* Wide enough for its own label on one line. `PRICE FOR EVERY CELL` is 20 uppercase,
              wide-tracked characters and it wrapped to three lines inside `w-36`, which pushed the
              `Fill across` button off the bar's baseline. The STRING cannot shrink — two suites
              find this control by `getByLabelText("Price for every cell")` — so the column does. */}
          <div className="w-full sm:w-56">
            <Field label={strings.grid.fillValue} htmlFor="fill">
              <div className="flex items-center gap-2">
                <RupeeMark />
                <Input
                  id="fill"
                  inputMode="numeric"
                  className="text-right"
                  value={fillValue}
                  onChange={(event) => setFillValue(event.target.value)}
                />
              </div>
            </Field>
          </div>
          <Button type="button" variant="secondary" onClick={() => onFillAcross(fillValue)}>
            <ArrowRightToLine aria-hidden="true" className="size-4" />
            {strings.grid.fillAcross}
          </Button>
          <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
            {strings.grid.fillAcrossHelp}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              {/*
                The channel axis, in the caption register on its own sunken band. `01-F60` prices
                per (branch, channel), so these two headers are the KEY to every number below —
                scaffolding by definition, and they were competing with the cells at the same
                12-14 px the values used.
              */}
              <tr className="border-b border-border bg-muted/60">
                <th className="w-40 px-4 py-2.5 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  {strings.grid.branch}
                </th>
                {enabled.channels.map((channel) => (
                  <th
                    key={channel}
                    className="border-l border-border px-4 py-2.5 text-left text-xs uppercase tracking-wider text-muted-foreground"
                  >
                    {channel}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enabled.branches.map((branch_id) => (
                <tr key={branch_id} className="border-b border-border last:border-b-0">
                  <th
                    scope="row"
                    className="w-40 px-4 py-2 text-left align-middle text-label text-muted-foreground"
                  >
                    {branch_id}
                  </th>
                  {enabled.channels.map((channel) => {
                    const key = cellKey(branch_id, channel);
                    const reason = faultAt.get(key);
                    // Membership, never truthiness: `"0"` is a price and an absent key is not,
                    // and the two are different facts (`01-F60`).
                    const value = draft[key] ?? "";
                    const empty = value === "";
                    const id = `price-${branch_id}-${channel}`;
                    return (
                      <td
                        key={channel}
                        /*
                          **A money column may never squeeze its own number.** Found by looking at
                          390 px (`14-N2`'s phone): `Mutton Karahi`'s `3200` rendered as `32` —
                          the cell had shrunk under the 28 px numerals and clipped the value
                          inside the input, on the one surface in the product where a mistyped
                          figure reaches every till. A `min-w` makes the TABLE overflow and scroll
                          instead, which is visible and recoverable; a clipped price is neither.
                        */
                        className="min-w-36 border-l border-border p-2"
                      >
                        <Label htmlFor={id} className="sr-only">
                          {`${branch_id} ${channel}`}
                        </Label>
                        {/*
                          **`01-F60`'s two facts, given two appearances.**

                          Before this, an unpriced cell and a `Rs 0` cell were the same empty-
                          looking box one character apart — the exact confusion the FR says must
                          never happen (*"it distinguishes 'this costs nothing' from 'somebody
                          forgot foodpanda'"*). Seen live: a foodpanda column reading `2173`, `0`
                          and blank, all three rendered identically.

                          The distinction is a WORD, not a colour — `27-F12`: colour never
                          carries state alone, every status is colour + shape + position + a
                          number. So an empty cell says `no price` at rest, in the muted
                          foreground, spending nothing from the `27-F16` budget; a free one says
                          `Rs 0` and reads as the number it is. Colour arrives only once the cell
                          is an actual fault, which is `27-F16`'s rule exactly: colour on a number
                          means *this number is abnormal*.
                        */}
                        <div className="flex items-baseline gap-2">
                          {/* The mark means something only beside a number. On an unpriced cell
                              it would read "Rs no price", which is neither. */}
                          {empty ? (
                            <span className="w-5 shrink-0" />
                          ) : (
                            <RupeeMark className="w-5" />
                          )}
                          <Input
                            id={id}
                            inputMode="numeric"
                            aria-invalid={reason !== undefined}
                            placeholder={strings.grid.unpriced}
                            className={cn(
                              /*
                                `27-F25` — the number is the operational payload of this region and
                                THE LARGEST ELEMENT IN IT. `text-numeric-primary` is the manifest's
                                own 28 px / 36 / 600 / tabular composite (`27-F42`, taken whole),
                                the second-largest style `packages/ui` defines and the one its law
                                line assigns to exactly this job.

                                It was `text-base font-medium` — 16/500, an assembled pairing, and
                                the same size as the `Order` field an owner touches once a year.
                              */
                              "h-14 text-right text-numeric-primary",
                              // An unpriced cell is not a number, so it does not get the number's
                              // scale: the placeholder is a WORD (`01-F60`, `27-F12`) and setting
                              // it at 28 px would make an absence shout louder than a price.
                              empty &&
                                "border-dashed text-body placeholder:text-body placeholder:text-muted-foreground",
                            )}
                            value={value}
                            onChange={(event) =>
                              onCellChange(branch_id, channel, event.target.value)
                            }
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {faults.length === 0 ? null : (
        <Note tone="fault">
          {`${strings.grid.incomplete} ${faults
            .map((fault) => `${fault.branch_id} / ${fault.channel} — ${fault.reason}`)
            .join("; ")}`}
        </Note>
      )}

      {/*
        The grid's two standing footnotes, together and demoted.

        `01-F60`'s explicit zero and `01-F18`'s price snapshot were two separate paragraphs at the
        same weight as each other and as the fault note between them, so the block under the grid
        read as three equal claims of which one was sometimes a refusal. Grouped, captioned and
        set below the fault, the refusal is the only thing that changes and is therefore the only
        thing that draws the eye — `27-F16`'s principle applied to text weight rather than hue.
      */}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs leading-relaxed text-muted-foreground">{strings.grid.freeHelp}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {strings.grid.openOrdersKeepTheirPrice}
        </p>
      </div>
    </div>
  );
};
