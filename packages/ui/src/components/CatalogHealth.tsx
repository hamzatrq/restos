import { useColor } from "../theme";
import { space, typography } from "../tokens/index";

/**
 * **`01-F56` / `DEC-SYNC-011` — a menu this device has REFUSED, said out loud on the counter.**
 *
 * `01-F56` makes a refused catalog version *"observable in device health (`15`) like any other
 * blocked cursor (`DEC-SYNC-011`)"*, and `DEC-SYNC-011` (a) names two destinations for exactly
 * that observability: *"surfaced to fleet health (doc 15) **and the honesty UI**"*. This is the
 * honesty UI end. Until it existed the refusal reached the device's cloud session, was carried
 * out of it, and stopped — the till went on drawing a menu it knew was stale, which is `00 §5.7`
 * (*"stale is never presented as live"*) inverted on the one surface a cashier stands at.
 *
 * ## It is NOT the S1 band, and the reason is structural rather than aesthetic
 *
 * `AlarmBand` clears on an **attributed acknowledgement** (`03-F5`: the alert repeats *until
 * acknowledged*). That is right for an EVENT — a ticket that did not print already failed, once,
 * in the past, and a human confirming they saw it is the whole remedy available. A refused
 * catalog is a **STATE**: it is true until the catalog un-sticks, and an `I SAW THIS` that took
 * it off the screen would hide a condition that is still happening. `00 §5.7` forbids precisely
 * that. `27-F11d`'s band is also allocated — its claimants are `03-F5`'s S1s (print failure,
 * red-late order, critical cash variance) and this is none of them.
 *
 * ## It is NOT a fourth `ConnectionFacts` chip either
 *
 * Reachability and catalog health are **independent**, and the state that matters most is the one
 * where they disagree: `Cloud OK` with the menu refused. A fourth link chip would report a
 * healthy link and say nothing, which is the single most misleading answer available. `Fact` is
 * also the wrong type — `ok | degraded | down` describes a LINK, and a refusal is neither a link
 * nor a degree of one; it has a reason and a version.
 *
 * ## Amber, and the allocation is read as CLOSED
 *
 * `27-F14` fixes the budget, and the only connectivity claimant anywhere in that table is
 * **"sync degraded"**, in **amber**. Red's claimants are a closed list — *"ticket overdue, print
 * failure, cash variance past threshold, void & refund actions, revoked device"* — and a stuck
 * menu is not among them. That is the same reading `ConnectionFacts` was corrected to when two
 * permanent red blocks were found painted across every screen, all shift.
 *
 * It is also substantively right, on three FRs rather than on taste: `01-F53` captures
 * `unit_price_paisa` into the event at line-add and never re-reads it, so **a till on a stale
 * catalog still bills correctly**; `01-F54` degrades an unknown item to its identifier and never
 * blocks; `01-F17` says the sale is never blocked. Attention is required — somebody has to be
 * called — and nothing is broken at the till. That is amber's IEC 60073 meaning exactly.
 *
 * `27-F16` is why there is no healthy state to render: colour on the base case spends the
 * preattentive channel on the thing that is always true. A quiet `Menu OK` chip riding the strip
 * every shift is what makes the abnormal one invisible, which is the failure `27-F18` names when
 * it puts colour third.
 *
 * `27-F12` — colour never carries this alone. The **word** (`NOT UPDATING`), the **shape** (the
 * soft corner this strip already spends on abnormal), the **position** (fixed, immediately after
 * the three link facts) and a **number** (the version the till is actually serving) each carry it
 * independently, so it survives `27-F13`'s greyscale and `27-F18`'s sun-washed panel.
 */
export type CatalogRefusal = {
  /**
   * What is wrong, **in the operator's words** — never a reason code.
   *
   * Formatted on the trusted side and shipped whole, which is `AlarmSchema`'s own precedent in
   * `apps/pos-electron/src/shared/ipc.ts`: *"a band assembled in the renderer from a reason code
   * would put the operator-facing wording on the untrusted side of `18 §9`'s bridge, one copy per
   * screen."* The same argument applies here and with more force — the sentence has to
   * distinguish *"this till refused the menu it was sent"* from *"this till has not heard from
   * the cloud"*, and those two are one word apart if each screen writes its own.
   */
  readonly message: string;
  /**
   * `01-F56`'s monotonic version, as this device actually holds it — **`27-F12`'s number**, and
   * the one fact a manager can read down a phone line to somebody who can act on it.
   */
  readonly version: number;
};

export type CatalogHealthProps = {
  /** `null` when the catalog is healthy — and then this renders NOTHING (`27-F16`). */
  refusal: CatalogRefusal | null;
};

export const CatalogHealth = ({ refusal }: CatalogHealthProps) => {
  const color = useColor();
  const t = typography["text-label"];
  // `27-F16` — colour is spent on the abnormal only, so the healthy catalog has no chip at all.
  // Same shape as `AlarmBand`'s `if (!head) return null`, for the same reason.
  if (refusal === null) return null;

  return (
    <span
      // `role="status"` and not `role="alert"`: an alert interrupts, and `27-F11d` is explicit
      // that the work underneath a cashier's hands stays usable. This is a standing condition
      // she should notice, never a modal she has to clear before ringing the next item.
      role="status"
      aria-label={`Menu: not updating. Still showing version ${refusal.version}. ${refusal.message}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: space["space-2"],
        padding: `${space["space-1"]}px ${space["space-2"]}px`,
        // `27-F12`'s shape channel, and deliberately the SAME soft corner `ConnectionFacts`
        // gives `degraded`: this strip already spends radius on severity, and inventing a
        // second silhouette for one more abnormal fact would make the vocabulary mean less.
        borderRadius: space["space-1"],
        // `27-F15` — the fill carries it. Abnormal is the middle rung of the ladder.
        background: color["bgColor-status-abnormal"],
        // `27-F64` — the fill is relieved of SC 1.4.11's 3:1 only because an OUTLINE carries the
        // boundary. It is a derivative of its own fill and encodes nothing of its own.
        border: `1px solid ${color["outlineColor-status-abnormal"]}`,
        color: color["fgColor-on-status-abnormal"],
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        fontWeight: t.fontWeight,
      }}
    >
      Menu
      {/* The word IS the state (`27-F12`), and it is the word that separates this fact from the
          link facts beside it: `Cloud OFF` says the till cannot reach the cloud, `Menu NOT
          UPDATING` says it reached the cloud and would not take what came back. */}
      <strong>NOT UPDATING</strong>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        {/* `27-F12`'s number, and `00 §5.7`'s "stale is never presented as live" made concrete:
            the till says which menu it is actually selling from. */}
        still showing v{refusal.version}
      </span>
      <span>{refusal.message}</span>
    </span>
  );
};
