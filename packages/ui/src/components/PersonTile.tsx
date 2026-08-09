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
 * `staffRole` is optional and renders nothing when absent, rather than guessing. `01-F54` degrades to
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
   * `01-F26`'s branch assignment, as the **registry string** — `cashier`, `branch_manager`. The
   * component formats it; the host does not, because two hosts formatting it is two hosts that
   * can format it differently, and this product draws the same roster on the unlock door and on
   * `02-F20`'s approver grid.
   *
   * Absent renders nothing at all — never a guess, never an em-dash placeholder. `01-F54`
   * degrades to what is known, and a guessed role is a false claim about a person's authority.
   *
   * **Named `staffRole` and NOT `role`, which is not fussiness.** `role` is the single most
   * load-bearing attribute name in HTML, and a `packages/ui` prop that shadows it is a component
   * configured to collide: Biome's `useValidAriaRole` reads `<PersonTile role="cashier">` as an
   * invalid ARIA role and fails the build at every literal call site, and any future
   * implementation that spread its props onto the element would put `role="cashier"` on a real
   * button and destroy its accessible role for good. Caught by the linter on the first call site.
   */
  staffRole?: string | undefined;
  onPress: () => void;
};

/**
 * A registry role string, as a person reads it. `branch_manager` is not a word.
 *
 * A TRANSFORM and never a lookup table, deliberately. A `Record<Role, string>` here would be
 * `domain`'s `ROLES` restated in the UI layer — a second declaration of a closed set that can
 * fall silently out of step, which is the shape `catalog.enabled` was closed for — and it would
 * render nothing at all for a role it had not heard of, on reference data (`01-F21`) that may
 * legitimately name anything. Underscores to spaces and one leading capital is right for every
 * current member of `ROLES` and degrades honestly for any future one.
 *
 * `en-US` explicitly, never the host locale: `toLocaleUpperCase` under a Turkish locale turns `i`
 * into `İ`, which is the classic way a machine's own locale reaches a string it has no business
 * touching. `00 §5.6` — the UI is English; the NAME beside it is Unicode user content and is
 * never transformed at all.
 */
const roleLabel = (role: string): string => {
  const words = role.replace(/_/g, " ");
  return words.charAt(0).toLocaleUpperCase("en-US") + words.slice(1);
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
 *
 * **There is NO height here, and its absence is the design rather than an omission.** Two things
 * removed it, arriving from opposite directions on the same afternoon:
 *
 * 1. **A screenshot.** The first draft pinned the wrapped-name height (250 dp on `wide`) and a
 *    row of cards each carried a third of itself empty below the name.
 * 2. **`discipline-ast.oracle.test.ts`**, which bans a 40–200 literal on a size property in this
 *    package outright — *"a control takes `targetFor(posture)`; anything else takes a token,
 *    never a literal"*. It caught `height: 140/160/180` the first time the suite ran, and it was
 *    right: a hand-typed number on a pressable element is how a destructive control once shipped
 *    at 44 px under `27-F8`'s floor.
 *
 * The card is therefore sized by its CONTENT — padding, the role line, the name — with
 * `targetFor("counter")` as the ergonomic floor beneath it, and the row's own `stretch`
 * equalising siblings. Three one-line names give three identical short cards; one wrapped name
 * lifts all three together. That is the alignment `27-F4` wants, obtained from the layout instead
 * of from a constant sized for a case that is usually not happening.
 *
 * The WIDTH stays explicit and stays here, because it is the one dimension content cannot decide:
 * a card that shrink-wrapped its name would make `Ayesha Khan` and `Hina Raza` different widths,
 * and a row of unequal cards is the ragged rank this component exists to avoid.
 */
const CARD_WIDTH_DP: Record<SurfaceMode, number> = {
  compact: 280,
  counter: 360,
  wide: 440,
};

export const PersonTile = ({ name, staffRole, onPress }: PersonTileProps) => {
  const color = useColor();
  const mode = useSurfaceMode();
  const width = CARD_WIDTH_DP[mode];
  const heading = typography["text-numeric-hero"];
  const label = typography["text-label"];
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={staffRole === undefined ? name : `${name} — ${roleLabel(staffRole)}`}
      style={{
        width,
        // 27-F8's counter target as a hard floor on BOTH axes. The card is content-sized, so
        // this is what guarantees it can never come out below the ergonomic minimum however
        // short a name is — and it is a token call rather than a number, which is the rule
        // `discipline-ast.oracle.test.ts` enforces and the reason the height literal is gone.
        minWidth: targetFor("counter"),
        minHeight: targetFor("counter"),
        display: "flex",
        flexDirection: "column",
        /**
         * **TOP-aligned, and the first draft was bottom-aligned — found by looking at the
         * screenshot, which is the only instrument that could have.**
         *
         * Bottom-alignment was chosen to put the names on a common baseline. It does the
         * opposite as soon as a name wraps: `Ayesha Khan` and `Bilal Ahmed` take two lines at
         * `text-numeric-hero` where `Hina Raza` takes one, so growing upward from a shared
         * bottom edge pushed their role captions **51 dp higher** than hers and the row read as
         * three unrelated boxes.
         *
         * Top-alignment pins the captions to one line across the row and lets the names hang
         * from a common top edge instead. A name is user content of unbounded length
         * (`00 §5.6`), so a layout that only aligns while nothing wraps is a layout that aligns
         * by luck — `27-F4`'s positional contract wants the opposite.
         */
        justifyContent: "flex-start",
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
      {staffRole === undefined ? null : (
        <span
          style={{
            fontFamily: label.fontFamily,
            fontSize: label.fontSize,
            fontWeight: label.fontWeight,
            letterSpacing: "0.12em",
            color: color["fgColor-muted"],
          }}
        >
          {roleLabel(staffRole)}
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
