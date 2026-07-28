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

// 27-F14 has no slot for "connection", and inventing one would be a fourth hue. So these
// reuse the allocated status colours by MEANING: degraded is abnormal, down is a fault only
// where it actually is one — see the `muted` treatment of a dead cloud link below.
const FILL: Record<Fact, ColorName> = {
  ok: "bgColor-surface-sunken",
  degraded: "bgColor-status-abnormal",
  down: "bgColor-status-fault",
};
// 27-F64: the outline carries SC 1.4.11's 3:1 so the fill's luminance is free for
// dichromacy separation. It derives from its own fill and never encodes meaning.
const OUTLINE: Record<Fact, ColorName> = {
  ok: "borderColor-default",
  degraded: "outlineColor-status-abnormal",
  down: "outlineColor-status-fault",
};
const ON: Record<Fact, ColorName> = {
  ok: "fgColor-default",
  degraded: "fgColor-on-status-abnormal",
  down: "fgColor-on-status-fault",
};

const Chip = ({ label, state, muted }: { label: string; state: Fact; muted: boolean }) => {
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
        borderRadius: state === "ok" ? 999 : state === "degraded" ? 4 : 0,
        background: muted ? color["bgColor-surface-sunken"] : color[FILL[state]],
        // 27-F64: the outline carries only the BOUNDARY (SC 1.4.11). A muted fact takes the
        // neutral outline for the same reason it takes the neutral fill — it is not a status.
        border: `1px solid ${color[muted ? "borderColor-default" : OUTLINE[state]]}`,
        color: muted ? color["fgColor-muted"] : color[ON[state]],
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

export const ConnectionFacts = ({ lan, hub, cloud }: ConnectionFactsProps) => (
  <div style={{ display: "flex", gap: space["space-2"], alignItems: "center" }}>
    <Chip label="LAN" state={lan} muted={false} />
    <Chip label="Hub" state={hub} muted={false} />
    {/*
      A dead cloud link is rendered MUTED, not as a fault, because `00 §5.1` makes offline
      the normal case: no in-branch feature may require WAN, and `01-F17` says a sale is
      never blocked. Colouring it red would spend the fault colour — the loudest signal the
      system has — on a condition the operator can neither fix nor needs to.
      It stops being muted only when something the operator DOES care about is blocked, and
      that arrives as its own S1 (27-F11d), not as a chip turning red.
    */}
    <Chip label="Cloud" state={cloud} muted={cloud === "down"} />
  </div>
);
