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
const RupeeMark = (): React.ReactNode => (
  <span aria-hidden="true" className="shrink-0 text-xs font-medium text-muted-foreground">
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold tracking-tight">{strings.grid.heading}</h3>
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
      <div className="overflow-hidden rounded-md border border-border-strong">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-border-strong bg-muted p-3">
          <div className="w-40">
            <Field label={strings.grid.fillValue} htmlFor="fill">
              <div className="flex items-center gap-2">
                <RupeeMark />
                <Input
                  id="fill"
                  inputMode="numeric"
                  className="text-right font-medium"
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
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="w-48 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {strings.grid.branch}
                </th>
                {enabled.channels.map((channel) => (
                  <th
                    key={channel}
                    className="border-l border-border px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
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
                    className="px-3 py-1.5 text-left align-middle text-sm font-medium"
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
                      <td key={channel} className="border-l border-border p-1.5">
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
                        <div className="flex items-center gap-1.5">
                          {/* The mark means something only beside a number. On an unpriced cell
                              it would read "Rs no price", which is neither. */}
                          {empty ? <span className="w-4 shrink-0" /> : <RupeeMark />}
                          <Input
                            id={id}
                            inputMode="numeric"
                            aria-invalid={reason !== undefined}
                            placeholder={strings.grid.unpriced}
                            className={cn(
                              // `27-F25` — the number is the payload of this region, so it is the
                              // largest thing in the cell rather than 14px inside a 36px box.
                              "text-right text-base font-medium tabular-nums",
                              empty && "border-dashed placeholder:text-muted-foreground",
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

      {/* `01-F60`'s explicit zero, stated beside the grid it governs rather than three lines
          above it in a block of prose an owner has already scrolled past. */}
      <p className="text-xs leading-relaxed text-muted-foreground">{strings.grid.freeHelp}</p>

      {faults.length === 0 ? null : (
        <Note tone="fault">
          {`${strings.grid.incomplete} ${faults
            .map((fault) => `${fault.branch_id} / ${fault.channel} — ${fault.reason}`)
            .join("; ")}`}
        </Note>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {strings.grid.openOrdersKeepTheirPrice}
      </p>
    </div>
  );
};
