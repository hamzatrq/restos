import type { ReactNode } from "react";
import { color, type Posture, space, targetFor, typography } from "../tokens/index";

/**
 * 27-F8 — touch minimums are POSTURE-typed. There is deliberately no `size` prop: the
 * posture is the design decision and the number is an implementation detail that moves when
 * the evidence does. A component that accepts an arbitrary size is not a closed vocabulary.
 *
 * The kitchen posture sits above the standing-counter one on purpose — it is the surface
 * where 27-F9's 21.34% wet-hand gesture error was measured (against 0.00% dry), and the
 * operator is also reading at 1–2 m.
 */
export type TileProps = {
  posture: Posture;
  label: string;
  children?: ReactNode | undefined;
  onPress?: (() => void) | undefined;
  /**
   * 27-F4 — a conditional surface is DISABLED IN PLACE, never absent. A tile that vanishes
   * when unavailable destroys the positional memory of every operator who learned the grid
   * with it there, and adding/removing/reordering a grid item is a breaking change.
   */
  unavailable?: boolean | undefined;
  /** Why it is unavailable. Shown, because an unexplained dead tile reads as a broken app. */
  unavailableReason?: string | undefined;
  /**
   * 27-F9 — destructive actions are never adjacent to high-frequency ones on any surface a
   * wet hand touches. Marking a tile destructive is what lets a layout test assert that.
   */
  destructive?: boolean | undefined;
};

export const Tile = ({
  posture,
  label,
  children,
  onPress,
  unavailable = false,
  unavailableReason,
  destructive = false,
}: TileProps) => {
  const min = targetFor(posture);
  const t = typography["text-label"];
  return (
    <button
      type="button"
      disabled={unavailable}
      onClick={onPress}
      aria-label={unavailable && unavailableReason ? `${label} — ${unavailableReason}` : label}
      style={{
        minWidth: min,
        minHeight: min,
        margin: space["space-1"],
        padding: space["space-2"],
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: space["space-1"],
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        fontWeight: t.fontWeight,
        borderRadius: space["space-2"],
        cursor: unavailable ? "not-allowed" : "pointer",
        // 27-F13: design achromatically first. The resting tile carries NO status colour —
        // colour is reserved for exceptions, so spending it on the base case would blunt it.
        background: destructive ? color["bgColor-status-fault"] : color["bgColor-surface-raised"],
        color: destructive ? color["fgColor-on-status-fault"] : color["fgColor-default"],
        border: `1px solid ${color["borderColor-default"]}`,
        opacity: unavailable ? 0.45 : 1,
      }}
    >
      <span>{label}</span>
      {children}
      {unavailable && unavailableReason ? (
        <span style={{ color: color["fgColor-muted"] }}>{unavailableReason}</span>
      ) : null}
    </button>
  );
};
