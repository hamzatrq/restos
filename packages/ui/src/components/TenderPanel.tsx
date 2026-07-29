import { PAYMENT_METHODS, type Paisa, type PaymentMethod, paisa, subPaisa } from "@restos/domain";
import { useState } from "react";
import { useColor } from "../theme";
import { space, targetFor, typography } from "../tokens/index";
import { MoneyValue } from "./MoneyValue";
import { acceptKeystroke, NumericKeypad } from "./NumericKeypad";

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

export const TenderPanel = ({ dueP, takenP = paisa(0), onTender }: TenderPanelProps) => {
  const color = useColor();
  const label = typography["text-label"];
  const [entry, setEntry] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");

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
    <section
      aria-label="Take payment"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: space["space-4"],
        padding: space["space-4"],
        background: color["bgColor-surface-raised"],
        border: `1px solid ${color["borderColor-default"]}`,
        borderRadius: space["space-2"],
        minWidth: 360,
      }}
    >
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontFamily: label.fontFamily, fontSize: label.fontSize }}>DUE</span>
        <MoneyValue paisa={remainingP} size="primary" />
      </header>

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
        27-F29 — impossible numbers are blocked AT ENTRY. `maxDigits: 7` caps a single tender at
        99,999.99 rupees, which is the out-by-10 guard: blocking roughly halves that error class,
        and a post-hoc warning asks the operator to notice, re-read and compare — three
        literacy-dependent acts, under the most time pressure, with a customer waiting.
      */}
      <NumericKeypad value={entry} onChange={setEntry} max={9_999_999} maxDigits={7} />

      {/*
        27-F24/F25 — the computed number is the largest element in its region, because it is the
        operational payload and the one the cashier reads aloud. 27-F12: the direction is a WORD.
      */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontFamily: label.fontFamily, fontSize: label.fontSize }}>
          {coversBill ? "CHANGE" : "REMAINING"}
        </span>
        <MoneyValue
          paisa={coversBill ? changeP : shortP}
          size="hero"
          {...(coversBill ? { direction: "change" as const } : {})}
        />
      </div>

      <button
        type="button"
        onClick={() => {
          // 01-F17 — a sale is never blocked. A PARTIAL tender is recorded as itself and the
          // remainder stays owed (02-F13's split is this, repeated), so the one thing this
          // button never does is refuse.
          onTender({ amountP: coversBill ? remainingP : enteredP, method });
          setEntry("");
        }}
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
    </section>
  );
};

/** Re-exported so a host can pre-validate a keystroke without importing the keypad. */
export { acceptKeystroke };
