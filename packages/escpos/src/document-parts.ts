/**
 * The parts every `03-F31` document type shares: the money token, the wall clock, the group
 * break, the reprint band, the owner note and the tail.
 *
 * **This file exists for the reason `simulate.ts` exists — ONE interpretation, not two.** The
 * package guide states it about the byte→page walk and the argument is identical here: two
 * renderings of one scalar diverge, and then a figure looks right on the shift slip and wrong on
 * the receipt, or a chit and a receipt for the same order disagree about what time it was. Every
 * helper below was previously private to `cash-documents.ts` (money, rows, band, note, tail) or to
 * `document.ts` (the wall clock); the receipt is the second consumer of all of them, and a second
 * consumer is exactly when a private helper has to become a declared one (`18 §2`).
 *
 * **`03-F30` purity binds everything here.** Nothing reads a clock, a timezone, a locale or any
 * module state — "identical `(spec, profile, data, caps)` must produce byte-identical output on
 * Electron and React Native". That bans `Intl` and `toLocaleString` as firmly as it bans `Date`:
 * a Hermes build without full ICU answers `"99999999"` where Electron answers `"99,999,999"`, and
 * `Intl.DateTimeFormat` with an explicit `timeZone` silently falls back to UTC there. So the
 * grouping and the civil-date arithmetic below are both hand-rolled integer maths.
 */

import type { OrderChannel, PaymentMethod } from "@restos/domain";
import { directedPaisa, rupeesAndPaisaFromPaisa } from "@restos/domain";
import type { EncoderPart } from "./encoder.js";

// ── the money token (27-F22, 27-F23) ─────────────────────────────────────────────────────────────

/**
 * `27-F23`: "`Rs`, symbol-first … **Not `₨`, not `PKR` in staff UI**." One space after it, so a
 * six-digit figure and a two-digit figure begin at the same offset from their label.
 */
const MONEY_SYMBOL = "Rs";

/**
 * Western 3-digit grouping, hand-rolled for `03-F30`'s reason (see the file header).
 *
 * `27-F23`: "CLDR gives `ur`/`en-PK` the `#,##0.###` pattern — Pakistan does **not** inherit lakh
 * grouping." `27-F22`: Western digits, which is what `String(n)` produces and what no locale can
 * be asked to change here.
 */
const grouped = (whole: number): string => {
  const digits = String(whole);
  let out = "";
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ",";
    out += digits[i];
  }
  return out;
};

/**
 * A NON-NEGATIVE money magnitude, as `27-F23` renders it.
 *
 * Routed through `directedPaisa` rather than `rupeesFromPaisa` directly because that is the one
 * call that hands back a BRANDED magnitude (`DEC-MONEY-005`: the paisa→rupee divide is `domain`'s,
 * never a formatter's), and because it refuses a non-integer at the boundary.
 *
 * ⚠ **THE SENTENCE THAT STOOD HERE CLAIMED A PROTECTION THIS FUNCTION DID NOT HAVE, AND IT IS
 * CORRECTED RATHER THAN DELETED (August 2026, `02-F63`).** It read: *"and because it refuses a
 * non-integer at the boundary instead of printing a fraction of a rupee onto a document a cashier
 * signs."* The first half is true — `directedPaisa` refuses a non-integer number of **paisa**. The
 * second half was false of the very thing it named: a fraction of a rupee was not refused, it was
 * **dropped**, because `rupeesFromPaisa` truncates. That was inert for the life of the product
 * (`14-F29` prices are whole rupees, so every pre-tax total was whole) and became a customer-facing
 * defect the moment an `exclusive` posture put paisa in a total — `Subtotal Rs 450 · Tax Rs 74 ·
 * Total Rs 525`, three rows that do not close. It is kept because a comment promising a protection
 * that does not exist is worse than no comment: it retires the assertion the next session would
 * otherwise write, and this repo has shipped that mistake three times.
 *
 * **What it does NOW, and the class it does NOT close.** It renders the sub-rupee part when there
 * is one and omits it when there is not (`Rs 450.70`, `Rs 450`) — `02-F63` (f): `27-F23`'s *"no
 * decimals"* is scoped to operational SCREENS and paper is not one. **The conditional is a
 * DECLARED INTERPRETATION** (`24 §3b`); the named alternative is always two decimals, refused
 * because `27-F55` makes paper carry LESS, because `03-F36` bans the right-aligned money column
 * that would be the only reason to pad, and because every whole-rupee document in this package —
 * which after `02-F63` is every operational one, since the CHARGE is rounded — then stays
 * byte-identical. **What this does not close: it does not make a figure round.** `02-F63` rounds
 * the charge one layer up, in `packages/sync-client`'s `billedTotalPaisa`; this function only stops
 * lying about whatever it is handed, and handed an unrounded total it will faithfully print one.
 */
