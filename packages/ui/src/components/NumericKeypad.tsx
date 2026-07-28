import { useColor } from "../theme";
import { space, targetFor, typography } from "../tokens/index";

/**
 * `27-F8` — numeric entry is the **126 dp (20 mm)** kiosk condition, the largest target in
 * the system, because it is standing high-consequence entry. `27-F29` — impossible numbers
 * are validated and **blocked at entry**, which roughly halves out-by-10 errors, and numeric
 * entry is where this population's errors concentrate.
 *
 * Blocking at entry rather than warning afterwards is the whole design. A warning asks the
 * operator to notice, re-read and compare — three literacy-dependent acts, at the moment she
 * is under the most time pressure, with a customer waiting. Refusing the impossible keystroke
 * asks nothing.
 *
 * There is no decimal key. `27-F23` puts no decimals on operational screens, and the decimal
 * point is the highest-consequence keystroke there is: no sub-rupee unit circulates in
 * Pakistan, so the key can only ever be a mistake.
 */
export type NumericKeypadProps = {
  /** Current entry in **rupees**, as digits typed so far. Empty string is a valid state. */
  value: string;
  onChange: (next: string) => void;
  /**
   * The largest value that is possible here — a drawer float, a tender, a count. Keystrokes
   * that would exceed it are REFUSED, not accepted-then-flagged (27-F29).
   */
  max: number;
  /** Digits allowed before the entry is impossible regardless of `max`. */
  maxDigits?: number;
};

/** Exported so the blocking rule is testable without a DOM. */
export const acceptKeystroke = (
  current: string,
  key: string,
  max: number,
  maxDigits: number,
): string | null => {
  if (key === "clear") return "";
  if (key === "back") return current.slice(0, -1);
  const next = current === "0" ? key : current + key;
  if (next.length > maxDigits) return null;
  if (Number(next) > max) return null;
  return next;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

export const NumericKeypad = ({ value, onChange, max, maxDigits = 7 }: NumericKeypadProps) => {
  const color = useColor();
  const t = typography["text-numeric-primary"];
  const size = targetFor("keypad");
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(3, ${size}px)`,
        gap: space["space-2"],
      }}
    >
      {KEYS.map((key) => {
        // A key that cannot legally be pressed is DISABLED IN PLACE (27-F4) — never hidden,
        // never relocated. The keypad is the most position-dependent surface in the product;
        // a "7" that moves is a mis-entry waiting to happen.
        const wouldBe = acceptKeystroke(value, key, max, maxDigits);
        const blocked = wouldBe === null;
        return (
          <button
            key={key}
            type="button"
            disabled={blocked}
            aria-label={key === "back" ? "delete" : key === "clear" ? "clear" : key}
            onClick={() => {
              if (wouldBe !== null) onChange(wouldBe);
            }}
            style={{
              width: size,
              height: size,
              fontFamily: t.fontFamily,
              fontSize: t.fontSize,
              fontWeight: t.fontWeight,
              fontVariantNumeric: "tabular-nums",
              background: blocked
                ? color["bgColor-surface-sunken"]
                : color["bgColor-surface-raised"],
              // A blocked key stays READABLE — the operator must be able to see that the 9
              // is still a 9 and simply refused, not that the keypad has gone blank. An
              // opacity wash measured 2.12:1 and made the digit ambiguous, which is a worse
              // failure than the mis-entry the block exists to prevent.
              color: blocked ? color["fgColor-disabled"] : color["fgColor-default"],
              // 27-F66 — blocked is a STATE, and the sunken/raised fill step that used to
              // carry it is 1.15:1. The border is the independent mark: `-strong` against
              // the blocked key's own fill measures 5.67:1 light / 5.84:1 dark, and the two
              // states now differ by TOKEN rather than by a luminance step nobody can see.
              // The digit deliberately stays readable — see the note above.
              border: `1px solid ${color[blocked ? "borderColor-strong" : "borderColor-default"]}`,
              borderRadius: space["space-2"],
              cursor: blocked ? "not-allowed" : "pointer",
            }}
          >
            {key === "back" ? "⌫" : key === "clear" ? "C" : key}
          </button>
        );
      })}
    </div>
  );
};
