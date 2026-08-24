import type { Paisa } from "@restos/domain";
import { useColor } from "../theme";
import { space, targetFor, typography } from "../tokens/index";
import { MoneyValue } from "./MoneyValue";
import { QuantityItemLine, type QuantityItemLineProps } from "./QuantityItemLine";

/**
 * One row of the cart as the operator must be able to READ it.
 *
 * `billedPaisa` is **required**, and that is the whole of `27-F24` applied to this surface: *"Every
 * total, change amount, **line total** and elapsed minute arrives as a finished number."* Until
 * August 2026 this component rendered `1 Chicken Biryani ✕ NO` and the only figure anywhere on the
 * cart was `TOTAL Rs 989`, so a cashier could not check her own work — the one number she is
 * accountable for was the one number no row explained. ~60% of this population recognise numbers
 * against 9.5% who can do any arithmetic, so "she can subtract to find out" is not a fallback.
 *
 * **Required rather than optional, on `shared/ipc.ts`'s own argument for `billed_paisa` one seam
 * over:** *"an optional money field is a number a host can decline to say while the screen goes on
 * treating its absence as a value."* An optional price here is a cart that renders priceless rows
 * again the moment a caller forgets one, which is exactly the defect this closes; making it
 * required means no arrangement of props produces the shipped bug. The value is the ENGINE's
 * `billedLinePaisa` carried across the IPC seam and is never re-derived on the way (`26 §8`).
 */
export type CartLineProps = QuantityItemLineProps & {
  id: string;
  /**
   * The fold's own billed value for THIS line, branded integer paisa. Never summed, never
   * multiplied and never re-derived here: `billedCellPaisa` carries `01-F30`'s exited-line rule
   * and `CONTESTED_LINE_BILLABLE`, and a screen that computed `qty × price` would disagree with
   * the total below it on precisely the rows that matter.
   */
  billedPaisa: Paisa;
  /**
   * **This line has left the bill, and the WORD that says so.**
   *
   * `27-F12` — colour never carries state alone, and direction is a word: *"a lone `-` is one
   * glyph wide, is the first thing lost at 1–2 m or on a scratched panel, and means nothing to a
   * non-reader."* A strike-through and a grey fill are both marks a scratched panel eats, so the
   * word is the load-bearing signal and the fill is the preattentive half — the same division
   * `Tile` makes for `selected` and `unavailable`, one file over.
   *
   * **ONE optional string rather than a boolean beside a word**, so there is no way to render the
   * fill without the word. Two props can be half-supplied; this one cannot.
   *
   * The caller supplies the word because `01 §4`'s state vocabulary is the kernel's and this
   * package is a closed vocabulary of PRESENTATION (`21-F1`, `18 §2`) — `Counter.tsx`'s
   * `offBillWord` derives it from the same projected `states` the fold zeroes the money from, so
   * the word and the `Rs 0` beside it cannot disagree.
   */
  offBill?: string | undefined;
};

/**
 * The cashier's working memory. Screen-map §3.1: **always visible, never a separate screen,
 * never collapsed.**
 *
 * `27-F5` forbids controls that change with context, and a cart that collapses is the same
 * failure in a different costume — the operator loses the thing she is reasoning about at the
 * moment she is interrupted, which on this counter is continuously (a queue, a ringing
 * phone, a beeping aggregator tablet, a waiter shouting a change).
 *
 * `27-F24` governs the total: it arrives **finished**. There is no subtotal the operator is
 * expected to add anything to, because ~60% of this population recognise numbers against
 * 9.5% who can do any arithmetic.
 *
 * ── WHAT A COMPED OR DISCOUNTED LINE SHOWS, WHICH IS A DECISION AND NOT AN OMISSION ──────────
 *
 * **Nothing. A comped line and a discounted line render exactly as live lines, at full price,
 * because that is what the customer owes today.** `merge.ts`'s `comp.recorded` and
 * `discount.recorded` arms are **projection-inert** — `DEC-MONEY-010` admits `01-F30`'s
 * `comp_value` and `discounts` terms only on an oracle-pinned merge rule in `26 §7`, and `26 §7`
 * says in terms that the rule is still owed — so the fold projects no per-line comp and no
 * per-line discount at all, and there is no honest source for a marker here.
 *
 * The tempting fix is to have the counter remember which lines it just comped and mark them. It
 * is refused: that fact is device-local, dies on the next reload, disagrees with every other till
 * in the branch, and would put a mark meaning *"money came off"* beside a bill that still carries
 * it — the precise misleading `LineCorrection`'s act tile exists to prevent (*"Recorded — the bill
 * does NOT change yet"*). A cart that lies about money is worse than a cart that is silent.
 *
 * **So the three acts are told apart by the MONEY, which is the only discriminator the ledger can
 * back:** a void reads `VOIDED  Rs 0` because the line exited and the fold zeroed it; a comp and a
 * discount read their full price because the bill did not move. What a cashier cannot yet see on
 * this surface is that a comp was recorded at all — a **named degradation** (`00 §5.7`) whose
 * blocker is the fold arm above, not this component.
 */
