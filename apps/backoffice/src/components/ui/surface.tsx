"use client";

import { AlertTriangle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { strings } from "../../lib/strings";
import { cn } from "../../lib/utils";

/**
 * shadcn/ui Card, and the only container this app has.
 *
 * **A card is the app's one BOUNDED OBJECT, and that is now a budget rather than a default.**
 * `27-F66` makes `borderColor-default` a *control* boundary carrying SC 1.4.11's 3:1 — it ships at
 * 3.41:1 against the page, which is a deliberately strong rule and not a hairline. Before this
 * pass the screens spent it on everything: a card border, then a header rule, then a row rule,
 * then a table rule, then two more `border-t` dividers inside one editor. Five nested levels of
 * the same 3.41:1 grey is what reads as *wireframe* — the elevation fills are only ~1.1:1 apart
 * (`27-F66` says so outright), so with rules everywhere there is nothing left to say "object".
 *
 * The rule now: **the card boundary and the header rule are the two borders a card gets.**
 * Everything inside is separated by ground and space, which is `27-F58`'s instinct — *"groups are
 * separated by blank lines, not rules"* — applied to glass.
 */
export const Card = ({ className, ...props }: ComponentProps<"section">): ReactNode => (
  <section
    className={cn("rounded-lg border border-border bg-card text-card-foreground", className)}
    {...props}
  />
);

export const CardHeader = ({ className, ...props }: ComponentProps<"header">): ReactNode => (
  <header
    className={cn("flex flex-col gap-1.5 border-b border-border px-5 py-4", className)}
    {...props}
  />
);

/**
 * **A card title is a PANEL LABEL, not a headline** — and that is the second of the direction
 * document's four moves ("invert label and value") applied at the container level.
 *
 * It used to be `text-base font-semibold`: 16 px at weight 600, the same weight as the entry names
 * and heavier than the prices underneath. So the word *Menu* competed with the menu. A panel label
 * names the instrument's region and then gets out of the way, which is why this is small, spaced
 * and uppercase — the register of a switch panel, not of an article.
 *
 * **Uppercase is a CSS transform, never the string.** `shell.dom.test.tsx` finds this by
 * `getByRole("heading", { name: "Sign in" })`, and `text-transform` leaves the accessible name
 * alone; uppercasing the literal would have broken that and, worse, would uppercase any user
 * content a caller passed. `27-F42`: `text-label` is taken whole — no weight override — because a
 * 14 px/600 pairing is one the manifest does not define.
 */
export const CardTitle = ({ className, ...props }: ComponentProps<"h2">): ReactNode => (
  <h2 className={cn("text-label uppercase tracking-wider text-foreground", className)} {...props} />
);

export const CardBody = ({ className, ...props }: ComponentProps<"div">): ReactNode => (
  <div className={cn("flex flex-col gap-5 p-5", className)} {...props} />
);

/**
 * The caption register: the smallest text on these screens, for metadata that must be available
 * and must not compete.
 *
 * ⚠ **This is the gap `theme-css.ts` names.** `packages/ui`'s typography set has four composites
 * and the smallest is `text-label` at 14 px, which is a form-field label rather than a caption. A
 * dense admin surface needs a step below it, so this is Tailwind's `text-xs` — a different
 * system's primitive, which is what `27-F42` exists to stop. It is centralised here rather than
 * retyped on forty elements so that the day `packages/ui` gains a caption composite there is one
 * line to change. **A finding for the token owner, not a local fifth size.**
 */
export const Caption = ({ className, ...props }: ComponentProps<"p">): ReactNode => (
  <p className={cn("text-xs leading-relaxed text-muted-foreground", className)} {...props} />
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
  <section className="mx-auto flex w-full max-w-xl flex-col gap-6 rounded-lg border border-border-strong bg-card p-6 sm:p-8">
    <div className="flex items-start gap-4">
      <AlertTriangle aria-hidden="true" className="mt-1 size-6 shrink-0 text-warning-fg" />
      <div className="flex flex-col gap-3">
        {/* The headline is the one thing an owner reads before deciding whether to wait or to
            call someone, so it is set at content scale and the two paragraphs recede under it. */}
        <h2 className="text-xl font-semibold leading-tight tracking-tight">{heading}</h2>
        <p className="text-body text-muted-foreground">{body}</p>
        {action === undefined ? null : <p className="text-body text-muted-foreground">{action}</p>}
      </div>
    </div>
    {children === undefined ? null : (
      <div className="flex flex-wrap gap-3 sm:pl-10">{children}</div>
    )}
    {detail === undefined || detail === "" ? null : (
      <details className="rounded-md bg-muted p-3">
        <summary className="cursor-pointer text-xs uppercase tracking-wider text-muted-foreground">
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
 *
 * **The two coloured tones now carry a GLYPH as well as a fill (`27-F12`)** — *"colour never
 * carries state alone; every status is colour + shape + position"*. They did not: a fault and an
 * abnormal note were the same rectangle in two hues, which is precisely the single-channel
 * encoding `27-F17` assumes one in twenty male staff cannot resolve. The fill still carries the
 * state (`27-F15`) and the glyph is the second channel, not a replacement for it.
 *
 * The text is wrapped in a `<span>` so the glyph can sit beside it. That is deliberate and safe
 * for the suites: testing-library matches on a node's DIRECT text children, so the `<span>` is the
 * single match and the `<p>` is not — one hit, exactly as before the glyph existed.
 */
export const Note = ({
  tone = "neutral",
  className,
  children,
  ...props
}: ComponentProps<"p"> & { tone?: "neutral" | "fault" | "abnormal" }): ReactNode => (
  <p
    className={cn(
      "flex items-start gap-2.5 rounded-md px-3.5 py-2.5 text-label",
      tone === "neutral" && "bg-muted text-muted-foreground",
      tone === "fault" && "bg-destructive text-destructive-foreground",
      tone === "abnormal" && "bg-warning text-warning-foreground",
      className,
    )}
    {...props}
  >
    {tone === "neutral" ? null : (
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
    )}
    <span>{children}</span>
  </p>
);
