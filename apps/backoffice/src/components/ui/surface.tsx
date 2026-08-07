"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/utils";

/** shadcn/ui Card, and the only container this app has. */
export const Card = ({ className, ...props }: ComponentProps<"section">): ReactNode => (
  <section
    className={cn("rounded-lg border border-border bg-card text-card-foreground", className)}
    {...props}
  />
);

export const CardHeader = ({ className, ...props }: ComponentProps<"header">): ReactNode => (
  <header className={cn("flex flex-col gap-1 border-b border-border p-4", className)} {...props} />
);

export const CardTitle = ({ className, ...props }: ComponentProps<"h2">): ReactNode => (
  <h2 className={cn("text-base font-semibold leading-none", className)} {...props} />
);

export const CardBody = ({ className, ...props }: ComponentProps<"div">): ReactNode => (
  <div className={cn("flex flex-col gap-4 p-4", className)} {...props} />
);

/**
 * A status note. `27-F16` is the reason `tone` defaults to neutral: colour on a screen means *this
 * is abnormal*, so the base case spends none of the preattentive channel and a refusal spends all
 * of it.
 */
export const Note = ({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"p"> & { tone?: "neutral" | "fault" | "abnormal" }): ReactNode => (
  <p
    className={cn(
      "rounded-md px-3 py-2 text-sm",
      tone === "neutral" && "bg-muted text-muted-foreground",
      tone === "fault" && "bg-destructive text-destructive-foreground",
      tone === "abnormal" && "bg-warning text-warning-foreground",
      className,
    )}
    {...props}
  />
);