export type CartProps = {
  lines: readonly CartLineProps[];
  /**
   * Already computed, in **branded** integer paisa. The screen never does money arithmetic,
   * and now it cannot be handed a value that did not come from `domain` — the brand travels
   * with the number all the way from the fold to the glyph.
   */
  totalPaisa: Paisa;
  /**
   * **`16-F5`'s two figures, and they are present exactly when the LINE ROWS ABOVE DO NOT ALREADY
   * CARRY THE TAX.**
   *
   * The cart's money column is `billedLinePaisa` — the fold's per-line billed amount — and the
   * TOTAL below it is `01-F82`'s `billed_total`, *tax included and rounded*. Under `exclusive`
   * those are two different quantities, so a cart with only the two of them showed **rows adding
   * to Rs 853 under `TOTAL Rs 989`** with nothing on the surface naming the Rs 136 between them.
   * That is the defect `packages/escpos`'s `receipt-document.ts` names one plane over — *"a
   * receipt whose lines do not add up to its total is worse than one that asks the reader to
   * multiply"* — moved onto the glass.
   *
   * **The words are the receipt's, verbatim** (`Subtotal` / `Tax` / `Rounded up|down` / `Total`),
   * because a cashier and the customer holding the paper must not learn two vocabularies for one
   * decomposition — `03-F40`'s two sensor bit layouts is this corpus's own worked example.
   *
   * **ONE optional object rather than two optional figures**, on this file's own `offBill`
   * precedent: two props can be half-supplied and this one cannot, so no arrangement of props
   * renders a `Subtotal` with no `Tax` under it.
   *
   * **ABSENT means the rows above already carry whatever tax there is — it is not "no tax".**
   * Under `inclusive` the fold's per-line billed amount is the tax-INCLUSIVE price, so the money
   * column already sums to the total and a `Subtotal Rs 735` row beneath rows summing to Rs 853
   * would be a smaller number wearing a label that reads like their sum: the same
   * non-reconciliation this prop exists to remove, one row down. Under `none` there is no tax and
   * a `Tax Rs 0` row is a claim about a tax regime the org is not in — `receipt-document.ts`'s own
   * stated reason for printing nothing there. **The caller decides**, exactly as it supplies
   * `offBill`'s word: `16-F2`'s posture is the kernel's vocabulary and this package is a closed
   * vocabulary of PRESENTATION (`21-F1`, `18 §2`).
   *
   * ⚠ **WHAT THIS CANNOT CLOSE, MEASURED RATHER THAN GUESSED — `27-F23` DENIES THIS SCREEN
   * DECIMALS AND THE TAX GENUINELY HAS THEM.** `MoneyValue` renders through `rupeesFromPaisa`,
   * which truncates. Under `exclusive` at 16 % on three whole-rupee lines totalling Rs 853 the tax
   * is `13_648` paisa: the rows read `Subtotal Rs 853` + `Tax Rs 136` = Rs 989 and the total IS
   * Rs 989, but move the rate so the tax's sub-rupee part reaches half a rupee and the same three
   * rows read Rs 989 under a `TOTAL Rs 990`. **The residue is at most Rs 1 and it appears only
   * under `exclusive`**; `none` and `inclusive` close exactly at every step `02-F63` (c) admits,
   * because a whole-rupee step over whole-rupee prices makes every term a whole number of rupees.
   * The only fix is paisa on the glass, which `02-F63` (c) refuses by name and hands to doc 27 —
   * *"it is a `27-F23` act, it moves every money surface in the product"* — and `02-F63` (f) is
   * where the exact close already lives: the printed receipt, which may show `Rs 450.70`. Recorded
   * as a finding for doc 27, not fixed here.
   */
  tax?: { subtotalPaisa: Paisa; taxPaisa: Paisa } | undefined;
  /**
   * `02-F63` (b)'s rounding adjustment — a MAGNITUDE and the WORD for its direction.
   *
   * `27-F12`: *"a lone `-` is one glyph wide, is the first thing lost at 1–2 m or on a scratched
   * panel, and means nothing to a non-reader"*, so the direction is a word and it lives in the
   * LABEL — the same split `receipt-document.ts`'s `roundingRow` makes for paper, and the same two
   * words. An org that rounds to Rs 10 (R70: *"some restaurants round to 10s"*) moves a Rs 853
   * bill to Rs 850 **under posture `none` with no tax anywhere**, so this row is not a tax row and
   * is absent from the object above on purpose: the two terms have different presence conditions
   * and one bag would tie them together.
   *
   * **ABSENT means the row would carry no figure, which is a wider case than "no adjustment" and
   * is the whole reason this one may be optional where `billedPaisa` may not.** `Rounded up Rs 0`
   * is not a sentence anyone says (`roundingRow`'s precedent, and `varianceToken`'s), and `27-F23`
   * denies this screen decimals — so at `02-F63` (c)'s default step of 100, where the adjustment
   * is under a rupee by construction, EVERY taxed order would otherwise carry a row reading
   * `Rs 0`. The caller omits it when it would render zero, using the same `rupeesFromPaisa` this
   * component formats through, so an absent value and an unrenderable one are one statement and
   * there is no zero case here to get wrong. The signed number the fold produces reaches this
   * shape through `domain`'s `directedPaisa`, in the host's main process, so no sign ever crosses
   * onto the screen.
   */
  rounding?: { magnitudePaisa: Paisa; direction: "up" | "down" } | undefined;
  onRemove?: ((id: string) => void) | undefined;
};

