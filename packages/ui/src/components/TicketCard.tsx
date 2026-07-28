import { useColor } from "../theme";
import { space, targetFor, typography } from "../tokens/index";
import { AgeBadge } from "./AgeBadge";
import { QuantityItemLine, type QuantityItemLineProps } from "./QuantityItemLine";

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
  lines: readonly (QuantityItemLineProps & { id: string })[];
  /** 03-F3 — a reprint is marked on the paper AND here; it is a named fraud vector. */
  reprint?: boolean | undefined;
  onBump: () => void;
};

export const TicketCard = ({
  reference,
  minutes,
  amberAt,
  redAt,
  lines,
  reprint = false,
  onBump,
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

      <button
        type="button"
        onClick={onBump}
        style={{
          // 27-F8 kitchen row: 96 dp, above the standing-counter minimum, because this is the
          // surface where the 21.34% wet-hand error was measured and it is read at 1–2 m.
          minHeight: targetFor("kitchen"),
          fontFamily: label.fontFamily,
          fontSize: label.fontSize,
          fontWeight: 700,
          background: color["bgColor-interactive"],
          color: color["fgColor-on-interactive"],
          // 27-F64 — the OUTLINE carries SC 1.4.11. This was `border: "none"` while the fill had
          // been relieved of the 3:1 requirement on the outline's account, which measured
          // 2.35:1 against the card ON DARK — and dark is the KDS polarity (27-F19), so the
          // primary control of the kitchen screen had no perceivable boundary on the surface it
          // actually ships to.
          border: `1px solid ${color["outlineColor-interactive"]}`,
          borderRadius: space["space-2"],
          cursor: "pointer",
        }}
      >
        DONE
      </button>
    </article>
  );
};
