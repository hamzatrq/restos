import { useColor } from "../theme";
import { type ColorName, space, typography } from "../tokens/index";

/**
 * `00 §5.7` sync honesty — **three separate facts, never one "online" dot.**
 *
 * The reason is not thoroughness, it is correctness. A device can be LAN-connected, with a
 * healthy hub, and no WAN — and that is the **normal** operating state of a Pakistani
 * restaurant, not an error. A single dot forces that state to be either a lie (green, while
 * the cloud is unreachable) or an alarm (red, while everything the branch needs is working).
 * Both teach staff to ignore the indicator, and an indicator staff ignore is worse than none.
 *
 * `27-F12` applies here as everywhere: each fact carries a word and a shape, not just a hue.
 */
export type Fact = "ok" | "degraded" | "down";

export type ConnectionFactsProps = {
  /** This device's link to the branch LAN (01-F13). */
  lan: Fact;
  /** The elected hub's reachability (01-F13 election, 01-F15 delivery). */
  hub: Fact;
  /** The cloud uplink. `down` here is NOT an error state — 00 §5.1, offline-first. */
  cloud: Fact;
};

/**
 * **`27-F14` allocates the budget, and a link being DOWN is not in the fault slot.**
 *
 * Read the table it fixes: red's claimants are *"ticket overdue, print failure, cash variance
 * past threshold, void & refund actions, revoked device"* — every one an event the operator
 * must act on. **No connectivity state appears there at all.** The only connectivity claimant
 * in the whole allocation is *"sync degraded"*, and it sits in **amber**. So `degraded` reuses
 * amber by MEANING and is correct; `down` was reaching for a slot `27-F14` never gave it.
 *
 * What that cost, found by launching (August 2026): this device reports `lan: down` and
 * `hub: down` because **no mesh exists yet** — the honest resting state of a till nothing has
 * been elected for (`00 §5.7`, and `apps/pos-electron/CLAUDE.md` records why). The strip
 * therefore painted **two permanent red blocks** across the top of every screen, all shift,
 * every shift. `27-F16` makes the argument in the neighbouring case — spending the
 * preattentive channel on the base case is what makes it worthless for the exception — and a
 * cashier who has learned that the red blocks mean nothing is a cashier who will not see the
 * one that does. That is the failure `27-F18` names when it puts colour third, and it is
 * strictly worse than having no strip.
 *
 * So `down` takes the neutral treatment that a dead cloud link already had. **It is not made
 * dishonest by this:** `27-F12` requires colour + shape + word, and the word still reads `OFF`,
 * the shape is still the square corner that only `down` gets, and `fgColor-muted` still reads
 * differently from `ok`'s `fgColor-default`. Colour is the channel being withdrawn, and
 * `27-F18` is explicit that it was the third one. When something the operator can actually act
 * on is blocked it arrives as its own S1 band (`27-F11d`), which is the surface that ruling
 * built for exactly this.
 */
const FILL: Record<Fact, ColorName> = {
  ok: "bgColor-surface-sunken",
  degraded: "bgColor-status-abnormal",
  down: "bgColor-surface-sunken",
};
// 27-F64: the outline carries SC 1.4.11's 3:1 so the fill's luminance is free for
// dichromacy separation. It derives from its own fill and never encodes meaning. `27-F66` —
// a neutral fill takes the neutral boundary, because it is not a status.
const OUTLINE: Record<Fact, ColorName> = {
  ok: "borderColor-default",
  degraded: "outlineColor-status-abnormal",
  down: "borderColor-default",
};
const ON: Record<Fact, ColorName> = {
  ok: "fgColor-default",
  degraded: "fgColor-on-status-abnormal",
  down: "fgColor-muted",
};

const Chip = ({ label, state }: { label: string; state: Fact }) => {
  const color = useColor();
  const t = typography["text-label"];
  return (
    <span
      role="status"
      aria-label={`${label}: ${state}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: space["space-1"],
        padding: `${space["space-1"]}px ${space["space-2"]}px`,
        // 27-F12 — the shape is an independent channel and carries the state on its own: a
        // pill is OK, a soft corner is SLOW, a square corner is OFF. It is what survives the
        // greyscale, sun-washed and scratched panels 27-F18 measures.
        borderRadius: state === "ok" ? 999 : state === "degraded" ? 4 : 0,
        background: color[FILL[state]],
        border: `1px solid ${color[OUTLINE[state]]}`,
        color: color[ON[state]],
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        fontWeight: t.fontWeight,
      }}
    >
      {label}
      {/* The word IS the state — 27-F12, and the only channel that survives a scratched,
          sun-washed or greyscale panel (27-F18: colour is the third channel, never the first). */}
      <strong>{state === "ok" ? "OK" : state === "degraded" ? "SLOW" : "OFF"}</strong>
    </span>
  );
};

/**
 * The three facts, each rendered by the same rule.
 *
 * The `muted` per-chip override is GONE, and its removal is the point rather than a tidy-up.
 * A dead cloud link was already exempted from the fault colour here — `00 §5.1` makes offline
 * the normal case, so red was never right for it — but the exemption was written as a property
 * of *which chip this is*, which left `lan` and `hub` red by default. That is backwards: the
 * reason a dead link is not a fault is a property of `27-F14`'s allocation, not of the WAN, and
 * writing it per-chip meant the two facts that are down on every device in this build stayed
 * red while the argument for muting them was sitting one line below.
 */
export const ConnectionFacts = ({ lan, hub, cloud }: ConnectionFactsProps) => (
  <div style={{ display: "flex", gap: space["space-2"], alignItems: "center" }}>
    <Chip label="LAN" state={lan} />
    <Chip label="Hub" state={hub} />
    <Chip label="Cloud" state={cloud} />
  </div>
);
