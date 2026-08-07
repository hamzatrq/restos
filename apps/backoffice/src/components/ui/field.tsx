"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/utils";

/** shadcn/ui Input. `21 §2`'s floor: every input is labelled, and the label is a real `<label>`. */
export const Input = ({ className, ...props }: ComponentProps<"input">): ReactNode => (
  <input
    className={cn(
      "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm",
      "placeholder:text-muted-foreground disabled:bg-muted disabled:text-muted-foreground",
      "aria-[invalid=true]:border-destructive",
      className,
    )}
    {...props}
  />
);

/**
 * `htmlFor` is REQUIRED, not optional — `18 §7`'s accessibility floor is "keyboard operability +
 * labels on all internal tools", and an unbound `<label>` is a decoration that reads as a label.
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
  <label htmlFor={htmlFor} className={cn("text-sm font-medium leading-none", className)}>
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
  <div className="flex flex-col gap-1.5">
    <Label htmlFor={htmlFor}>{label}</Label>
    {children}
    {help === undefined ? null : <p className="text-xs text-muted-foreground">{help}</p>}
  </div>
);