export const amountToken = (magnitude_paisa: number): string => {
  const { magnitudePaisa } = directedPaisa(magnitude_paisa);
  const { rupees, paisa_remainder } = rupeesAndPaisaFromPaisa(magnitudePaisa);
  const sub = paisa_remainder === 0 ? "" : `.${String(paisa_remainder).padStart(2, "0")}`;
  return `${MONEY_SYMBOL} ${grouped(rupees)}${sub}`;
};

/**
 * `27-F12` — direction is a WORD, never a minus sign and never a colour alone: "a lone `-` is one
 * glyph wide, is the first thing lost at 1–2 m or on a scratched panel, and means nothing to a
 * non-reader". The vocabulary is `MoneyValue`'s, so the counter and the paper say the same word
 * about the same fact; `domain` deliberately owns only the arithmetic sign.
 *
 * A variance of exactly zero carries no word — "OVER Rs 0" is not a thing anyone says, and a
 * clean drawer is the ordinary case the document that uses this exists to certify.
 */
export const varianceToken = (signed_paisa: number): string => {
  const { magnitudePaisa, sign } = directedPaisa(signed_paisa);
  // ONE money token, through `amountToken` — this used to re-spell the format inline, which is the
  // two-interpretations defect this file's header exists to prevent and which would have left the
  // shift slip truncating after `02-F63` fixed the receipt. The magnitude comes from
  // `directedPaisa` and never from `signed < 0 ? -signed : signed`, which `money.ts` names as the
  // display-edge idiom that hides a negation from the `DEC-MONEY-005` ban.
  const amount = amountToken(magnitudePaisa);
  if (sign === 1) return `OVER ${amount}`;
  if (sign === -1) return `SHORT ${amount}`;
  return amount;
};

// ── the wall clock (27-F62, 01-F46) ──────────────────────────────────────────────────────────────

/**
 * `27-F62`'s stamp as a wall clock, and the reason it is integer arithmetic rather than `Date`.
 *
 * `01-F46` anchors the business to Asia/Karachi ("the timezone anchor is not configurable"), which
 * has been a fixed UTC+5 with no daylight saving since 2009 — so the offset is a constant and not a
 * zone lookup. `Date`, `Intl` and `toLocale*` all read the HOST's zone and locale, and `03-F30`
 * makes byte-identity across an Electron POS and an RN handheld a law: a chit formatted through the
 * reading device's zone is two different tickets for one order.
 *
 * **A DECLARED divergence from `domain`'s `businessDate`, which uses ICU and therefore gets
 * Pakistan's 2008–2009 DST summers right where this does not.** That is the trade `document.ts`
 * already made when `clockOf` was written and it is kept, not re-opened: `domain` runs in one
 * process and may depend on ICU, and this package must produce the same bytes on Hermes.
 */
const KARACHI_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;

const MS_PER_DAY = 86_400_000;

/**
 * `03-F3` asks the KOT layout for a "timestamp" and states no format; `27-F55` says the chit must
 * carry LESS, so this is the hour and minute the line was appended and no date. DECLARED
 * INTERPRETATION (`24 §3b`) — the named alternative is a date-and-time stamp, rejected because a
 * KOT is read minutes after it is cut and the date costs a channel-3 group for a fact nobody on the
 * line uses. **A receipt takes the opposite decision for the opposite reason — see `dateOf`.**
 */
