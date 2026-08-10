import { PAYMENT_METHODS, type Paisa, type PaymentMethod, paisa, subPaisa } from "@restos/domain";
import { useState } from "react";
import { type SurfaceMode, useSurfaceMode } from "../surface-mode";
import { useColor } from "../theme";
import { space, targetFor, typography } from "../tokens/index";
import { MoneyValue } from "./MoneyValue";
import { acceptKeystroke, NumericKeypad } from "./NumericKeypad";
import { Readout } from "./Readout";

/**
 * Settling an order (`02-F12`, `02-F13`).
 *
 * **`27-F24` governs the whole component: the system computes, staff read.** ~60% of rural
 * Class 1 recognise numbers against **9.5% who can do any arithmetic**, so the cashier is never
 * asked to work out change — the number arrives finished and hero-sized, because it is the one
 * she reads aloud to the customer.
 *
 * Three things this deliberately cannot do:
 *
 * - **It cannot compute money itself.** Change is `subPaisa`, from `domain`. `DEC-MONEY-005`
 *   bans raw arithmetic on money in every package, formatters and screens included, and this is
 *   exactly the screen where a stray `-` would be most tempting and least visible.
 * - **It cannot take a negative amount.** `Paisa` is non-negative by contract, so an
 *   under-tender is expressed as REMAINING rather than as a negative change — which is also how
 *   a cashier thinks about it, and what `02-F13`'s split tender needs.
 * - **It cannot invent a method.** `PAYMENT_METHODS` is `domain`'s closed set; a sixth tender
 *   would be a category no report knows to count, in a ledger that cannot be corrected in place.
 */

/** `02-F12`'s methods in the order a counter uses them. Cash first: it is most of the day. */
const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "CASH",
  card: "CARD",
  raast: "RAAST",
  khata_credit: "KHATA",
  aggregator_receivable: "AGGREGATOR",
};

export type TenderPanelProps = {
  /** What is owed. Already computed by the fold — this screen never sums lines. */
  dueP: Paisa;
  /**
   * `02-F13` — what has already been tendered in this settlement, across methods. Split payment
   * is not a mode: it is what happens when the first tender does not cover the bill.
   */
  takenP?: Paisa | undefined;
  onTender: (tender: { amountP: Paisa; method: PaymentMethod }) => void;
};

/**
 * **The money column's width, per `SurfaceMode` — the only thing that reflows here.**
 *
 * The keypad does NOT reflow and must not: `27-F8`'s 126 dp is a measured ergonomic floor, and
 * `27-F68` (b) forbids trimming the millimetres to make a layout fit. It is also pointless in
 * the other direction — `27-F8` records that *"there is no significant accuracy gain above"*
 * 9.6 mm, so a bigger key on a bigger panel buys nothing an operator can feel. The pad is the
 * fixed thing; the reading column is what has an opinion about room.
 *
 * `compact`'s **480** is not a design choice, it is a MEASUREMENT and it is a floor: the five
 * `02-F12` methods at their `27-F8` counter targets come to `76+76+76+76+120 + 4 gaps = 456`
 * natural, and at exactly 456 the row still wrapped on sub-pixel border rounding. A wrapped
 * method row re-ranks the highest-consequence entry on the counter, which `27-F4` forbids in as
 * many words. Every mode is at or above it, so the row can never wrap in any of them.
 */
const MONEY_COLUMN_DP: Record<SurfaceMode, number> = {
  compact: 480,
  counter: 560,
  wide: 760,
};

/**
 * **The signature element, and the one place this surface spends the top of the type ladder.**
 *
 * `27-F25` makes the payload *"the largest element in their region"*, and `27-F11c` makes a
 * physically larger panel a larger region — so holding one size across every panel means the
 * figure stops being the largest thing in its region exactly when there is most room for it to
 * be. On `wide` the change figure takes `text-numeric-display`.
 *
 * `DUE` deliberately does not step with it. Two figures at the same size is two headlines and no
 * hierarchy, and of the pair it is CHANGE the cashier reads aloud to a customer while counting
 * notes into their hand (`27-F24` — she is never asked to derive it).
 *
 * **`counter` takes `display` too, and the reason is a RANKING measured off a screenshot rather
 * than a size preference.** With the change figure at `hero` (48 dp) the loudest thing on the Pay
 * surface after `03-F5`'s red band was the blue `TAKE CASH` fill — ~510 × 126 dp of saturated
 * `bgColor-interactive` against a 48 dp black numeral. `plans/wave-1/design-direction.md`'s thesis
 * is that **the money is the loudest thing on the screen**, and it was third. The fix is to raise
 * the payload, not to strip an accent `27-F14` allocates by name; see the note on the button.
 * `compact` keeps `hero` because 64 dp does not fit a 223 mm tablet's column beside the pad.
 */