/**
 * One labelled term standing between the cart's line rows and its TOTAL (`Subtotal`, `Tax`,
 * `Rounded up|down`).
 *
 * **Module-private and it stays that way.** `21-F1` makes this package a CLOSED vocabulary, and an
 * exported "row with a caption and a money figure" is a component a caller can put any word into —
 * which is how a second decomposition vocabulary appears beside the receipt's four words. The words
 * are spelled at the two call sites below, where they can be read against the total they explain.
 *
 * It renders at `MoneyValue`'s default `body`, deliberately not at the TOTAL's `hero`: `27-F25`
 * gives the REGION's payload to the largest element, and a subtotal competing with the one figure
 * the cashier quotes would spend that hierarchy on a term she is not asked to act on. It is the
 * same size the line totals above it use, which is what makes the column read as a column.
 */
const ChargeRow = ({ label, paisa }: { label: string; paisa: Paisa }) => {
  const color = useColor();
  const type = typography["text-label"];
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
      <span
        style={{
          fontFamily: type.fontFamily,
          fontSize: type.fontSize,
          // `fgColor-muted`, not `fgColor-default`: these terms EXPLAIN the total and must not
          // compete with it or with a dish name. It is a foreground token on a foreground
          // property (`27-F40`) and `discipline.test.ts` holds it AA against every surface, so
          // the step down is a hierarchy step and never a legibility trade.
          color: color["fgColor-muted"],
        }}
      >
        {label}
      </span>
      {/* `27-F16` again: a subtotal, a tax and a rounding adjustment are all EXPECTED figures. */}
      <MoneyValue paisa={paisa} />
    </div>
  );
};

