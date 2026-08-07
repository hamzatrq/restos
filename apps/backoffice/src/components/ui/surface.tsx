"use client";

import { AlertTriangle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { strings } from "../../lib/strings";
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
 * **A failure an owner can read, act on and retry — the replacement for `error.message` in a bar.**
 *
 * Three things a raw message never carries, and the reason this is a component rather than a
 * longer string: what is unreachable (the heading names it), whether waiting helps (the retry
 * CONTROL answers that — a button is a claim a sentence cannot make), and what to do about it
 * (`action`). The server's own words survive as `detail`, demoted below the fold of attention
 * rather than deleted, because they are the only thing useful to whoever can actually fix it.
 *
 * `27-F12` — colour never carries state alone: this is colour **and** a glyph **and** a heading
 * **and** a position. `27-F64` — the status surface carries an outline meeting 3:1, and the fill
 * carries the state; the outline here is `borderColor-strong`, not a hue of its own.
 */
export const Problem = ({
  heading,
  body,
  action,
  detail,
  children,
}: {
  heading: string;
  body: string;
  action?: string;
  /** The raw server/transport string. Rendered, but never as the headline. */
  detail?: string;
  /** The retry control. */
  children?: ReactNode;
}): ReactNode => (
  <section className="mx-auto flex max-w-xl flex-col gap-4 rounded-lg border border-border-strong bg-card p-6">
    <div className="flex items-start gap-3">
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning-fg" />
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold leading-tight">{heading}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
        {action === undefined ? null : (
          <p className="text-sm leading-relaxed text-muted-foreground">{action}</p>
        )}
      </div>
    </div>
    {children === undefined ? null : <div className="flex flex-wrap gap-2 pl-8">{children}</div>}
    {detail === undefined || detail === "" ? null : (
      <details className="border-t border-border pt-3">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          {strings.unreachable.detail}
        </summary>
        <p className="mt-2 break-words font-mono text-xs text-muted-foreground">{detail}</p>
      </details>
    )}
  </section>
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
