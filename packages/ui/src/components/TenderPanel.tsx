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

/**
 * `02-F48` — the two ways a press can be worth nothing, as the WORD half of `27-F12`'s pair.
 *
 * Two captions and not one, because the two facts are different and a message that covered both
 * would have to be false about one of them (`00 §5.7`): `entered` is an empty pad against a real
 * bill, `due` is a real entry against an order with nothing billable. `27-F23`/`21 §5` — the same
 * short, unpunctuated, all-caps register every other caption on this surface uses, for an operator
 * population this product does not assume can read a sentence under time pressure.
 */
const REASON: Record<"entered" | "due", string> = {
  entered: "NOTHING ENTERED",
  due: "NOTHING DUE",
};

export const TenderPanel = ({ dueP, takenP = paisa(0), onTender }: TenderPanelProps) => {
  const color = useColor();
  const label = typography["text-label"];
  const [entry, setEntry] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  /**
   * `02-F48` — the last press asked to tender NOTHING, and this is the only thing that changes
   * about the control. See the button and the readout below; `nothing` is the reason, so a
   * message can never contradict the branch that produced it.
   */
  const [nothing, setNothing] = useState<"entered" | "due" | null>(null);
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
  /**
   * `02-F48` — **the amount this control is about to record**, named once because the ruling is
   * about that number and not about the pad.
   *
   * Two arms reach zero and they are genuinely different facts, which is why `nothing` carries
   * which one it was. **Nothing entered:** the pad is empty against a real bill, `coversBill` is
   * false and the tender is `enteredP` = 0 — the accidental tap. **Nothing due:** the order has no
   * billable lines, so `remainingP` is 0, `0 >= 0` makes `coversBill` true and the tender is the
   * REMAINDER, also 0 — the same permanent row down the opposite arm, reachable with digits on the
   * pad. A single "the entry is empty" message would be a false statement in that second case
   * (`00 §5.7`), and it is the one a first draft ships.
   */
  const tenderP = coversBill ? remainingP : enteredP;

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
        {/*
          `02-F48` — **THE REASON, IN THE SLOT THAT IS ALREADY THERE.**

          The FR says the surface owes the cashier the reason *"in `27-F12`'s shape — a word and a
          number — where she is already looking"*, and this readout sits directly above the control
          she just pressed. It is the SAME element in all three states: nothing is added, nothing is
          removed, and **no control moves** (`27-F4`) — which is the constraint that ruled out a
          sentence inserted above `TAKE`, since inserting one pushes the primary action down by its
          own height at the exact moment the cashier is reaching for it.

          It is also a duplicate removed rather than a line added: with an empty pad the caption
          read `REMAINING` over the same figure `DUE` was already showing one readout up — one fact,
          two sources, which is the `02-F45` shape. The resting state is untouched, though: this
          swaps in only after a press that tendered nothing, never before one.
        */}
        <Readout
          caption={nothing === null ? (coversBill ? "CHANGE" : "REMAINING") : REASON[nothing]}
        >
          <MoneyValue
            paisa={nothing === null ? (coversBill ? changeP : shortP) : paisa(0)}
            size={CHANGE_SIZE[mode]}
          />
        </Readout>

        {/*
          `02-F50` — **THE EXACT AMOUNT IS ONE PRESS, AND IT SHARES A ROW WITH `TAKE <METHOD>`.**

          `21 §4` makes settlement ≤ 4 taps a merge criterion and settling exactly cost SIX: the
          Pay tab, one press per digit, then `TAKE CASH` — for a number this panel was already
          holding. `27-F24` exists because ~60% of this population recognise numbers against
          **9.5% who can do any arithmetic**, and asking her to re-key a figure the machine has
          is that FR read backwards, on the counter's commonest settlement (~60 acts a shift).

          **Why a ROW and not another entry in the column, which is what a first draft reaches
          for.** `02-F50` forbids moving or re-ranking `TAKE <METHOD>` and the method row, so the
          target can only go BELOW the primary control — and a fourth 126 dp block in this column
          costs ~150 dp of height on a surface that already closes at 543 dp inside `27 §1a`'s
          10.1″ tablet's 567 dp work area. It would have taken Pay off the smallest glass this
          product ships to (`DEC-HW-001`), to buy a tap. Sharing the row costs nothing vertical:
          `MONEY_COLUMN_DP`'s `compact` floor of 480 leaves 236 dp each, well clear of `27-F8`.

          `TAKE <METHOD>` keeps the first position, so nothing is re-ranked (`27-F4`) and a
          cashier who learned to reach left still lands on it.
        */}
        <div style={{ display: "flex", gap: space["space-2"] }}>
          <button
            type="button"
            onClick={() => {
              // `01-F17` — a sale is never blocked. A PARTIAL tender is recorded as itself and the
              // remainder stays owed (`02-F13`'s split is this, repeated), so a short entry still
              // settles for what it is: this button refuses no SALE.
              //
              // `02-F48` — **and a tender of NOTHING is not one.** `01-F60` already reads `01-F17`
              // this way in the corpus's own words (*"forbids blocking a sale, not an item"*): a
              // Rs 0 `payment.recorded` moves no money, discharges no part of the bill and changes
              // no total, so there is no sale here to block. Without this the accidental tap wrote a
              // PERMANENT phantom settlement into `02-F23`'s reconciliation (`01-F1`).
              //
              // **`27-F5` is honoured by construction and this is where to check it:** the control
              // is not disabled, not greyed, not moved and not hidden — an inert primary control is
              // that FR's own failure mode, and `DEC-MONEY-009` already refused the greyed-button
              // shape on this exact surface. It is pressable in every state; what changes is that a
              // press worth nothing produces a REASON instead of an event, and never a modal
              // (`02-F37`: nothing goes between the cashier and the customer).
              //
              // **This is not the enforcement.** `main/zero-tender-guard.ts` refuses the same payload
              // on the trusted side of the bridge, because `18 §9` makes the renderer untrusted even
              // though we ship it; this is the half that tells the operator why. The two read one
              // number and cannot disagree.
              if (tenderP === 0) {
                setNothing(coversBill ? "due" : "entered");
                return;
              }
              setNothing(null);
              onTender({ amountP: tenderP, method });
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
              // Half the row, so the exact target beside it is the same size. `27-F8`'s keypad
              // target is a HEIGHT floor and both controls keep it; the width each has left on
              // `compact`'s 480 dp column is 236, which is nearly twice the 126 dp minimum.
              flex: 1,
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

          <button
            type="button"
            onClick={() => {
              /*
                `02-F50` — it tenders the **`02-F13` remainder**, never `dueP`. A bill part-paid
                by card and finished in cash is the ordinary split, not a mode, and a target
                wired to the gross total over-records every one of them into a ledger `01-F1`
                forbids correcting in place — `01-F30`'s conservation would then read the order
                as overpaid for the rest of time.

                `02-F48` is NOT bypassed, and that is the clause this branch exists for: *"a
                second route to the primary act must never be a route around the guard."* With
                nothing remaining this records nothing and states the reason, exactly as the
                keypad path does — the arm is `due` because the fact is that the order has
                nothing left to settle, which is what a wrong message here would be false about
                (`00 §5.7`).

                It does not consult the pad at all. `tenderP` is the pad's number; this control's
                number is the one on its own face, and the two must not be able to disagree
                (`27-F24` makes the printed figure the cashier's only check on the machine).
              */
              if (remainingP === 0) {
                setNothing("due");
                return;
              }
              setNothing(null);
              onTender({ amountP: remainingP, method });
              setEntry("");
            }}
            /**
             * **NEUTRAL, and that is a decision rather than an omission.**
             *
             * The comment on `TAKE <METHOD>` above defends the blue at length and its argument
             * binds here: `27-F14` allocates the accent to *"any control the operator may
             * press"*, and the product spends it on **exactly one control per surface** so that
             * `27-F5`'s *"persistent, visible, labelled target"* is legible at a glance. Two
             * saturated fills side by side would spend it on two, and blunt both.
             *
             * What marks this control instead is the thing `27-F18` ranks ABOVE colour: the
             * NUMBER. `27-F24` and `21 §5` put ~60% of this population at recognising numerals
             * against 9.5% who can do arithmetic and a large fraction who read no English at
             * all, so a tabular `Rs 1,010` at `text-numeric-primary` is the strongest signal
             * available here — and it is the requirement, not decoration: `02-F50` obliges the
             * control to **state the amount it will record**, so the cashier reads what she is
             * about to do instead of pressing a word and trusting it.
             *
             * The fill and border are the method row's, which is the other set of secondary
             * controls on this surface — one visual habit, not two (`27-F4`).
             */
            style={{
              flex: 1,
              minHeight: targetFor("keypad"),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: color["bgColor-surface-raised"],
              border: `1px solid ${color["borderColor-default"]}`,
              borderRadius: space["space-2"],
              cursor: "pointer",
            }}
          >
            <MoneyValue paisa={remainingP} size="primary" />
          </button>
        </div>
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
      {/*
        `02-F48` — a keystroke clears the reason, because the reason is about the entry as it was
        when the control was pressed. Leaving `NOTHING ENTERED` standing over a pad the cashier has
        started typing into would be a false statement one keystroke old (`00 §5.7`), and the
        readout has to be back to `CHANGE`/`REMAINING` before she presses again.
      */}
      <NumericKeypad
        value={entry}
        onChange={(next) => {
          setNothing(null);
          setEntry(next);
        }}
        max={9_999_999}
        maxDigits={7}
      />
    </section>
  );
};

/** Re-exported so a host can pre-validate a keystroke without importing the keypad. */
export { acceptKeystroke };
