import { useColor } from "../theme";
import { space, typography } from "../tokens/index";

/**
 * **`27-F11c` / `00 §5.7` — the SCREEN itself, said out loud on the counter.**
 *
 * RestOS is bring-your-own-hardware (founder ruling, August 2026: *"the system should adapt to
 * the device it runs on and not assume that everyone will have a proper screen … we have a
 * bring-your-own-hardware software"*). Until that ruling the counter window declared
 * `minWidth: 1366, minHeight: 768` and Electron **prevented** the resize — a pixel floor, which
 * `27-F11c` says outright is the wrong quantity, and the measurements agreed on both sides at
 * once: it **refused** a 1280×800 @13.3″ laptop that renders every surface with zero violations
 * and **admitted** a 1366×768 @10.1″ tablet that clips two of them. Pixels are not room.
 *
 * The floor is millimetres now and it clamps to the glass instead of refusing, so the till
 * **starts** on hardware smaller than the layout wants. That is the right trade — a restaurant
 * running this on the laptop it already owns is not helped by a device that will not turn on —
 * and it is only defensible if the degradation is **named**. This component is the naming. It is
 * the difference between *adapting* and *quietly not fitting*.
 *
 * ## It is `CatalogHealth`'s peer, and for the same three reasons
 *
 * - **Not `03-F5`'s S1 band.** `AlarmBand` clears on an attributed acknowledgement, which is
 *   right for an EVENT that already happened once. A screen too small for its layout is a
 *   **STATE** — true until the hardware changes — and an `I SAW THIS` that took it off the strip
 *   would hide a live condition, which is exactly what `00 §5.7` forbids. `27-F11d`'s band is
 *   also allocated: its claimants are `03-F5`'s S1s and this is none of them.
 * - **Not a fourth `ConnectionFacts` chip.** `Fact` is `ok | degraded | down` and describes a
 *   LINK. This is not a link and not a degree of one; it has a reason and a size.
 * - **Amber, and the `27-F14` allocation is read as CLOSED.** Red's claimants are enumerated —
 *   *"ticket overdue, print failure, cash variance past threshold, void & refund actions, revoked
 *   device"* — and a small screen is not among them. Substantively too: `01-F17` says the sale is
 *   never blocked, `01-F53` captures the price into the event at line-add so the till still bills
 *   correctly, and every control the operator can reach still works. Attention is required and
 *   nothing is broken, which is amber's IEC 60073 meaning exactly.
 *
 * `27-F16` is why there is no healthy state: a permanent `Screen OK` chip riding the strip every
 * shift is the base-case spend that makes the abnormal one invisible.
 *
 * `27-F12` — colour never carries this alone. The **word** (`TOO SMALL` / `UNMEASURED`), the
 * **shape** (the same soft corner this strip already spends on abnormal), the **position** (fixed,
 * after catalog health) and a **number** (the glass in millimetres) each carry it independently,
 * so it survives `27-F13`'s greyscale and `27-F18`'s sun-washed panel.
 */
export type PanelNotice = {
  /**
   * The closed set, because the two states are not degrees of one thing and a free string here
   * would be a component configurable into saying anything (`21 §2`, and this package's own rule
   * that *"a component that can be configured into violating a law is not a closed vocabulary"*).
   *
   * - `too_small` — the glass WAS measured and is under the layout's physical floor.
   * - `unmeasured` — the density itself is a guess, so every physical claim on this device is
   *   one, **including whether it is too small**. `27 §1a`'s 15.6″ counter is assumed when the OS
   *   reports no size, and on a 10.1″ tablet that draws every `27-F8` target at ~45% of its
   *   ergonomic size while nothing on screen looks wrong.
   */
  readonly reason: "too_small" | "unmeasured";
  /**
   * What is wrong, **in the operator's words** — never a reason code, and formatted on the
   * trusted side of `18 §9`'s bridge. `CatalogRefusal`'s header carries the full argument: a
   * sentence assembled in the renderer puts the operator-facing wording on the untrusted end,
   * one copy per screen, and the distinction this one has to preserve — *"this screen is too
   * small"* against *"this till cannot measure its screen"* — is a careless word wide.
   */
  readonly message: string;
  /** `27-F12`'s NUMBER: the glass as measured, or the admission that it was not. */
  readonly glass: string;
};

export type PanelHealthProps = {
  /** `null` when the panel clears the floor and its density is known — renders NOTHING. */
  notice: PanelNotice | null;
};

/** `27-F12`'s WORD, and the one thing this component decides for itself. */
const WORD: Record<PanelNotice["reason"], string> = {
  too_small: "TOO SMALL",
  unmeasured: "UNMEASURED",
};

export const PanelHealth = ({ notice }: PanelHealthProps) => {
  const color = useColor();
  const t = typography["text-label"];
  // `27-F16` — colour is spent on the abnormal only. Same shape as `CatalogHealth` beside it and
  // `AlarmBand`'s `if (!head) return null`, for the same reason.
  if (notice === null) return null;

  return (
    <span
      // `role="status"`, never `role="alert"`: an alert interrupts, and `27-F11d` is explicit
      // that the work under a cashier's hands stays usable. This is a standing condition she
      // should notice, and there is nothing she can do about it mid-order.
      role="status"
      aria-label={`Screen: ${WORD[notice.reason].toLowerCase()}. ${notice.glass}. ${notice.message}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: space["space-2"],
        padding: `${space["space-1"]}px ${space["space-2"]}px`,
        // `27-F12`'s shape channel, deliberately the SAME soft corner `ConnectionFacts` gives
        // `degraded` and `CatalogHealth` gives a refusal: this strip already spends radius on
        // severity, and a second silhouette for one more abnormal fact makes both mean less.
        borderRadius: space["space-1"],
        // `27-F15` — the fill carries it. Abnormal is the middle rung of the ladder.
        background: color["bgColor-status-abnormal"],
        // `27-F64` — a fill is relieved of SC 1.4.11's 3:1 only because an OUTLINE carries the
        // boundary. It is a derivative of its own fill and encodes nothing of its own.
        border: `1px solid ${color["outlineColor-status-abnormal"]}`,
        color: color["fgColor-on-status-abnormal"],
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        fontWeight: t.fontWeight,
      }}
    >
      Screen
      {/* The word IS the state (`27-F12`), and it is what separates this fact from every other
          chip on the strip: the link facts describe the network, catalog health describes the
          menu, and this describes the glass. */}
      <strong>{WORD[notice.reason]}</strong>
      {/* `27-F12`'s number. `tabular-nums` because it is a measurement and `27-F25` makes digits
          the payload wherever one appears. */}
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{notice.glass}</span>
      <span>{notice.message}</span>
    </span>
  );
};
