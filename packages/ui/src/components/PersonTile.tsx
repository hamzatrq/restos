import { type SurfaceMode, useSurfaceMode } from "../surface-mode";
import { useColor } from "../theme";
import { space, targetFor, typography } from "../tokens/index";

/**
 * # A person, as a target — `01-F61`'s identification step
 *
 * **Why this is a component and not `Tile` with a longer label.** `01-F61` puts an identification
 * step in front of every PIN, and it is load-bearing rather than ceremonial: a bare pad matched
 * against every hash on the device leaves a failed attempt belonging to no user, so the
 * per-(device, user) lockout counter cannot be keyed, and two staff sharing a 4-digit PIN — the
 * ordinary case at ~13 bits, which that FR names — become permanently indistinguishable in a
 * ledger `01-F1` forbids correcting in place. So "which human is this" is a first-class act in
 * this product, performed 20–60× a shift, and it had no vocabulary item: the unlock gate drew it
 * as three `posture="counter"` tiles, which is a **12 mm** box carrying a name at 14 dp.
 *
 * A founder looked at the result and asked *"why a colour-less screen with just 3 names?"*. The
 * greyscale was never the problem — `27-F13` requires designing achromatically and `27-F16`
 * reserves colour for the abnormal, and both are right. The problem is that a 12 mm box is the
 * *touch minimum* for a menu tile and was being spent as the *design* for the one surface that
 * gates every other. `27-F8`'s numbers are a floor, and a floor is not a layout.
 *
 * ## What it shows, and why each thing is real
 *
 * - **The name, at the top of the type ladder.** `02-F41` makes this the cashier the ledger will
 *   name and `01-F61` makes the identification revocable until submit, so the fact a mis-tap gets
 *   wrong is exactly this one — which `27-F25`'s "largest element in their region" then decides
 *   the size of. It is the same `Readout` idiom the money surfaces use: a small tracked caption
 *   over the fact it names.
 * - **The role, muted, beneath it.** `01-F26` makes a role a per-(user, location) assignment; it
 *   is in `store.staff`, it is what `main/authorize.ts` answers Commandment 8 from, and it was
 *   never on a screen. It has a visible consequence the operator otherwise meets as a refusal —
 *   `02-F22` means a cashier cannot open the day. **It authorizes nothing here** (`18 §5`): every
 *   write is gated in main against the registry, never against anything a renderer holds.
 *
 * `role` is optional and renders nothing when absent, rather than guessing. `01-F54` degrades to
 * what is known, and a guessed role is a false claim about a person's authority.
 *
 * ## What it deliberately cannot do
 *
 * - **No `posture`.** Unlike `Tile` this is not a grid cell whose size is an ergonomic minimum;
 *   it is a card, and its size is a layout decision that scales with the surface. It still clears
 *   `27-F8`'s counter target by a wide margin in every mode, and the floor is asserted rather
 *   than assumed (`behaviour.dom.test.tsx`).
 * - **No `selected` and no `unavailable`.** A roster is not a grid with dead cells: `01-F61` says
 *   tapping a different tile before submit *"costs nothing"*, so there is no state to carry
 *   between taps, and a member who cannot sign in does not belong on the door at all.
 * - **No photo, no avatar, no initial.** The product has no such field, and a placeholder that
 *   looks like data is worse than an absence (commandment 2).
 */
export type PersonTileProps = {
  /** `02-F41` — the name the ledger will carry. Unicode user content (`00 §5.6`). */
  name: string;
  /**
   * `01-F26`'s branch assignment, already narrowed and formatted by the host. Absent renders
   * nothing at all — never a guess, never an em-dash placeholder.
   */
  role?: string | undefined;
  onPress: () => void;
};

/**
 * The card's own size, per `SurfaceMode`, in dp — which under `27-F68` is 1/160 inch of glass,
 * so these are millimetres: **41 × 25 mm**, 48 × 29, 60 × 35.
 *
 * Every one is far above `27-F8`'s 12 mm counter target and its 7.6 mm absolute floor, which is
 * the point: the floor is what a control may not go below, not what an identification card
 * should be. The width is set by the CONTENT — a two-word Pakistani name at `text-numeric-hero`
 * (48 dp) plus the longest role this product has (`branch_manager` → "Branch manager") — and the
 * height by wanting a target a hand finds without aiming.
 *
 * It grows with the surface for the reason `MONEY_COLUMN_DP` does: `27-F25`'s "largest element in
 * their region" is relative, and `27-F11c` makes a physically wider panel a larger region.
 */
const CARD_DP: Record<SurfaceMode, { width: number; height: number }> = {
  compact: { width: 260, height: 160 },
  counter: { width: 300, height: 180 },
  wide: { width: 380, height: 220 },
};

export const PersonTile = ({ name, role, onPress }: PersonTileProps) => {
  const color = useColor();
  const mode = useSurfaceMode();
  const card = CARD_DP[mode];
  const heading = typography["text-numeric-hero"];
  const label = typography["text-label"];
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={role === undefined ? name : `${name} — ${role}`}
      style={{
        width: card.width,
        minHeight: card.height,
        // 27-F8's counter target as a hard floor under the layout numbers above, so a future
        // edit to CARD_DP cannot quietly take this below the ergonomic minimum.
        minWidth: targetFor("counter"),
        display: "flex",
        flexDirection: "column",
        // Bottom-aligned: the name sits on a common baseline across a row of tiles whatever the
        // role lines do, which is what makes three cards read as one rank rather than three
        // boxes. 27-F4 — a row that re-aligns when one member's role changes has moved.
        justifyContent: "flex-end",
        alignItems: "flex-start",
        gap: space["space-1"],
        padding: space["space-5"],
        textAlign: "left",
        // 27-F13/27-F16 — achromatic. Depth is carried by a raised fill INSIDE its boundary, and
        // 27-F66 is explicit that the boundary is what carries perceivability while the ~1.1:1
        // fill step is a legitimate depth cue that is not load-bearing. No status colour is spent
        // on the base case, which is what keeps 03-F5's red band the loudest thing on the glass.
        background: color["bgColor-surface-raised"],
        border: `1px solid ${color["borderColor-default"]}`,
        borderRadius: space["space-2"],
        cursor: "pointer",
      }}
    >
      {role === undefined ? null : (
        <span
          style={{
            fontFamily: label.fontFamily,
            fontSize: label.fontSize,
            fontWeight: label.fontWeight,
            letterSpacing: "0.12em",
            color: color["fgColor-muted"],
          }}
        >
          {role}
        </span>
      )}
      <span
        style={{
          fontFamily: heading.fontFamily,
          fontSize: heading.fontSize,
          lineHeight: `${heading.lineHeight}px`,
          fontWeight: heading.fontWeight,
          letterSpacing: heading.letterSpacing,
          color: color["fgColor-default"],
        }}
      >
        {name}
      </span>
    </button>
  );
};
