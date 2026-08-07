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
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium " +
    "transition-colors disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:brightness-110",
        secondary: "bg-secondary text-secondary-foreground border border-border-strong",
        destructive: "bg-destructive text-destructive-foreground hover:brightness-110",
        ghost: "text-foreground hover:bg-muted",
      },
      size: {
        md: "h-9 px-4 py-2",
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
