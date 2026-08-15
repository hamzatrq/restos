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
import { CalendarClock, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { strings } from "../lib/strings";
import { cn } from "../lib/utils";

/** `14-F28`'s default, restated client-side so the safe timing is what the screen opens on. */
export const DEFAULT_APPLY_WHEN: ApplyWhen = "day_end";

export type ApplyWhen = "day_end" | "now";

/**
 * `disruptive` is not a synonym for "the second one". It marks the option whose consequence
 * reaches a cashier mid-order, and it is the only thing on this control that spends colour.
 *
 * The two options used to render identically — same weight, same neutral, same size. `27-F16`
 * says colour on a screen means *this is abnormal*, and an edit that moves every till in the
 * organisation while somebody is ringing up an order is the abnormal case on this screen. It
 * looked exactly as safe as the 05:00 default, which is the shape `14-F28` calls "a hidden
 * default" — the FR's own words for what apply-now must never become.
 *
 * `27-F12` holds: the colour is not the signal. The chosen option carries the amber outline AND
 * the icon AND the sentence stating what happens, and the sentence was there before this change.
 */
const OPTIONS: readonly {
  value: ApplyWhen;
  label: string;
  consequence: string;
  icon: typeof CalendarClock;
  disruptive: boolean;
}[] = [
  {
    value: "day_end",
    label: strings.timing.dayEnd,
    consequence: strings.timing.dayEndConsequence,
    icon: CalendarClock,
    disruptive: false,
  },
  {
    value: "now",
    label: strings.timing.now,
    consequence: strings.timing.nowConsequence,
    icon: Zap,
    disruptive: true,
  },
];

export const ApplyWhenControl = ({
  value,
  onChange,
}: {
  value: ApplyWhen;
  onChange: (next: ApplyWhen) => void;
}): ReactNode => (
  <fieldset className="flex flex-col gap-3">
    <legend className="pb-3 text-label uppercase tracking-wider text-foreground">
      {strings.timing.heading}
    </legend>
    <RadioGroup.Root
      value={value}
      onValueChange={(next) => onChange(next as ApplyWhen)}
      className="flex flex-col gap-2.5"
    >
      {OPTIONS.map((option) => {
        const chosen = value === option.value;
        const Icon = option.icon;
        return (
          // ⚠ A `<label>` here, not a `<div>`, was a live a11y regression caught by the oracle:
          // wrapping the whole row in the label folded the consequence PARAGRAPH into the
          // control's accessible name, so a screen reader announced "Apply now Every till in the
          // organisation changes as soon as this saves…" as the option's name. The consequence
          // must be read, but it is not what the radio is called.
          <div
            key={option.value}
            className={cn(
              /*
                `27-F15` — state is a FILL, never an opacity wash, so the chosen row takes the
                same raised surface in both cases and the DISTINCTION is carried by the `27-F64`
                outline plus the glyph. A tinted-transparency background would put this row's text
                on an unpredictable contrast, which is the failure `27-F21` gates every pairing
                against.

                **The polarity is inverted from what shipped, and that is the fix.** The panel
                behind this control is now sunken, so an unchosen row is a hole in it and the
                CHOSEN row lifts to the raised fill — the selected option is the object standing
                proud of the panel. Before, both rows sat on the card and the chosen one went
                *darker*, which made the safe 05:00 default the visually heavy row and left
                apply-now — the one act that reaches a cashier mid-order — as the lighter, emptier
                box of the two. Weight now follows consequence.

                The chosen apply-now row also takes a real 2 px OUTLINE on top of its border —
                `27-F64`'s own instrument, and the FR explicitly frees it for this: the outline
                bounds the state and never encodes meaning of its own. It is thickness, not hue,
                so it costs nothing from the `27-F14` budget; and because an outline is drawn
                outside the box it adds no layout shift, which a `border-2` would (and which is
                what `21-F3` would have made me pay for with an arbitrary padding value).
                The signal is still the word, the glyph and the sentence.
              */
              "flex cursor-pointer items-start gap-3 rounded-md border bg-card p-3.5",
              chosen &&
                option.disruptive &&
                "border-warning-outline outline-2 outline-warning-outline",
              chosen && !option.disruptive && "border-border-strong",
              !chosen && "border-border bg-transparent hover:bg-card",
            )}
          >
            <RadioGroup.Item
              value={option.value}
              id={`apply-${option.value}`}
              /*
                **`14-F34` — the consequence is the DESCRIPTION of this control, never its name.**

                The paragraph below was already rendered beside the radio; what was missing was the
                binding, so nothing tied *this* option to *that* sentence except adjacency — which
                is a layout property no test in this app can see. `aria-describedby` is the tie a
                DOM can carry, and it is deliberately not `aria-labelledby`: folding the
                consequence into the accessible NAME is the live a11y regression this file's own
                comment above records, where a screen reader announced the whole sentence as what
                the option is called.
              */
              aria-describedby={`apply-${option.value}-consequence`}
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-input bg-background",
                option.disruptive
                  ? "data-[state=checked]:border-warning-outline data-[state=checked]:bg-warning"
                  : "data-[state=checked]:border-primary data-[state=checked]:bg-primary",
              )}
            >
              <RadioGroup.Indicator className="block size-full rounded-full" />
            </RadioGroup.Item>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`apply-${option.value}`}
                className={cn(
                  "flex cursor-pointer items-center gap-2 text-body",
                  // The chosen option's own name at content weight, so which one is armed is
                  // legible from the label and not only from the dot beside it.
                  chosen ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "size-4",
                    chosen && option.disruptive ? "text-warning-fg" : "text-muted-foreground",
                  )}
                />
                {option.label}
              </label>
              {/* The consequence, ON the control. Never a tooltip and never after the click. */}
              <p
                id={`apply-${option.value}-consequence`}
                className="text-xs leading-relaxed text-muted-foreground"
              >
                {option.consequence}
              </p>
            </div>
          </div>
        );
      })}
    </RadioGroup.Root>
  </fieldset>
);
