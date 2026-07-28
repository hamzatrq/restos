import { useColor } from "../theme";
import { type ColorName, space, typography } from "../tokens/index";

/**
 * 03-F47 / 21 §5 — ticket age as a status, driven by FIXED CONFIGURED MINUTES.
 *
 * Not expected-prep: that is an ETA-derived quantity that only exists once `03-F27/F28`'s
 * confidence gate passes, and `03 §3` forbids the kitchen from displaying ETAs at all. A
 * colour driven by a model that may never become confident is a colour that lies about how
 * late the food is.
 *
 * 27-F12 is the structural law here and it is why this component takes no bare colour:
 * **every status is colour + shape + position + a number.** Red/green remains the classic
 * dichromatic confusion and no palette fixes it — 1 in 20 male staff is deutan and ~80% do
 * not know it (27-F17) — so the minutes are always rendered, and the shape always changes.
 */
export type AgeBadgeProps = {
  minutes: number;
  /** Layer-2 config, per order type. Defaults: dine-in 10/20, delivery 15/25 (03-F14). */
  amberAt: number;
  redAt: number;
};

type Level = "normal" | "abnormal" | "fault";

export const ageLevel = (minutes: number, amberAt: number, redAt: number): Level =>
  minutes >= redAt ? "fault" : minutes >= amberAt ? "abnormal" : "normal";

// The SHAPE channel of 27-F12 — carried independently of hue, so it survives greyscale
// (27-F13) and every dichromacy. Square → rounded is a real silhouette change at 1–2 m,
// where a thin stroke or a small dot contributes almost nothing to the priority map.
const RADIUS: Record<Level, number> = { normal: 999, abnormal: 4, fault: 0 };

const FILL: Record<Level, ColorName> = {
  normal: "bgColor-surface-sunken",
  abnormal: "bgColor-status-abnormal",
  fault: "bgColor-status-fault",
};
// 27-F64: the outline carries SC 1.4.11's 3:1 so the fill's luminance is free for
// dichromacy separation. It derives from its own fill and never encodes meaning.
const OUTLINE: Record<Level, ColorName> = {
  normal: "borderColor-default",
  abnormal: "outlineColor-status-abnormal",
  fault: "outlineColor-status-fault",
};
const ON: Record<Level, ColorName> = {
  normal: "fgColor-default",
  abnormal: "fgColor-on-status-abnormal",
  fault: "fgColor-on-status-fault",
};

export const AgeBadge = ({ minutes, amberAt, redAt }: AgeBadgeProps) => {
  const color = useColor();
  const level = ageLevel(minutes, amberAt, redAt);
  const t = typography["text-numeric-primary"];
  return (
    <span
      // 27-F12: the state is never conveyed by colour alone — it is also in the text, and
      // announced, so the badge degrades to a sentence rather than to nothing.
      role="status"
      aria-label={`${minutes} minutes, ${level === "fault" ? "overdue" : level === "abnormal" ? "due soon" : "on time"}`}
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: space["space-1"],
        padding: `${space["space-1"]}px ${space["space-3"]}px`,
        // 27-F15: the FILL carries the ladder — never a dot, badge outline or thin rule.
        // 27-F64: the outline carries only the BOUNDARY (SC 1.4.11), never the meaning.
        background: color[FILL[level]],
        border: `1px solid ${color[OUTLINE[level]]}`,
        color: color[ON[level]],
        borderRadius: RADIUS[level],
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        fontWeight: t.fontWeight,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {/* 27-F25: the number is the operational payload and the largest element here. */}
      <strong>{minutes}</strong>
      <span style={{ fontSize: typography["text-label"].fontSize }}>min</span>
    </span>
  );
};