export const Cart = ({ lines, totalPaisa, tax, rounding, onRemove }: CartProps) => {
  const color = useColor();
  const label = typography["text-label"];
  return (
    <section
      aria-label="Current order"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: space["space-3"],
        padding: space["space-4"],
        background: color["bgColor-surface-raised"],
        border: `1px solid ${color["borderColor-default"]}`,
        borderRadius: space["space-2"],
        minWidth: 320,
      }}
    >
      {lines.length === 0 ? (
        <span style={{ color: color["fgColor-muted"], fontFamily: label.fontFamily }}>
          Nothing added yet
        </span>
      ) : (
        lines.map(({ id, billedPaisa, offBill, ...line }) => (
          <div
            key={id}
            style={{ display: "flex", alignItems: "flex-start", gap: space["space-2"] }}
          >
            <div
              style={{
                flex: 1,
                // The item and its money are ONE box, so the money travels with the dish when the
                // row wraps and the off-bill fill covers both. Nothing here touches
                // `QuantityItemLine`: `27-F57` binds the QUANTITY to the name and this column sits
                // outside that pair entirely, which is why the price may be right-aligned and the
                // quantity may never be.
                display: "flex",
                alignItems: "flex-start",
                gap: space["space-2"],
                ...(offBill === undefined
                  ? {}
                  : {
                      // `Tile`'s `unavailable` treatment, verbatim — the vocabulary this platform
                      // already ships for "this is not live", and the one a cashier has already
                      // met on `LineCorrection`'s picker where a voided dish reads
                      // `1 × Raita / Rs 0 / already voided`. A second vocabulary for one fact is
                      // `03-F40`'s two sensor bit layouts wearing a cart row.
                      background: color["bgColor-surface-sunken"],
                      // Cascades onto the quantity and the name, which set no colour of their own.
                      // The modifier, note and removal rows all set their own and are untouched —
                      // a removal is an allergen fact and must not be dimmed by a money state.
                      color: color["fgColor-disabled"],
                      // `27-F66` — the elevation fills sit ~1.1:1 apart and cannot carry
                      // perceivability on their own, so the fill takes an independent mark. The
                      // neutral boundary for a neutral fill (`27-F64`); this is not a status
                      // surface and must not spend `27-F14`'s three-colour budget.
                      border: `1px solid ${color["borderColor-default"]}`,
                      borderRadius: space["space-1"],
                      padding: space["space-1"],
                    }),
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <QuantityItemLine {...line} />
              </div>
              {/*
                `27-F24`'s line total. `flexShrink: 0` and `nowrap` deliberately: the cart lives in
                a fixed column ~555 dp wide and the NAME is the elastic half — a price squeezed to
                `Rs 4` `50` on a long dish name is the one element on this row that must never
                reflow, because it is the figure the cashier is checking.

                Size `body` is not a default falling through: it is what `LineCorrection`'s picker
                renders a per-line price at, and `27-F25` gives the REGION's payload to the total
                below at `hero`. A line total at 28 dp would compete with the dish name beside it
                and with the one number this region exists to deliver.

                ⚠ **`primary` (28 dp) WAS MEASURED, NOT ARGUED AWAY, AND THE NUMBERS ARE THE
                REASON IT IS NOT USED.** `27-F27`'s own ISO 9241-303 derivation is the case FOR it:
                16 dp is a ~1.8 mm cap, which at a 55 cm counter is ~11 arcmin — under that
                standard's 16-arcmin minimum — where 28 dp gives ~19.6. That FR scopes
                cap-millimetres to **KDS**, so adopting it here would be a new reading of `27-F25`,
                and `layout:check` prices the reading: at 28 dp the name loses ~8 more characters
                before it wraps, and with a 37-character dish name the sweep goes from 8 new
                verdicts to 29, adding `netbook-1024 caller` to the list. Recorded as a finding for
                doc 27 rather than taken here.

                ⚠ **WHAT THIS COLUMN COSTS, MEASURED — a finding, not a defect in this file.** The
                money is `flexShrink: 0`, so the NAME is the elastic half and wraps ~4 characters
                sooner than it did before this column existed (~22 rather than ~26 at
                `counter-1366`). A wrapped row is taller, and `tablet-10.1`'s **caller** surface
                has no vertical slack to give: with a 37-character dish name it overruns `main` by
                **17 px** (`8dp / -3dp` of slack) — 1 overflow against 0 for the same fixture with
                this column deleted. At the fixture's real 21-character name every panel is clean
                and the sweep is byte-identical to the tree before this change. So a pilot that
                names a dish longer than ~22 characters clips the phone-order surface on a 10.1″
                tablet. The remedy is that surface's vertical budget, not a smaller line total.
              */}
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: space["space-2"],
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                {offBill === undefined ? null : (
                  <span
                    style={{
                      fontFamily: label.fontFamily,
                      fontSize: label.fontSize,
                      // 600 rather than the token's 500: the word is the only signal on this row
                      // that survives a scratched panel and a greyscale render (`27-F13`), and it
                      // is competing with a numeral at 16 dp beside it.
                      fontWeight: 600,
                      color: color["fgColor-disabled"],
                    }}
                  >
                    {offBill}
                  </span>
                )}
                {/* 27-F16: not `abnormal`. `Rs 0` on a voided line is the EXPECTED value for that
                    line, and colouring a number means "this number is abnormal" — spending the
                    preattentive channel on the case the word already names. */}
                <MoneyValue paisa={billedPaisa} />
              </div>
            </div>
            {onRemove ? (
              <button
                type="button"
                aria-label={`Remove ${line.name}`}
                onClick={() => onRemove(id)}
                style={{
                  // 27-F9 — destructive, so it is visually separated from the item body and
                  // never sits where a wet hand lands while scanning the list. Removal
                  // pre-KOT is a plain event; post-KOT it must be a void with an approver
                  // (01 §4), which is a different control on a different surface entirely.
                  // Was a raw 44 — BELOW the 48 dp absolute floor, on a destructive control.
                  // Caught by the adversarial pass; a raw pixel number here is exactly what
                  // TOKENS.md bans, and it is why the ban exists.
                  minWidth: targetFor("floor"),
                  minHeight: targetFor("floor"),
                  marginLeft: space["space-4"],
                  background: "transparent",
                  // fgColor-, not bgColor- — the role prefix exists to say which property a
                  // token belongs to, and using a fill as a foreground silently breaks that.
                  color: color["fgColor-status-fault"],
                  border: `1px solid ${color["fgColor-status-fault"]}`,
                  borderRadius: space["space-1"],
                  cursor: "pointer",
                  // The word has to fit beside the mark on the smallest panel this ships to, and
                  // the label typography is what every other control on this surface uses.
                  fontFamily: label.fontFamily,
                  fontSize: label.fontSize,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {/*
                  `27-F5` requires "a persistent, visible, **labelled** target". The `aria-label`
                  above is a label to a screen reader and not to a cashier, so it does not
                  discharge the FR on its own — and this control shipped as a bare `×` until
                  August 2026, which is a pictogram carrying the meaning alone (`27-F60`, and
                  `27 §2b` records that no Pakistan-specific pictogram comprehension data exists).

                  The word is `NO` because it is already this platform's word for a removal, in
                  both places one appears: `QuantityItemLine` renders `✕ NO <name>` two files over,
                  and `packages/escpos`'s KOT uses `REMOVAL_MARKER = "NO"` with the reason stated.
                  A cashier and a cook must not learn two words for one act — `03-F40`'s two
                  sensor bit layouts is this corpus's own worked example of what one fact with two
                  readings costs. Reading down the row, `NO` + `1 Coke` is the sentence the cook
                  gets on the chit.

                  `aria-hidden` on the mark for the same reason it is hidden on the removal band:
                  the accessible name is the `aria-label`, and a glyph read aloud as "multiplication
                  sign" is noise on top of it.
                */}
                <span aria-hidden="true">{"✕"}</span> NO
              </button>
            ) : null}
          </div>
        ))
      )}

      {/*
        ── THE TERMS BETWEEN THE ROWS AND THE TOTAL, IN ONE BOX WITH IT ────────────────────────

        The rule and its consequence: what the money column above does NOT already carry gets a
        LABELLED ROW, and nothing else does. `Subtotal`/`Tax` arrive together or not at all
        (`tax`); the rounding row arrives when there is an adjustment (`rounding`); a `Tax Rs 0`
        row on every untaxed order and a `Rounded up Rs 0` row on every whole-rupee one are the
        noise `27-F55`'s argument bans from paper, and this surface has less room than paper.

        ⚠ **ONE bordered box rather than free siblings, and it was NOT a styling choice.** The
        rule is placed once, between what was RUNG and what it COMES TO; rows dropped in above
        the old border would read as cart lines with odd names, which is how a `Subtotal` row
        becomes a dish. The inner `gap` is one step tighter than the section's so the block reads
        as one statement and the line list above it stays the coarser rhythm.
      */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: space["space-2"],
          paddingTop: space["space-3"],
          borderTop: `1px solid ${color["borderColor-default"]}`,
        }}
      >
        {tax === undefined ? null : (
          <>
            <ChargeRow label="Subtotal" paisa={tax.subtotalPaisa} />
            <ChargeRow label="Tax" paisa={tax.taxPaisa} />
          </>
        )}
        {rounding === undefined ? null : (
          // `27-F12` — the direction is a WORD and it lives in the LABEL, which is exactly where
          // `receipt-document.ts`'s `roundingRow` puts it for paper, in these same two words. A
          // sign in front of the figure is the one glyph a scratched panel eats first.
          <ChargeRow
            label={rounding.direction === "up" ? "Rounded up" : "Rounded down"}
            paisa={rounding.magnitudePaisa}
          />
        )}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontFamily: label.fontFamily, fontSize: label.fontSize }}>TOTAL</span>
          {/* 27-F16: not coloured. Colour on a number means "this number is abnormal", and the
              total is the commonest number on the screen — colouring it would spend the whole
              preattentive channel on the base case. */}
          <MoneyValue paisa={totalPaisa} size="hero" />
        </div>
      </div>
    </section>
  );
};