export const clockOf = (branch_created_at: number): string => {
  const minute_of_day = Math.floor((branch_created_at + KARACHI_UTC_OFFSET_MS) / 60_000) % 1440;
  const hours = Math.floor(minute_of_day / 60);
  return `${String(hours).padStart(2, "0")}:${String(minute_of_day % 60).padStart(2, "0")}`;
};

/**
 * The civil date in Asia/Karachi as `YYYY-MM-DD`, by integer arithmetic on days-since-epoch.
 *
 * `02-F15` requires "date/time" on a receipt where `03-F3` asked the KOT only for a "timestamp",
 * and the difference is the document's LIFETIME: a chit is read minutes after it is cut and
 * destroyed the same night (`03-F44`), while a receipt is what a customer brings back for
 * `02-F36`'s refund and what `02-F10`'s recall is searched by. A time with no date on a kept
 * document is a fact that stops being usable the next morning.
 *
 * This is the CALENDAR date, not `01-F46`'s BUSINESS date, and the two differ for every sale rung
 * between midnight and the 05:00 cutover. `02-F15` says "date/time" — the moment of the
 * transaction, which is what a customer holding the paper at 01:30 read off the clock on the wall.
 * The business date is a reporting key (`02-F24`, `shift_cash`) and putting it here would print
 * "yesterday" on a receipt handed over after midnight.
 */
export const dateOf = (branch_created_at: number): string => {
  const days = Math.floor((branch_created_at + KARACHI_UTC_OFFSET_MS) / MS_PER_DAY);
  // Howard Hinnant's `civil_from_days`, shifted to a 1 March epoch so the leap day lands at the
  // end of the cycle and no month-length table is needed. Pure integer arithmetic — no `Date`.
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

// ── labels: English words for kernel identifiers (00 §5.6) ───────────────────────────────────────

/**
 * `00 §5.6` — the interface language is English. `khata_credit` is an identifier, not a word, and
 * `01-F54`'s degrade-to-identifier path is for a MISSING label, never the ordinary one.
 *
 * Derived from `PAYMENT_METHODS`' own order (`27-F4`: an order a reader learns is an order that
 * stays), and exhaustive by the `Record` type — a sixth tender fails to compile here rather than
 * printing a document that silently omits a bucket.
 */
export const METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  cash: "Cash",
  card: "Card",
  raast: "Raast",
  khata_credit: "Khata credit",
  aggregator_receivable: "Aggregator receivable",
};

/**
 * `02-F42`'s closed channel set as English words.
 *
 * `whatsapp` is labelled **WhatsApp**, which is where AGENTS.md's open question (`02-F1` writes
 * "WhatsApp", `02-F42` writes `whatsapp`) actually resolves: the KEY is the kernel enum and the
 * LABEL is the product's name, and neither has to move for both to be right.
 */
export const CHANNEL_LABELS: Readonly<Record<OrderChannel, string>> = {
  counter: "Counter",
  phone: "Phone",
  storefront: "Storefront",
  whatsapp: "WhatsApp",
  foodpanda: "Foodpanda",
};

/** `02-F45`'s null attribution, said out loud rather than left as a blank. */
export const UNATTRIBUTED = "NOT ATTRIBUTED";

/** `00 §5.7` — a fact this device does not hold, named rather than printed as a zero or a blank. */
export const NOT_RECORDED = "NOT RECORDED";

