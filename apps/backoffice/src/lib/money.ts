/**
 * Rupees in, paisa out — **the one place in this app where a rounding bug becomes permanent.**
 *
 * Commandment 3 and `00 §6`: money is integer paisa everywhere. An owner types rupees, because
 * `27-F23` says no sub-rupee unit circulates and the decimal point is the highest-consequence
 * keystroke there is. So exactly one conversion exists, it lives here, and `01-F53` freezes
 * whatever it produces into every order line the price is ever read for.
 *
 * **The conversion is STRING SURGERY, not `× 100`, and that is the point rather than a trick.**
 * `DEC-MONEY-005` bans raw arithmetic on money and `domain` owns the helpers — but `domain` has
 * `rupeesFromPaisa` for the DISPLAY direction and nothing for the input direction, and
 * `packages/domain` is a protected path this task may not widen. Appending two zeros to a digit
 * string is exact by construction: there is no multiply, so there is no float, so there is no
 * rounding step for a bug to live in. `Number("450" + "00")` is 45000 for every input this
 * accepts, and the same trick reads the low two digits back out.
 *
 * ⚠ **PINNED INTERPRETATION, not a specified one.** This refuses a decimal point outright, so
 * `450.50` is a REFUSAL rather than 45050 paisa. `27-F23` bans decimals on operational screens and
 * says no sub-rupee unit circulates; it does not say what a back-office price INPUT accepts, and
 * `16-F5`'s "integer paisas; rounding rules per authority spec" is a ledger rule, not an input
 * one. Refusing is the conservative reading — an owner who meant 450 and typed 450.5 is told, and
 * the alternative silently prices an item at four hundred and fifty and a half rupees forever.
 * Reported as an FR ambiguity rather than settled here.
 */

import { paisa, rupeesFromPaisa } from "@restos/domain";
import { money } from "@restos/ui/tokens";
import { strings } from "./strings";

/** The wire's ceiling (`CatalogEntryWire.prices[].price_paisa`), restated so the refusal is local. */
const MAX_PAISA = 2 ** 53 - 1;

/** Digits only, at least one. No sign: `01-F17`'s money has no sign, and a price least of all. */
const WHOLE_RUPEES = /^\d+$/;

export type RupeeParse =
  | { readonly ok: true; readonly price_paisa: number }
  | { readonly ok: false; readonly reason: string };

/**
 * A human's rupee entry → integer paisa.
 *
 * `""` is NOT a zero and never reaches here as one — an empty cell is *missing*, which is
 * `price-grid.ts`'s distinction and the whole of `01-F60`'s free-modifier rule. This refuses it
 * so a caller that skipped that check cannot turn a forgotten channel into a free item.
 *
 * **Every `reason` below is a sentence an OWNER reads** — `14-F29`'s grid renders it at the cell
 * and `entry-editor.tsx` restates it beside the control he pressed. They therefore live in the
 * string catalog (`00 §5.6`, `14-F38`) and not here: this file's four sentences named `27-F23`,
 * `27-F22` and their reasoning, which is our filing system rendered at a restaurant owner. The
 * citations survive in `strings.ts`'s comments beside each one, which is where `14-F38` puts them.
 */
export const paisaFromRupees = (input: string): RupeeParse => {
  const text = input.trim();
  if (text === "") return { ok: false, reason: strings.grid.reasonNoPrice };
  if (text.includes(".") || text.includes(",")) {
    return { ok: false, reason: strings.grid.reasonNotWhole };
  }
  if (!WHOLE_RUPEES.test(text)) return { ok: false, reason: strings.grid.reasonNotNumber };

  // Two zeros appended, never a multiply. `Number` of a digit string is exact below 2^53.
  const price_paisa = Number(`${text}00`);
  if (!Number.isSafeInteger(price_paisa) || price_paisa > MAX_PAISA) {
    return { ok: false, reason: strings.grid.reasonTooLarge };
  }
  return { ok: true, price_paisa };
};

/**
 * Paisa's digits, left-padded so the low two are always readable. `0` → `"000"`, whose last two
 * are `"00"` — a free item is exactly representable in rupees and must read as such.
 */
const digitsOf = (value: number): string => String(value).padStart(3, "0");

/**
 * Is this paisa value expressible in the whole rupees the editor accepts?
 *
 * `false` means the cell CANNOT round-trip, and the editor says so rather than showing a
 * truncated number an owner would save back. Silently rendering 45050 as `450` and writing 45000
 * on save is a five-rupee price cut nobody typed — the exact class of permanent, invisible loss
 * `01-F53` makes irreversible.
 */
export const isWholeRupees = (value: number): boolean => digitsOf(value).slice(-2) === "00";

/**
 * Paisa → the rupee TEXT an input field shows. Inverse of `paisaFromRupees` on every value where
 * `isWholeRupees` holds, which is the property the suite pins.
 */
export const rupeeTextFromPaisa = (value: number): string => {
  const whole = digitsOf(value).slice(0, -2);
  // Strip the pad's leading zeros, keeping the last digit so `0` stays `"0"` and not `""`.
  return whole.replace(/^0+(?=\d)/, "");
};

/**
 * `27-F23` — `Rs`, symbol-first, Western 3-digit grouping, no decimals. The symbol comes from the
 * doc-27 token manifest (`18 §7`: web consumes `packages/ui`'s TOKENS, not its components), and
 * the paisa→rupee divide is `domain`'s, because `DEC-MONEY-005` bans this file doing it.
 */
export const formatPaisa = (value: number): string => {
  const { rupees } = rupeesFromPaisa(paisa(value));
  return `${String(money["money-symbol"])} ${rupees.toLocaleString("en-US")}`;
};
