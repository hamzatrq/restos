"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * shadcn/ui Input. `21 §2`'s floor: every input is labelled, and the label is a real `<label>`.
 *
 * `text-body` rather than `text-sm`: what an owner types here is content, and it was being set
 * two steps below the labels that name it. The box is 40 px so the type has room to sit in.
 */
export const Input = ({ className, ...props }: ComponentProps<"input">): ReactNode => (
  <input
    className={cn(
      "flex h-10 w-full rounded-md border border-input bg-background px-3 text-body",
      "placeholder:text-muted-foreground disabled:bg-muted disabled:text-muted-foreground",
      "aria-[invalid=true]:border-destructive aria-[invalid=true]:bg-background",
      className,
    )}
    {...props}
  />
);

/**
 * `htmlFor` is REQUIRED, not optional — `18 §7`'s accessibility floor is "keyboard operability +
 * labels on all internal tools", and an unbound `<label>` is a decoration that reads as a label.
 *
 * **A field label is scaffolding and now looks like it** (direction move 2, *"invert label and
 * value"*). It was `text-sm font-medium` — the same 14/500 as the value in the box beside it, so
 * *Name* and *Chicken Karahi (Full)* carried identical weight. Uppercase, spaced and muted puts it
 * in the caption register while the value keeps content scale. `text-label` is taken whole
 * (`27-F42`); the case and tracking are presentation, not a second pairing.
 */
export const Label = ({
  className,
  htmlFor,
  children,
}: {
  className?: string;
  htmlFor: string;
  children: ReactNode;
}): ReactNode => (
  <label
    htmlFor={htmlFor}
    className={cn("text-label uppercase tracking-wider text-muted-foreground", className)}
  >
    {children}
  </label>
);

/** A label bound to its control, plus the help text that explains the field's consequence. */
export const Field = ({
  label,
  help,
  htmlFor,
  children,
}: {
  label: string;
  help?: string;
  htmlFor: string;
  children: ReactNode;
}): ReactNode => (
  <div className="flex flex-col gap-2">
    <Label htmlFor={htmlFor}>{label}</Label>
    {children}
    {help === undefined ? null : (
      <p className="text-xs leading-relaxed text-muted-foreground">{help}</p>
    )}
  </div>
);