const CHANGE_SIZE: Record<SurfaceMode, "display" | "hero"> = {
  compact: "hero",
  counter: "display",
  wide: "display",
};

export const TenderPanel = ({ dueP, takenP = paisa(0), onTender }: TenderPanelProps) => {
  const color = useColor();
  const label = typography["text-label"];
  const [entry, setEntry] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const mode = useSurfaceMode();

  // `01-F17` — the entry is RUPEES because that is what a cashier types (`27-F23`: no decimals
  // on operational screens, and no sub-rupee unit circulates in Pakistan). The paisa conversion
  // is the only multiplication here and it is a UNIT conversion, not money arithmetic.
  const enteredP = paisa((Number(entry) || 0) * 100);

  const remainingP = takenP >= dueP ? paisa(0) : subPaisa(dueP, takenP);
  const coversBill = enteredP >= remainingP;
  // Change and shortfall are the SAME subtraction in two directions, and both are non-negative
  // by construction — `Paisa` has no sign, so the direction is carried by which word is shown.
  const changeP = coversBill ? subPaisa(enteredP, remainingP) : paisa(0);
  const shortP = coversBill ? paisa(0) : subPaisa(remainingP, enteredP);

  return (
    /**
     * **TWO COLUMNS, and the arithmetic is why.**
     *
     * Stacked vertically — as this shipped — the panel's own intrinsic height is
     * `DUE 36 + methods 76 + keypad 528 + change 56 + TAKE 126`, plus four `space-4` gaps and
     * `space-4` padding: **918 px**. Measured on the running app, not derived on paper.
     *
     * The counter's work area on `27 §1a`'s reference panel is **568 px** — 768 of panel, less
     * the status strip and tab rail, less `AppShell`'s own padding. So the stack overflowed by
     * **350 px** and `AppShell` clips rather than scrolls it (deliberately: `27-F2` bans
     * reaching a primary action by scrolling, and pages laterally instead). `TAKE CASH`, the
     * `CHANGE` figure, `C` and backspace all sat below the fold, unreachable by any means —
     * **a cashier could not settle an order.**
     *
     * Not one of the four obvious fixes is legal. Shrinking the keypad breaks `27-F8`'s 126 dp,
     * which is a measured floor for high-consequence entry standing up. Scrolling breaks
     * `27-F2`. Paging the panel breaks it too — the keys are not a list. Hiding the panel behind
     * a SETTLE button breaks `27-F5`'s ban on context-dependent controls.
     *
     * What is actually true is that the keypad's 528 px is the tallest fixed thing here and
     * **everything else fits BESIDE it**: `max(528, 36 + 76 + 56 + 126 + 48 of gaps = 342)`, so
     * the panel closes at **560 px** and clears the work area with room. This is the identical
     * fix, for the identical reason, that the unlock gate took in `App.tsx` — and the two
     * surfaces now agree about where a pad sits relative to what it is entering, which
     * `27-F4` cares about more than either layout on its own.
     */
    <section
      aria-label="Take payment"
      style={{
        display: "flex",
        gap: space["space-5"],
        /**
         * **`compact` DROPS THE PANEL CHROME, and this is a precedent being followed rather than
         * a new idea.** `CashSurfaces.tsx` made exactly this call on exactly this ground: *"THE
         * ENTRY INSTRUMENT — no panel chrome, and that is the hardware floor talking … a `Panel`
         * around this would cost 64 dp ≈ 10 mm of height on the surface that decides which glass
         * can run RestOS."*
         *
         * Here it is **42 dp — 6.7 mm** of the vertical budget (`space-5` top and bottom, plus
         * the rule), and it is the last thing standing between this surface and `27 §1a`'s 10.1″
         * tablet class: measured with the band up, Pay held 585 dp of content in a 569 dp box,
         * and 585 − 42 = 543 fits with room.
         *
         * **What is given up is nothing this panel needs on that glass.** A border earns its
         * place by separating a region from what surrounds it, and on a 126 mm panel this
         * section IS the work area — the rule was drawn ~4 dp inside `main`'s edge, boxing the
         * whole screen and separating it from nothing. On `counter` and `wide` it is a composed
         * object in a field of space (`Counter.tsx` centres it), the separation is real, and the
         * chrome stays.
         *
         * `27-F66` is untouched: a boundary carries a region, and where there is no longer a
         * distinct region there is nothing to carry. No control changes size — `27-F68` (b) is
         * about millimetres of TARGET, and every key, every method button and `TAKE CASH` keep
         * theirs to the dp.
         */
        ...(mode === "compact"
          ? {}
          : {
              padding: space["space-5"],
              background: color["bgColor-surface-raised"],
              border: `1px solid ${color["borderColor-default"]}`,
              borderRadius: space["space-2"],
            }),
        alignItems: "flex-start",
        // The panel is as wide as the two columns need and no wider. Left to fill the work
        // area it stretched `TAKE CASH` to ~850 px and threw the `DUE` figure to the far side
        // of its own label — `27-F25` wants the number big, not distant from what it names.
        //
        // **The room left over is the HOST's to place, and it does place it** (`Counter.tsx`
        // centres this on both axes). A panel that anchors itself is how the founder's screen
        // came to sit in the top-left of a large window with the bottom third empty; a panel
        // that stretches to fill is how `TAKE CASH` became 850 px wide. Neither is the answer —
        // the panel is capped and the surface centres it.
        width: "fit-content",
      }}
    >
      {/*
        The reading-and-acting column: what is owed, how it is being paid, what comes back, and
        the act. `27-F25` puts the operational payload at the top of the size ladder and both
        numbers on this surface are that payload, so they keep their sizes and simply stop
        competing with the pad for vertical room.
      */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: space["space-5"],
          /**
           * Fixed per mode, never fluid: the pad must not move between orders, and a column
           * that tracked the surface continuously would put the method row and `TAKE CASH` in a
           * slightly different place on every panel. `MONEY_COLUMN_DP` carries the derivation
           * and the 480 dp floor that stops the `02-F12` method row wrapping (`27-F4`).
           */
          width: MONEY_COLUMN_DP[mode],
        }}
      >
        {/*
          `27-F25`/`27-F57` — the caption sits directly ABOVE its own figure, not at the far end
          of a `space-between` row. This was a row, and on the reference panel it put the word
          `DUE` **70 mm** from the number it names; `27-F57` measures that pairing step as where
          comprehension collapses (decode ~71%, execute ~35%). `Readout` is the fix and it is the
          same shape on every surface in this product.
        */}
        <Readout caption="DUE">
          <MoneyValue paisa={remainingP} size="primary" />
        </Readout>

        {/*
        27-F4 — a fixed row of methods, every one always present and in the same place. A method
        list that reordered by frequency would destroy the positional memory of every cashier who
        learned it, and this is the highest-consequence entry on the counter.
      */}
        <div style={{ display: "flex", gap: space["space-2"], flexWrap: "wrap" }}>
          {PAYMENT_METHODS.map((m) => {
            const active = m === method;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={active}
                onClick={() => setMethod(m)}
                style={{
                  minHeight: targetFor("counter"),
                  minWidth: targetFor("counter"),
                  padding: `${space["space-2"]}px ${space["space-3"]}px`,
                  fontFamily: label.fontFamily,
                  fontSize: label.fontSize,
                  fontWeight: active ? 700 : label.fontWeight,
                  background: color["bgColor-surface-raised"],
                  color: color["fgColor-default"],
                  border: `1px solid ${color["borderColor-default"]}`,
                  // 27-F66 — the selected state is an independent MARK at 3:1, never the fill
                  // step, which is 1.15:1 and carries nothing. Same accent rule the tab rail uses.
                  borderBottom: active
                    ? `3px solid ${color["bgColor-interactive"]}`
                    : "3px solid transparent",
                  borderRadius: space["space-1"],
                  cursor: "pointer",
                }}
              >
                {METHOD_LABEL[m]}
              </button>
            );
          })}
        </div>

        {/*
        27-F24/F25 — the computed number is the largest element in its region, because it is the
        operational payload and the one the cashier reads aloud. 27-F12: the direction is a WORD.

        It stays with the money and the act rather than under the pad: this is the number the
        cashier says out loud to the customer, and `27-F24` exists because 9.5% of the operator
        population can do the arithmetic that would otherwise be needed to check it.

        **⚠ THE WORD WAS PRINTED TWICE AND A FOUNDER READ IT OFF THE GLASS: `CHANGE` /
        `CHANGE Rs 0`, overlapping, in a `space-between` row.** This label said `CHANGE` and the
        call below ALSO passed `direction: "change"`, which `MoneyValue` renders as a prefix —
        two mechanisms discharging one `27-F12` obligation, each correct alone. It had been
        filed once as "cosmetic, pre-existing" and it is neither: two words for one fact is the
        `02-F45` shape ("a second source for one fact"), and duplicated text is what a
        plausibly-non-reading operator has the least ability to parse past (`21 §5`).

        **The CAPTION owns the word here, and that is forced rather than chosen.** `REMAINING` is
        not a member of `MoneyValue`'s `direction` union (`refund | short | over | change`), so
        the other resolution would leave one arm of one control taking its word from the prefix
        and the other from a label — the asymmetry that produced the duplication in the first
        place. `MoneyValue.direction` keeps its job everywhere it is the ONLY word:
        `CashSurfaces.tsx`'s `Variance` renders `OVER`/`SHORT` with no caption at all, and
        `me-tab.dom.test.tsx` asserts it.
      */}
        <Readout caption={coversBill ? "CHANGE" : "REMAINING"}>
          <MoneyValue paisa={coversBill ? changeP : shortP} size={CHANGE_SIZE[mode]} />
        </Readout>

        <button
          type="button"
          onClick={() => {
            // 01-F17 — a sale is never blocked. A PARTIAL tender is recorded as itself and the
            // remainder stays owed (02-F13's split is this, repeated), so the one thing this
            // button never does is refuse.
            onTender({ amountP: coversBill ? remainingP : enteredP, method });
            setEntry("");
          }}
          /**
           * **THE BLUE STAYS, and this is the deliberate decision the design direction asked for
           * rather than an oversight.**
           *
           * `plans/wave-1/design-direction.md` raises it as an open question: *"the primary action
           * currently ships as a large saturated blue fill. `27-F16` reserves colour for the
           * abnormal, and a permanent blue on the resting happy path may already violate it."*
           *
           * **Read against the FRs, the premise does not hold.** `27-F16` is a rule about MONEY —
           * *"money is never coloured by default … colouring the commonest number on screen spends
           * the whole preattentive channel on the base case"* — and this is a control, not a
           * number. What governs a control is `27-F14`, whose table has four slots and allocates
           * the fourth **by name**: *"blue accent — interactive / mandatory action — any control
           * the operator may press."* It is the one slot in the budget that is not a status,
           * created precisely so pressability can be marked without blunting amber or red.
           *
           * The product already spends it far more narrowly than that allocation permits: the
           * keypad's twelve keys, the five method buttons and every `Tile` on the counter are all
           * controls the operator may press and none of them is blue. Exactly one control per
           * surface carries it, which is what makes `27-F5`'s *"persistent, visible, labelled
           * target"* legible at a glance on a screen where a keypad key is already large.
           *
           * **The real observation behind the question was right, and it is fixed elsewhere.** The
           * blue did out-rank the money. `27-F18` puts colour THIRD, after position and number, so
           * the answer is to raise the payload — `CHANGE_SIZE` now takes `text-numeric-display` on
           * the counter as well as on `wide` — rather than to withdraw an allocated accent and
           * leave the primary act marked by size alone.
           */
          style={{
            minHeight: targetFor("keypad"),
            fontFamily: label.fontFamily,
            fontSize: label.fontSize,
            fontWeight: 700,
            background: color["bgColor-interactive"],
            color: color["fgColor-on-interactive"],
            // 27-F64 — a status fill carries its outline.
            border: `1px solid ${color["outlineColor-interactive"]}`,
            borderRadius: space["space-2"],
            cursor: "pointer",
          }}
        >
          TAKE {METHOD_LABEL[method]}
        </button>
      </div>

      {/*
        The pad, in its own column. `27-F8` fixes these keys at 126 dp — 20 mm, the
        high-consequence standing-entry target — and that is a MEASURED floor, so the pad's
        528 px is not a number this layout is free to negotiate with. It is the fixed thing
        everything else was arranged around.

        27-F29 — impossible numbers are blocked AT ENTRY. `maxDigits: 7` caps a single tender at
        99,999.99 rupees, which is the out-by-10 guard: blocking roughly halves that error class,
        and a post-hoc warning asks the operator to notice, re-read and compare — three
        literacy-dependent acts, under the most time pressure, with a customer waiting.
      */}
      <NumericKeypad value={entry} onChange={setEntry} max={9_999_999} maxDigits={7} />
    </section>
  );
};

/** Re-exported so a host can pre-validate a keystroke without importing the keypad. */
export { acceptKeystroke };
