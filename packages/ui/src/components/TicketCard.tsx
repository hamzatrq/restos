import { useColor } from "../theme";
import { space, targetFor, typography } from "../tokens/index";
import { AgeBadge } from "./AgeBadge";
import { QuantityItemLine, type QuantityItemLineProps } from "./QuantityItemLine";
import { Tile } from "./Tile";

/**
 * One kitchen ticket, on the 22″ pass panel (`27-F11f`).
 *
 * **First, the thing that keeps this honest: for most deployments this screen does not
 * exist.** `27-F11e` makes paper the primary kitchen interface and the pass screen optional.
 * The printed KOT (`03-F30..F45`, `27 §2b`) matters more, and this component is deliberately
 * built from the same `QuantityItemLine` the ticket renderer consumes — so the cook sees the
 * same arrangement on glass as on paper, rather than learning two layouts.
 *
 * Reading order is fixed and never configurable (`27-F58`): **identifier → timing → items →
 * modifiers → notes**. A cook who reads nothing must still be able to point at the top line
 * and be understood by someone who can.
 *
 * Absent on purpose, and this is the strongest anti-scope statement in the corpus
 * (`03-F23`): no priority marker, no "cook this next", no reordering. **Sequencing is
 * visibility only. The chef decides.** Also absent: prices (`03-F32` — the KOT data model
 * has no money field at all) and ETAs (`03 §3`).
 */
export type TicketCardProps = {
  /** The identifier the kitchen shouts across the pass. Largest element (27-F25). */
  reference: string;
  minutes: number;
  amberAt: number;
  redAt: number;
  /**
   * `03-F13`'s **channel badge** — *"all channels, channel-tagged"*.
   *
   * It is on the card because a kitchen works a dine-in ticket and a foodpanda ticket
   * differently, and because the aging thresholds behind `amberAt`/`redAt` are per order type
   * (`03-F14`): a cook who cannot see the channel cannot tell why one ticket goes amber sooner.
   * A WORD and not a colour — `27-F14`'s budget has three status slots and none of them is a
   * channel, and `27-F12` is why a word beats a hue at 1–2 m anyway.
   */
  channel?: string | undefined;
  /** `03-F13`'s table. Absent for every channel that has none; never invented (`00 §5.7`). */
  tables?: readonly string[] | undefined;
  /**
   * `03-F15` — *"2 of 3 items ready, waiting on naan"*, as the two numbers that sentence needs.
   *
   * Counted by the caller from the same projection the lines come from, so the roll-up and the
   * rows can never disagree.
   */
  assembly?: { done: number; total: number } | undefined;
  lines: readonly (QuantityItemLineProps & { id: string })[];
  /** 03-F3 — a reprint is marked on the paper AND here; it is a named fraud vector. */
  reprint?: boolean | undefined;
  /**
   * `03-F16`/`03-F24` — the bump, or `null` where this surface does not own the ready signal.
   *
   * `null` renders **no control at all** rather than a disabled one, and that is `27-F5`: an
   * inert primary target is a context-dependent control wearing a different name, and a cook who
   * presses a grey DONE twice and gets nothing learns to distrust the screen. `03-F24`'s own
   * words are that a surface without the assignment *"renders read-only"* — read-only is the
   * absence of the control, not a greyed copy of it.
   */
  onBump: (() => void) | null;
  /**
   * `03-F52` — the HANDOVER, and it is a **second control** rather than a mode on the bump.
   *
   * > 03-F52 **The act is separate from the ready-mark, and that separation is the FR.** One press
   * > of DONE emits `ready` and only `ready` … because the moment the food reaches the pass is the
   * > moment the pass person's remaining job BEGINS — assemble, call, hand over.
   *
   * `null` (or absent) renders **no control at all**, for the same `27-F5` reason `onBump` gives:
   * a surface without the assignment is read-only for `served`, and read-only is the absence of
   * the control rather than a greyed copy of it. It is OPTIONAL where `onBump` is required only so
   * that the counter's own ticket renders — `AppShell`'s stories and the KOT preview have no
   * handover to offer — and every real caller passes it explicitly.
   *
   * **The confirm is NOT here.** `03-F52` requires the press to carry one naming the order
   * reference, and that belongs to the surface holding the queue: a confirm inside a card would
   * have to fit a cell whose height `27-F28` costs in tickets. `apps/pass-kds`'s `PassSurface`
   * owns it.
   */
  onHandOver?: (() => void) | null | undefined;
};