/**
 * `00 §5.7` — a fact the ledger DOES hold and this document cannot ADD UP, which is a different
 * statement from `NOT_RECORDED` and must not be said with the same words.
 *
 * ⚠ **IT EXISTS BECAUSE `day_summary` WAS MAKING THE STRONGER CLAIM AND IT HAD BECOME FALSE.**
 * That document printed `Voids/comps/discounts NOT RECORDED` on the reasoning that `01 §4` had no
 * such event at all. `packages/domain/src/registry.ts` has carried payload schemas for
 * `void.recorded`, `comp.recorded` and `discount.recorded` since `plans/v0.md` gap 1 landed and
 * `apps/pos-electron` emits all three with actor and approver — reproduced on a real device store
 * beside a slip still reading NOT RECORDED. What is genuinely absent is the PROJECTION:
 * `merge.ts`'s three arms are projection-inert while `DEC-MONEY-010`'s gate condition (iii) is
 * unmet, so `01-F30`'s `void_value`, `comp_value` and `discounts` terms do not exist and there is
 * no number to print. The acts are recorded; this slip cannot total them, and now says so.
 *
 * **Twelve columns, exactly as `NOT_RECORDED` is, and that is load-bearing rather than a
 * coincidence.** `min-columns.ts` derives `day_summary`'s floor from `Voids/comps/discounts` +
 * this word, so a longer one moves a `03-F49` floor — which is a spec act and not a wording
 * choice. `RECORDED, NOT TOTALLED` was the clearer sentence and it is 21 columns: it would take
 * the floor from 34 to 43 and make the day summary unprintable on the 42-column heads `03-F49`
 * already contemplates.
 */
export const NOT_TOTALLED = "NOT TOTALLED";

// ── line construction ────────────────────────────────────────────────────────────────────────────

/**
 * One `label value` row, and `03-F36` is why there is exactly ONE space between them.
 *
 * The FR bans "space-as-layout (it makes a document permanently unreflowable)" alongside absolute
 * dot positioning, and a right-aligned money column is that ban's central case: the padding is
 * computed from a width the block renderer is not given (`BlockRenderer` takes data and slots, not
 * columns — deliberately, since `03-F30` makes the render pure over `(spec, profile, data, caps)`
 * and a block that reflowed itself would be a fourth input).
 *
 * `27-F57` supplies the comprehension half of the same answer for the same readers: a value read
 * in a distant column is the mapping step where comprehension collapses (decode ~71%, execute
 * ~35%). So the value sits immediately right of its label, exactly as the KOT's quantity sits
 * immediately left of its item.
 */
export const row = (label: string, value: string): readonly EncoderPart[] => [
  { kind: "text", value: `${label} ${value}`, ink: "normal" },
  { kind: "feed", lines: 1 },
];

/** `27-F58`'s group separator: "Groups are separated by **blank lines, not rules**." */
export const GROUP_BREAK: EncoderPart = { kind: "feed", lines: 2 };

/**
 * `03-F37`'s mandatory reprint marker, in a locked region and declaring no slot — so it is
 * unsuppressible rather than merely unsuppressed (`03-F33` puts owner content only outside a
 * locked block and `03-F34` refuses any document that breaks that). `27-F56` gives it the
 * document's ONE inverted banner.
 *
 * "Reprints are already a named fraud vector — the paper must say so", and that is sharper on a
 * money document than on a chit: a second copy of a close slip is a second signature surface, and
 * a second copy of a receipt is `02-F16`'s own named vector.
 */
export const reprintBand = (reprint: boolean): readonly EncoderPart[] =>
  reprint
    ? [
        { kind: "text", value: "REPRINT", ink: "inverted", scope: "banner" },
        { kind: "feed", lines: 1 },
      ]
    : [];

/**
 * An owner note. `user_text`, not `text`, on `document.ts`'s stated precedent: a note typed into
 * doc 14's editor is DATA, not one of `00 §5.6`'s English interface strings, so an Urdu footer
 * refuses `raster_font_unavailable` (`03-F8`'s July 2026 ruling — the raster text path is unwalked
 * until a font and a shaping engine are chosen) rather than `non_ascii_system_text`, which would
 * claim the platform's own English is broken and is permanent.
 */
export const ownerNote = (value: string): readonly EncoderPart[] => [
  { kind: "user_text", value },
  { kind: "feed", lines: 1 },
];

/** `27-F55`'s channel 3, and `03 §7`'s `has_cutter` handled inside the encoder. */
export const TAIL: readonly EncoderPart[] = [{ kind: "feed", lines: 2 }, { kind: "cut" }];
