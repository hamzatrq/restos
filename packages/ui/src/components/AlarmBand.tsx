import { useColor } from "../theme";
import { space, targetFor, typography } from "../tokens/index";

/**
 * 27-F11d — an S1 alarm takes a BAND, never the screen.
 *
 * The founder ruling and its reasoning: `01-F17` says a sale is never blocked, and an alarm
 * that interrupts a transaction teaches staff to fear the screen, which is how workarounds
 * start. A half-built cart is never taken away from a cashier with a customer waiting.
 *
 * Two things this component enforces structurally, because both were unbounded in the spec
 * until the screen map closed them:
 *
 * 1. **One at a time, with a count.** Six distinct S1 causes on one counter screen at 20:40
 *    would otherwise become six bands — and a band that fills the screen HAS become the
 *    screen, which is precisely what 27-F11d forbids. The oldest unacknowledged shows; the
 *    rest are a number.
 * 2. **Acknowledgement is attributed and cannot be a stray tap.** `03-F5` requires the alert
 *    repeat until acknowledged; the ack target is a full 126 dp keypad-posture control,
 *    because dismissing "food is not being cooked" is a high-consequence act, not a chip.
 *
 * Deferring the alarm to a "safe moment" is rejected: food is not being cooked, so the delay
 * IS the harm. Escalation to the manager console at 60 s is unchanged (21 §5).
 */
export type Alarm = {
  id: string;
  /** What is wrong, in the operator's words — not an error code. */
  message: string;
  /** Who or what it concerns: printer name, order number, drawer. */
  subject: string;
  /**
   * `03-F6` — "**from the failure alert**, the operator can resend the failed job".
   *
   * The RECOVERY, beside the dismissal. Until August 2026 the only control on this band was
   * `I SAW THIS`, so a cashier whose kitchen ticket had exhausted `03-F4`'s budget could
   * acknowledge that the food was not being cooked and could do nothing about it.
   *
   * **Data, not a flag**, and the label is written in MAIN for `AlarmSchema`'s stated reason:
   * the operator-facing wording never crosses to the untrusted side of `18 §9`'s bridge. Absent
   * means this band has no recovery — a cash slip or a receipt today — and the band then renders
   * exactly as it did before, which is what keeps every existing surface unchanged.
   */
  action?: { label: string } | undefined;
};

export type AlarmBandProps = {
  /** Oldest first. Only the head renders; the tail becomes a count (27-F11d, gap G13). */
  alarms: readonly Alarm[];
  onAcknowledge: (id: string) => void;
  /**
   * `03-F6`'s resend. Called with the head's id; rendered only when the head CARRIES an action
   * and a handler was supplied, so a host that has not wired it shows no dead control (`27-F5`).
   */
  onAction?: ((id: string) => void) | undefined;
};

export const AlarmBand = ({ alarms, onAcknowledge, onAction }: AlarmBandProps) => {
  const color = useColor();
  const head = alarms[0];
  if (!head) return null;

  const t = typography["text-numeric-primary"];
  const label = typography["text-label"];
  const others = alarms.length - 1;

  return (
    <div
      // 27-F11g: where paper is the only kitchen channel there is no screen fallback — a
      // failed KOT means food is genuinely not being cooked and nobody knows. This band is
      // the ONLY signal, which is why it is loud, persistent, and un-dismissable without an
      // attributed acknowledgement.
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        gap: space["space-4"],
        padding: space["space-3"],
        width: "100%",
        // 27-F15: the fill carries it. Fault is the darkest rung of the ladder.
        background: color["bgColor-status-fault"],
        // 27-F64 — the fill is relieved of SC 1.4.11 only because an OUTLINE carries it.
        border: `1px solid ${color["outlineColor-status-fault"]}`,
        color: color["fgColor-on-status-fault"],
      }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: space["space-1"] }}>
        <span
          style={{
            fontFamily: t.fontFamily,
            fontSize: t.fontSize,
            fontWeight: t.fontWeight,
          }}
        >
          {head.message}
        </span>
        <span style={{ fontFamily: label.fontFamily, fontSize: label.fontSize }}>
          {head.subject}
          {others > 0 ? ` · and ${others} more` : ""}
        </span>
      </div>

      {head.action !== undefined && onAction !== undefined ? (
        <button
          type="button"
          onClick={() => onAction(head.id)}
          style={{
            // The SAME target as the acknowledgement beside it: `03-F6`'s resend is at least as
            // consequential as dismissing the band, and two adjacent controls at different sizes
            // on one band is how a wet hand hits the wrong one (`27-F8`/`27-F9`).
            minWidth: targetFor("keypad"),
            minHeight: targetFor("counter"),
            padding: space["space-3"],
            fontFamily: label.fontFamily,
            fontSize: label.fontSize,
            fontWeight: 600,
            // OUTLINED where the acknowledgement is filled, so the two are told apart by shape
            // and not only by their words. No new colour pair: the outline and the text are the
            // band's own on-colour, which `nontext-contrast.oracle.test.ts` already measures
            // against `bgColor-status-fault`.
            background: "transparent",
            color: color["fgColor-on-status-fault"],
            border: `2px solid ${color["fgColor-on-status-fault"]}`,
            borderRadius: space["space-2"],
            cursor: "pointer",
          }}
        >
          {head.action.label}
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => onAcknowledge(head.id)}
        style={{
          // Keypad WIDTH, counter HEIGHT. Stated precisely because the first draft of this
          // comment claimed "keypad posture" while the code only met it on one axis —
          // dismissing "food is not being cooked" is high-consequence, so the target is
          // deliberately far above the 48 dp floor a wet hand hits by accident (27-F8/F9),
          // but it is a wide banner control and a 126 dp tall button would crowd the band
          // into the screen, which 27-F11d forbids.
          minWidth: targetFor("keypad"),
          minHeight: targetFor("counter"),
          padding: space["space-3"],
          fontFamily: label.fontFamily,
          fontSize: label.fontSize,
          fontWeight: 600,
          background: color["fgColor-on-status-fault"],
          color: color["fgColor-status-fault"],
          border: "none",
          borderRadius: space["space-2"],
          cursor: "pointer",
        }}
      >
        I SAW THIS
      </button>
    </div>
  );
};
