import type { ReactNode } from "react";
import { useColor } from "../theme";
import { type Posture, space, targetFor, typography } from "../tokens/index";

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
  const color = useColor();
  const min = targetFor(posture);
  /**
   * `27-F25` — "Numbers are the operational payload and the largest element in their region."
   *
   * The `keypad` posture IS numeric entry: `27-F8` defines that row as "cash / numeric keypad —
   * standing, high-consequence entry", and the only things composed from it are the two PIN pads
   * (`App.tsx`, `ManagerApproval.tsx`). Found by looking, August 2026: those pads rendered their
   * digits at `text-label` — **14 px inside a 126 dp box** — while `NumericKeypad`, the money pad
   * two screens away, renders the same digits at `text-numeric-primary`. Two keypads that differ
   * only in glyph size teach two different habits on one device, and the smaller one was the
   * credential surface an operator hits 20–60x a shift (`01-F61`).
   *
   * Every other posture keeps `text-label`: a menu tile's payload is a NAME, and `27-F16`'s
   * argument applies to size as well as colour — emphasising the base case emphasises nothing.
   */
  const t = typography[posture === "keypad" ? "text-numeric-primary" : "text-label"];
  return (
    <button
      type="button"
      /**
       * **NOT `disabled`.** `01-F59` is explicit: *"Availability is not an `01-F17` block …
       * the counter may still sell it deliberately — `02-F31` owns the oversell path."*
       * `02-F7` asks only that an 86'd item "grey out", and `02-F40`'s founder ruling names
       * `02-F31`'s oversell handling as what absorbs the printer-only kitchen's walk-to-the-
       * counter delay — which requires the counter to be ABLE to sell it.
       *
       * A `disabled` button removed that path entirely, so the platform withheld a sale on
       * availability state, which is the one thing `01-F17` says it must never do. The tile is
       * greyed and carries its reason (`27-F4` — disabled IN PLACE, with the reason, because
       * the reason is what makes disabling-in-place useful); the decision stays with the
       * operator.
       */
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
        // `pointer` even when unavailable, because it IS allowed (01-F59). `not-allowed` was
        // the same claim the `disabled` attribute made, in a second place.
        cursor: "pointer",
        // 27-F13: design achromatically first. The resting tile carries NO status colour —
        // colour is reserved for exceptions, so spending it on the base case would blunt it.
        background: unavailable
          ? color["bgColor-surface-sunken"]
          : destructive
            ? color["bgColor-status-fault"]
            : color["bgColor-surface-raised"],
        color: unavailable
          ? color["fgColor-disabled"]
          : destructive
            ? color["fgColor-on-status-fault"]
            : color["fgColor-default"],
        // NO opacity. A 0.45 wash puts the reason text at 1.89:1 — far under AA — which
        // defeats 27-F4's entire purpose: the tile is disabled IN PLACE so the operator can
        // read WHY. "Disabled" is carried by the sunken fill (27-F15: the fill carries it),
        // and the reason stays fully legible at 5.22:1.
        // 27-F64 — a STATUS fill takes its own outline; a neutral fill takes the neutral one
        // (27-F66). A destructive tile was rendering `borderColor-default` over a fault fill,
        // which is the boundary for the surface it is NOT on.
        border: `1px solid ${color[destructive ? "outlineColor-status-fault" : "borderColor-default"]}`,
      }}
    >
      <span>{label}</span>
      {children}
      {unavailable && unavailableReason ? (
        // The reason is a QUALIFIER on the label, never a competitor to it: pinned to
        // `text-label` rather than inherited, so it cannot ride the posture's own type step
        // (27-F25 makes a keypad tile's label numeric-sized, and a 28 px reason under a 28 px
        // label is two headlines and no hierarchy).
        <span
          style={{
            fontFamily: typography["text-label"].fontFamily,
            fontSize: typography["text-label"].fontSize,
            color: color["fgColor-disabled"],
            fontWeight: 600,
          }}
        >
          {unavailableReason}
        </span>
      ) : null}
    </button>
  );
};