export const TicketCard = ({
  reference,
  minutes,
  amberAt,
  redAt,
  channel,
  tables = [],
  assembly,
  lines,
  reprint = false,
  onBump,
  onHandOver = null,
}: TicketCardProps) => {
  const color = useColor();
  const hero = typography["text-numeric-hero"];
  const label = typography["text-label"];
  return (
    <article
      style={{
        display: "flex",
        flexDirection: "column",
        gap: space["space-3"],
        padding: space["space-4"],
        background: color["bgColor-surface-raised"],
        border: `1px solid ${color["borderColor-default"]}`,
        borderRadius: space["space-2"],
        minWidth: 320,
      }}
    >
      {/* identifier → timing (27-F58), on one row so the eye lands on both in one fixation */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontFamily: hero.fontFamily,
            fontSize: hero.fontSize,
            fontWeight: hero.fontWeight,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {reference}
        </span>
        <AgeBadge minutes={minutes} amberAt={amberAt} redAt={redAt} />
      </header>

      {/*
        `03-F13`'s remaining card contents — channel, table, assembly count — on one row under the
        identifier, because `27-F58` fixes the reading order as **identifier → timing → items** and
        these are none of those three. They are context for the ticket rather than the work in it,
        so they sit between the header and the items and take one line of the budget `27-F28`
        costs a ticket at.

        Rendered only when there is something to say (`27-F16`'s argument one domain over): a
        permanent empty `Table —` chip on every takeaway ticket spends a line of a panel whose
        whole capacity is measured in lines.
      */}
      {channel !== undefined || tables.length > 0 || assembly !== undefined ? (
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: space["space-3"],
            fontFamily: label.fontFamily,
            fontSize: label.fontSize,
            color: color["fgColor-muted"],
            letterSpacing: "0.06em",
          }}
        >
          {channel === undefined ? null : <span>{channel.toUpperCase()}</span>}
          {tables.length === 0 ? null : <span>TABLE {tables.join(" + ")}</span>}
          {assembly === undefined ? null : (
            // `27-F24` — the system computes and staff read. "2 of 3" is a finished sentence; a
            // cook is never asked to count the ready rows themselves.
            <span>
              {assembly.done} OF {assembly.total} READY
            </span>
          )}
        </div>
      ) : null}

      {reprint ? (
        <span
          style={{
            alignSelf: "flex-start",
            padding: `${space["space-1"]}px ${space["space-2"]}px`,
            background: color["bgColor-status-fault"],
            // 27-F64 — the fill is relieved of SC 1.4.11 only because an OUTLINE carries it.
            border: `1px solid ${color["outlineColor-status-fault"]}`,
            color: color["fgColor-on-status-fault"],
            fontFamily: label.fontFamily,
            fontWeight: 700,
          }}
        >
          REPRINT
        </span>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: space["space-3"] }}>
        {lines.map(({ id, ...line }) => (
          <QuantityItemLine key={id} {...line} />
        ))}
      </div>

      {onBump === null && onHandOver === null ? null : (
        <div
          style={{
            /*
              **The controls sit at the BOTTOM of the card, and that is `27-F4` rather than
              styling.**

              Found by looking (August 2026, the pass screen's first grid screenshot): tickets in a
              grid are all the height of the tallest one, so with the control following the items a
              one-line ticket put DONE near the top of its cell and a four-line ticket put it
              two-thirds down — **the same control in a different place on every card in the same
              glance**. `27-F4` protects an operator's positional memory, `27-F9` is about a wet
              hand landing where it aimed, and a kitchen at 1–2 m is where both bite hardest.

              `marginTop: auto` pins the row to the bottom of the flex column, so the controls are
              on the same line across the whole page whatever the tickets hold.

              ## ⚠ `27-F9` IS WHY THIS IS `space-between` AND NOT TWO STRETCHED BUTTONS

              > 27-F9 **Destructive actions are never adjacent to high-frequency ones on any
              > surface a wet hand touches.** … This is a hard rule, not a preference.

              DONE is the highest-frequency control on this surface and `03-F52` calls the handover
              *"the one control in the kitchen whose mis-tap cannot be taken back"* — `served` is
              terminal under `01-F35` and `03-F17`'s recall strip restores VISIBILITY, never STATE.
              So they are pinned to **opposite ends of the card**: on `27-F11f`'s 22" panel that is
              ~100 mm of separation, and on the smallest shipping panel still ~60 mm.

              **DONE therefore stops being full-width, and that is the trade stated rather than
              slipped in.** It was a stretched block before this FR; it is now its `27-F8` target
              at the left, where it has always been. The alternative — DONE stretched with the
              handover butted against its right edge — buys back the width and puts an
              irreversible target one wet finger from the one a cook presses forty times a service.
            */
            marginTop: "auto",
            display: "flex",
            alignItems: "stretch",
            justifyContent: "space-between",
            gap: space["space-3"],
          }}
        >
          {onBump === null ? (
            // A spacer, so the handover keeps its END of the card when the bump is retired.
            // `27-F4` is about position surviving a state change: a control that slides to the
            // left the moment a ticket goes fully ready is a control in two places.
            <span aria-hidden="true" />
          ) : (
            <button
              type="button"
              onClick={onBump}
              style={{
                // 27-F8 kitchen row: 96 dp, above the standing-counter minimum, because this is
                // the surface where the 21.34% wet-hand error was measured and it is read at
                // 1–2 m.
                minHeight: targetFor("kitchen"),
                minWidth: targetFor("kitchen"),
                paddingInline: space["space-4"],
                fontFamily: label.fontFamily,
                fontSize: label.fontSize,
                fontWeight: 700,
                background: color["bgColor-interactive"],
                color: color["fgColor-on-interactive"],
                // 27-F64 — the OUTLINE carries SC 1.4.11. This was `border: "none"` while the fill
                // had been relieved of the 3:1 requirement on the outline's account, which
                // measured 2.35:1 against the card ON DARK — and dark is the KDS polarity
                // (27-F19), so the primary control of the kitchen screen had no perceivable
                // boundary on the surface it actually ships to.
                border: `1px solid ${color["outlineColor-interactive"]}`,
                borderRadius: space["space-2"],
                cursor: "pointer",
              }}
            >
              DONE
            </button>
          )}
          {onHandOver === null || onHandOver === undefined ? null : (
            /*
              `03-F52`'s second act, drawn as the vocabulary's own resting control rather than a
              second primary fill.

              `27-F16`'s argument applies to weight as well as colour — two `bgColor-interactive`
              blocks on one card emphasise neither — and `27-F13` reserves colour for exceptions.
              The handover is not the exception a colour marks; it is the act a **confirm** guards
              (`03-F52`), and `27-F12` puts the difference in the WORD, which is what a cook reads
              at 1–2 m anyway. Using `Tile` also means this composes no colour pairing that
              `nontext-contrast.oracle.test.ts` has not already measured.
            */
            <Tile posture="kitchen" label="HAND OVER" onPress={onHandOver} />
          )}
        </div>
      )}
    </article>
  );
};
