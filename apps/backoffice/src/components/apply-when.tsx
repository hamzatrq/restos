"use client";

/**
 * **`14-F28` — the timing control, and the thing not to get wrong.**
 *
 * The default is the 05:00 business-day boundary, because `27-F4` makes a moving operational grid
 * a breaking change against a cashier's muscle memory. Apply-now exists because menu changes are
 * sometimes genuinely urgent — but it is *"a deliberate act with the consequence stated on the
 * control, not a hidden default"*.
 *
 * Three properties, each asserted, each an FR sentence rather than a taste:
 *
 *   1. `DEFAULT_APPLY_WHEN` is `day_end`. The server defaults an absent field the same way and
 *      that is the backstop, not the rule — a client that shipped `now` as its default would send
 *      the field explicitly and the backstop would never fire.
 *   2. **Both consequences are rendered, always.** Not a tooltip, not a modal after the fact: the
 *      sentence "every till in the organisation changes as soon as this saves" is beside the
 *      radio that does it, before it is chosen.
 *   3. It is a two-option radio, not a checkbox. A checkbox has one legible state and hides the
 *      other, which is how "apply now" becomes a default nobody chose.
 */

import * as RadioGroup from "@radix-ui/react-radio-group";
import type { ReactNode } from "react";
import { strings } from "../lib/strings";

/** `14-F28`'s default, restated client-side so the safe timing is what the screen opens on. */
export const DEFAULT_APPLY_WHEN: ApplyWhen = "day_end";

export type ApplyWhen = "day_end" | "now";

const OPTIONS: readonly { value: ApplyWhen; label: string; consequence: string }[] = [
  {
    value: "day_end",
    label: strings.timing.dayEnd,
    consequence: strings.timing.dayEndConsequence,
  },
  { value: "now", label: strings.timing.now, consequence: strings.timing.nowConsequence },
];

export const ApplyWhenControl = ({
  value,
  onChange,
}: {
  value: ApplyWhen;
  onChange: (next: ApplyWhen) => void;
}): ReactNode => (
  <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
    <legend className="px-1 text-sm font-semibold">{strings.timing.heading}</legend>
    <RadioGroup.Root
      value={value}
      onValueChange={(next) => onChange(next as ApplyWhen)}
      className="flex flex-col gap-3"
    >
      {OPTIONS.map((option) => (
        <div key={option.value} className="flex items-start gap-2">
          <RadioGroup.Item
            value={option.value}
            id={`apply-${option.value}`}
            className="mt-0.5 size-4 shrink-0 rounded-full border border-input bg-background data-[state=checked]:bg-primary"
          >
            <RadioGroup.Indicator className="block size-full rounded-full" />
          </RadioGroup.Item>
          <div className="flex flex-col gap-0.5">
            <label htmlFor={`apply-${option.value}`} className="text-sm font-medium">
              {option.label}
            </label>
            {/* The consequence, ON the control. Never a tooltip and never after the click. */}
            <p className="text-xs text-muted-foreground">{option.consequence}</p>
          </div>
        </div>
      ))}
    </RadioGroup.Root>
  </fieldset>
);
