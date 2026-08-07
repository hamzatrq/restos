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
import { useState } from "react";
import type { EnabledPairs, GridDraft, GridFault } from "../lib/price-grid";
import { cellKey } from "../lib/price-grid";
import { strings } from "../lib/strings";
import { Button } from "./ui/button";
import { Field, Input, Label } from "./ui/field";
import { Note } from "./ui/surface";

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
        <h3 className="text-sm font-semibold">{strings.grid.heading}</h3>
        <p className="text-xs text-muted-foreground">{strings.grid.help}</p>
        <p className="text-xs text-muted-foreground">{strings.grid.freeHelp}</p>
      </div>

      <div className="flex items-end gap-2">
        <div className="w-48">
          <Field label={strings.grid.fillValue} help={strings.grid.fillAcrossHelp} htmlFor="fill">
            <Input
              id="fill"
              inputMode="numeric"
              value={fillValue}
              onChange={(event) => setFillValue(event.target.value)}
            />
          </Field>
        </div>
        <Button type="button" variant="secondary" onClick={() => onFillAcross(fillValue)}>
          {strings.grid.fillAcross}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-border bg-muted p-2 text-left font-medium">
                {strings.grid.branch}
              </th>
              {enabled.channels.map((channel) => (
                <th
                  key={channel}
                  className="border border-border bg-muted p-2 text-left font-medium"
                >
                  {channel}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {enabled.branches.map((branch_id) => (
              <tr key={branch_id}>
                <th scope="row" className="border border-border bg-muted p-2 text-left font-medium">
                  {branch_id}
                </th>
                {enabled.channels.map((channel) => {
                  const key = cellKey(branch_id, channel);
                  const reason = faultAt.get(key);
                  const id = `price-${branch_id}-${channel}`;
                  return (
                    <td key={channel} className="border border-border p-1">
                      <Label htmlFor={id} className="sr-only">
                        {`${branch_id} ${channel}`}
                      </Label>
                      <Input
                        id={id}
                        inputMode="numeric"
                        aria-invalid={reason !== undefined}
                        // Membership, never truthiness: `"0"` renders as `0` and an absent key
                        // renders empty, and the two are different facts (`01-F60`).
                        value={draft[key] ?? ""}
                        onChange={(event) => onCellChange(branch_id, channel, event.target.value)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {faults.length === 0 ? null : (
        <Note tone="fault">
          {`${strings.grid.incomplete} ${faults
            .map((fault) => `${fault.branch_id} / ${fault.channel} — ${fault.reason}`)
            .join("; ")}`}
        </Note>
      )}

      <p className="text-xs text-muted-foreground">{strings.grid.openOrdersKeepTheirPrice}</p>
    </div>
  );
};
