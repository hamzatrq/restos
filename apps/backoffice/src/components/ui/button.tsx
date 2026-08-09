"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

/**
 * shadcn/ui's Button (`18 §7`: shadcn/ui + Radix for internal tools).
 *
 * `27-F8`'s 76 dp counter tile is deliberately NOT applied here — `backoffice-catalog.md §4.3` is
 * explicit that doc 27's low-literacy laws govern the counter, and putting a thumb-sized control
 * on a menu editor a literate owner drives with a mouse would be a category error. What does carry
 * over is `27-F15`: state is a FILL, never an opacity wash, so a disabled control stays legible
 * and keeps saying why.
 */
/**
 * **Where the `27-F14` blue is allowed to go, decided rather than inherited.**
 *
 * `plans/wave-1/design-direction.md` leaves this open: *"the primary action currently ships as a
 * large saturated blue fill. `27-F16` reserves colour for the abnormal, and a permanent blue on
 * the resting happy path may already violate it. Read the FR and decide deliberately."*
 *
 * Read: `27-F16` is about **money** — *"money is never coloured by default"* — and `27-F14`'s
 * fourth slot is allocated outright to *"**blue accent** — interactive / mandatory action — any
 * control the operator may press"*. So blue on a control is the budget working, not a leak. What
 * the budget does **not** say is that blue means *important*: it means *pressable*. Spending the
 * saturated fill on every pressable control therefore says nothing, and it is what put a
 * full-width blue `New item` bar at the top of the menu list while `Save` — the act that reaches
 * every till in the org — sat below the fold as a 36 px button of the same colour.
 *
 * The rule this file now encodes: **the fill is for the ONE committing action on a screen.**
 * Everything else pressable is `secondary` — a sunken fill inside `27-F66`'s 3:1 boundary, which
 * is what makes it perceivable as a control without spending a hue. Blue therefore still marks
 * "pressable" on the one control where an owner is looking for it.
 *
 * `27-F8`'s 76 dp counter tile is deliberately NOT applied here — `backoffice-catalog.md §4.3` is
 * explicit that doc 27's low-literacy laws govern the counter, and putting a thumb-sized control
 * on a menu editor a literate owner drives with a mouse would be a category error. What does carry
 * over is `27-F15`: state is a FILL, never an opacity wash, so a disabled control stays legible
 * and keeps saying why.
 *
 * `27-F42` — the label takes `text-label` WHOLE. `sm` is the one place that falls back to
 * Tailwind's `text-xs`, for the caption-composite gap recorded in `theme-css.ts`.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-label " +
    "transition-colors disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:brightness-110",
        secondary:
          "bg-secondary text-secondary-foreground border border-border-strong hover:bg-background",
        destructive: "bg-destructive text-destructive-foreground hover:brightness-110",
        ghost: "text-foreground hover:bg-muted",
      },
      size: {
        /**
         * The committing action, and the only size that is about WEIGHT rather than fit. `Save`
         * with apply-now armed moves every till in the organisation mid-service; a control that
         * consequential should not be the same object as `Cancel this edit`.
         */
        lg: "h-11 px-6",
        md: "h-10 px-4",
        sm: "h-8 px-3 text-xs",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export const Button = ({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps): React.ReactNode => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
};
