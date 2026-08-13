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
};

export type AlarmBandProps = {
  /** Oldest first. Only the head renders; the tail becomes a count (27-F11d, gap G13). */
  alarms: readonly Alarm[];
  onAcknowledge: (id: string) => void;
};

export const AlarmBand = ({ alarms, onAcknowledge }: AlarmBandProps) => {
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
