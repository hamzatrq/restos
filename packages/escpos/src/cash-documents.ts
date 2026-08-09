/**
 * S-7 — the two documents that are ENTIRELY money: `shift_close_slip` (`02-F23`) and
 * `day_summary` (`02-F24`), as `03-F31` first-class types with their own data contracts.
 *
 * **`03-F32`'s money ban is INVERTED here, and both directions matter.** The FR says "a `kot`
 * renders **no money token** under any profile … enforced structurally — the profile schema has
 * no slot id addressing them". That is a statement about the `kot` TYPE, which is exactly why
 * `03-F31` exists ("structural differences live in the TYPE, not in config: **price presence** …")
 * — so these two types carry money without weakening anything the `kot` holds. Concretely:
 *
 *   * the `kot`'s ban is untouched — `KotData` still has no money field and `KOT_SPEC` still
 *     declares no slot addressing one, and `__acceptance__/kot-document.test.ts` is the assertion
 *     that stays green;
 *   * these two types' money arrives in their DATA, never through a slot. Their profiles declare
 *     `header_note`/`footer_note` and nothing else, so `ProfileFor<S>` has no key addressing a
 *     money value on a cash slip either. An owner cannot suppress, rename or re-point a figure on
 *     the paper form of "I'm clean".
 *
 * **`27-F24` — the system computes; staff read.** Every number below arrives FINISHED. Nothing in
 * this file adds, subtracts or nets two money values: over/short is `26 §7`'s **carried fact**,
 * read off `shift.closed` through the `shift_cash` fold, and re-deriving it at print time is the
 * exact defect that FR removes (it would silently move a number the cashier already signed the
 * moment a late payment arrived, which `01-F1` forbids).
 *
 * **`03-F30` purity.** Nothing here reads a clock, a timezone, a locale or any module state. That
 * bans `toLocaleString` as much as it bans `Date`: a React Native/Hermes build without full ICU
 * answers `"99999999"` where Electron answers `"99,999,999"`, and `03-F30` makes byte-identity
 * across those two devices a law. The grouping below is therefore hand-rolled, on exactly the
 * precedent `document.ts`'s `clockOf` set for the wall clock.
 *
 * **`01-F46` — a day summary's date is a BUSINESS date** (Asia/Karachi, 05:00 cutover), not a
 * calendar one. It arrives as a string the fold already derived through `domain`'s `businessDate`;
 * this layer never computes it, which is the same purity rule as above seen from the data side.
 */

import type { OrderChannel, PaymentMethod } from "@restos/domain";
import { ORDER_CHANNELS, PAYMENT_METHODS } from "@restos/domain";
import type { BlockRenderer, DocumentSpec } from "./document.js";
import {
  amountToken,
  CHANNEL_LABELS,
  GROUP_BREAK,
  METHOD_LABELS,
  NOT_RECORDED,
  ownerNote,
  reprintBand,
  row,
  TAIL,
  UNATTRIBUTED,
  varianceToken,
} from "./document-parts.js";
import { MIN_COLUMNS } from "./min-columns.js";

// ── the data contracts (03-F31: "each declares its own data contract") ───────────────────────────

/**
 * `02-F23`'s "system-expected cash **(by method)**", EXHAUSTIVE over `01-F32`'s closed tender set.
 *
 * A `Record` rather than a caller-supplied list of labelled rows, for two reasons that are not
 * style. (a) A partial map cannot tell "no card sales this shift" from "the card figure was never
 * computed" — `domain`'s own `expectedPaisaByMethod` is strict for exactly that reason, and a
 * dropped bucket is money vanishing from the reconciliation the cashier signs. (b) The LABELS
 * belong to this layer: `03-F49`'s floor is a property of the document, and a floor derived from
 * strings the caller happened to pass is not derived at all.
 *
 * Signed, because a method's expected figure nets `payment.refunded` against `payment.recorded`.
 */
export type ExpectedByMethod = Readonly<Record<PaymentMethod, number>>;

/** `02-F24`'s "sales by channel", exhaustive over `02-F42`'s closed channel set, same reasons. */
export type SalesByChannel = Readonly<Record<OrderChannel, number>>;

/**
 * `02-F23`'s data contract — the paper form of *"I'm clean"*.
 *
 * `09-F19` mirrors this document for the rider settlement slip, so the shape below is a
 * precedent: expectation by bucket, the count, the carried variance, and the drawer activity that
 * explains the gap between them.
 */
export type ShiftCloseData = {
  /** `02-F23` is "shift close **per cashier**" — the handle the slip is filed under. */
  readonly shift_id: string;
  /**
   * `02-F23`: over/short is "recorded **and attributed**"; `02-F45` makes the attribution the
   * envelope's `actor_user_id`, projected by the fold. NULL is a real and distinct state — an
   * event appended before identity reached the envelope, or an `01-F31` divergence where two
   * devices claimed one shift under different PINs and the fold refused to pick a winner — and it
   * prints as such rather than as a blank, because a slip that silently omits the attribution is
   * a slip nobody can be held to.
   */
  readonly cashier: string | null;
  /** `26 §7`'s CARRIED snapshot off `shift.closed`, never a live figure. */
  readonly expected_by_method: ExpectedByMethod;
  readonly counted_cash_paisa: number;
  /**
   * `02-F23`'s over/short, SIGNED and CARRIED (`26 §7`). Positive is over, negative is short —
   * `CashSurfaces.tsx`'s `signedVariance` mints it that way and `MoneyValue` reads it that way.
   *
   * **Read, never re-derived.** There is no expression anywhere in this file that computes it
   * from the two fields above it.
   */
  readonly variance_paisa: number;
  /** `02-F26`/`02-F44` — petty cash that left THIS drawer, which is why the count is short. */
  readonly paid_out_paisa: number;
  /** `02-F21` — no-sale drawer opens, "logged **and counted** (classic theft vector)". */
  readonly no_sale_count: number;
  /**
   * `02-F43`'s unbound bucket, and it is on the SLIP rather than only in the fold on purpose. The
   * FR is explicit about the failure it forbids: an implementation that records an unbound
   * drawer open "and then drops it from every total satisfies the word *logged* while defeating
   * the theft-detection the FR exists for". A cash slip is a total. Omitting these two fields
   * would put money in a drawer accounted for in no shift, no day and nothing on paper.
   *
   * They are branch-wide rather than this shift's — an unbound event has no shift by definition,
   * which is what makes it unbound — and the block says so.
   */
  readonly unbound_no_sale_count: number;
  readonly unbound_paid_out_paisa: number;
  /** `03-F37`: "Reprint markers are mandatory **per type**, in a locked region." */
  readonly reprint: boolean;
};

/**
 * `02-F24`'s data contract — "a day-summary ticket (sales by channel, voids/comps/discounts,
 * over/short) can be printed via doc 03".
 *
 * **Two of the FR's three groups are carried below and the third is NOT, deliberately.** `01 §4`
 * has no `void.recorded`, `comp.recorded` or `discount.recorded` — `26 §7` states it outright
 * ("`void/comp/discount.recorded` … have **no payload schema at all**") — so there is no fold,
 * no projection and no number. Commandment 2 forbids inventing the events, and a field defaulted
 * to zero would print `Voids Rs 0` on a night with twelve voids, which is worse than absent: it
 * is the "logged but uncounted" shape `02-F43` names, moved onto paper. The group therefore
 * appears on the document as a NAMED GAP (`00 §5.7` — the device reports what it knows), and the
 * field lands here when the event types do.
 */
export type DaySummaryData = {
  /**
   * `01-F46` — Asia/Karachi with the 05:00 cutover, derived by the fold, never here.
   *
   * **This is the day's whole identity on paper, and `day_id` is deliberately NOT in this
   * contract.** It was, for one round, and `render.test.ts`'s data-axis control found it dead: a
   * leaf of `example_data` that changed no byte of the document. `03-F31` makes the data contract
   * the type's own, so a field the ticket never prints is a field the contract should not carry —
   * the caller keys its spooler job by `day_id` off the fold row, which is where that identifier
   * belongs. `02-F24` asks for a summary of a business day, and `01-F46` says which one that is.
   */
  readonly business_date: string;
  readonly sales_by_channel: SalesByChannel;
  /** `02-F22`'s opening float entry. */
  readonly opening_float_paisa: number;
  /** `02-F24`'s deposit record. */
  readonly deposit_paisa: number;
  /** `02-F24`'s "manager cash count". */
  readonly counted_cash_paisa: number;
  /**
   * `02-F24`'s over/short for the day: the SUM of the CARRIED variances of the day's closed
   * shifts (`26 §7`), computed by the caller off the fold and arriving finished.
   *
   * It is not, and cannot be, a day-level recompute. `day.closed` carries a count and no
   * expectation, so "expected minus counted" for a whole day does not exist as a carried fact —
   * and deriving one at print time is precisely what `26 §7` removes.
   */
  readonly over_short_paisa: number;
  /**
   * How many shifts that sum covers, and how many are still open. Without them the sum is
   * unreadable: `Rs 0` over three closed shifts and `Rs 0` over none are the same ink and
   * opposite facts, and the second is a day closed over an unreconciled drawer.
   */
  readonly shifts_closed: number;
  readonly shifts_open: number;
  readonly reprint: boolean;
};

/**
 * `02-F24`'s third group, named as a gap (`00 §5.7`) — see `DaySummaryData`. The WORD is shared
 * (`document-parts.ts`) because more than one document has a fact it does not hold; the LABEL is
 * this document's own.
 */
const ADJUSTMENTS_LABEL = "Voids/comps/discounts";

const shiftOf = (data: unknown): ShiftCloseData => data as ShiftCloseData;
const dayOf = (data: unknown): DaySummaryData => data as DaySummaryData;

// ── shift_close_slip (02-F23) ────────────────────────────────────────────────────────────────────

const SHIFT_BLOCK_RENDERERS: Readonly<Record<string, BlockRenderer>> = {
  SHIFT_REPRINT_BAND: (data) => reprintBand(shiftOf(data).reprint),
  SHIFT_HEAD: (data) => {
    const shift = shiftOf(data);
    return [
      { kind: "text", value: `SHIFT CLOSE ${shift.shift_id}`, ink: "normal" },
      { kind: "feed", lines: 1 },
      { kind: "text", value: "Cashier ", ink: "normal" },
      // The NAME is user content and the label is not. A staff display name can be Urdu
      // (`00 §5.6`: "user content is Unicode"), so it takes `user_text` and `03-F8`'s refusal
      // rather than being silently transliterated into a name that attributes the drawer to
      // nobody. The literal below is this layer's own English and correctly stays `text`.
      shift.cashier === null
        ? { kind: "text", value: UNATTRIBUTED, ink: "normal" }
        : { kind: "user_text", value: shift.cashier },
      GROUP_BREAK,
    ];
  },
  SHIFT_HEAD_NOTE: (_data, slot) => ownerNote(String(slot("header_note"))),
  /**
   * `02-F23`'s "system-expected cash **(by method)**". Every method, always, in
   * `PAYMENT_METHODS`' order — an omitted zero is indistinguishable from an uncomputed bucket,
   * and `01-F32`/`DEC-MONEY-007` make the five behave differently in `01-F30` conservation
   * (`khata_credit` is not money received; `aggregator_receivable` is collected by the
   * aggregator; `card`/`raast` never enter the drawer at all).
   */
  SHIFT_EXPECTED: (data) => {
    const shift = shiftOf(data);
    return [
      { kind: "text", value: "Expected cash by method", ink: "normal" },
      { kind: "feed", lines: 1 },
      ...PAYMENT_METHODS.flatMap((method) =>
        row(METHOD_LABELS[method], amountToken(shift.expected_by_method[method])),
      ),
      GROUP_BREAK,
    ];
  },
  /**
   * `02-F21`, `02-F26`/`02-F44` and `02-F43` — the drawer activity that explains the gap between
   * expectation and count, INCLUDING the events that named no shift.
   */
  SHIFT_DRAWER: (data) => {
    const shift = shiftOf(data);
    return [
      ...row("Paid out", amountToken(shift.paid_out_paisa)),
      ...row("No-sale opens", String(shift.no_sale_count)),
      // 02-F43: branch-wide, because being unbound is exactly "having no shift". Printed on
      // every slip rather than only when non-zero — a zero here is the cashier's evidence that
      // nothing was taken outside a shift, and a row that appears only on bad nights teaches
      // readers to stop looking for it.
      ...row("Unbound no-sale opens", String(shift.unbound_no_sale_count)),
      ...row("Unbound paid out", amountToken(shift.unbound_paid_out_paisa)),
      GROUP_BREAK,
    ];
  },
  /**
   * `03-F33`'s `TOTALS` region, and the two numbers `02-F23` names: counted cash, and over/short
   * "recorded and attributed". The variance is READ off the data — there is no subtraction here,
   * and `26 §7` is the reason (see `ShiftCloseData.variance_paisa`).
   */
  SHIFT_COUNTED: (data) => {
    const shift = shiftOf(data);
    return [
      ...row("Counted cash", amountToken(shift.counted_cash_paisa)),
      ...row("Over/short", varianceToken(shift.variance_paisa)),
      GROUP_BREAK,
    ];
  },
  SHIFT_FOOT_NOTE: (_data, slot) => ownerNote(String(slot("footer_note"))),
  SHIFT_TAIL: () => TAIL,
};

/**
 * `03-F36`'s build-time witness, dimensioned to the floor `MIN_COLUMNS` derives.
 *
 * `aggregator_receivable` at the eight-digit display bound `MIN_COLUMNS` derives the floor from is
 * the widest line this document can produce, so the example is TIGHT against 35 rather than
 * comfortably inside it — an example narrower than the floor witnesses nothing.
 */
const SHIFT_CLOSE_EXAMPLE: ShiftCloseData = {
  shift_id: "5f3a9c21",
  cashier: "Ayesha Khan",
  expected_by_method: {
    cash: 1_250_000,
    card: 340_000,
    // Non-zero deliberately. `27-F23` drops sub-rupee, so a bucket at 0 is INDISTINGUISHABLE on
    // paper from the same bucket at 99 paisa — and `render.test.ts`'s data-axis control probes a
    // zero leaf with ±1 and ±7 paisa, both of which print `Rs 0`. A zero here would therefore make
    // this leaf a dead witness in `03-F36`'s build-time gate for a reason that is correct
    // behaviour, not a defect. The zero-bucket case (`01-F32`: "no card sales this shift" is not
    // "the card figure was never computed") is asserted in this type's own suite instead.
    raast: 75_000,
    khata_credit: -85_000,
    aggregator_receivable: 9_999_999_900,
  },
  counted_cash_paisa: 1_248_000,
  variance_paisa: -2_000,
  paid_out_paisa: 50_000,
  no_sale_count: 3,
  unbound_no_sale_count: 1,
  unbound_paid_out_paisa: 20_000,
  reprint: false,
};

/**
 * `03-F30`: "vendor-authored, versioned, shipped as code under CODEOWNERS."
 *
 * The two owner slots are `03-F33`'s customisation surface — a spec declaring no hole makes
 * `03-F30`'s profile layer unreachable — and they are the ONLY slots. Nothing on this document
 * addresses a money value from a profile, which is `03-F32`'s structural enforcement pointed at
 * a document that is entirely money: the ban the `kot` gets from having no money in its data
 * model, these two get from having no money in their slot space.
 */
const SHIFT_CLOSE_SPEC = {
  type: "shift_close_slip",
  version: 1,
  min_columns: MIN_COLUMNS.shift_close_slip,
  blocks: [
    { block_id: "SHIFT_REPRINT_BAND", region: "HEAD_LOCKED", slots: [] },
    { block_id: "SHIFT_HEAD", region: "HEAD_LOCKED", slots: [] },
    {
      block_id: "SHIFT_HEAD_NOTE",
      region: "HEAD_OWNER",
      slots: [{ slot_id: "header_note", default: "" }],
    },
    { block_id: "SHIFT_EXPECTED", region: "BODY", slots: [] },
    { block_id: "SHIFT_DRAWER", region: "BODY", slots: [] },
    { block_id: "SHIFT_COUNTED", region: "TOTALS", slots: [] },
    {
      block_id: "SHIFT_FOOT_NOTE",
      region: "FOOT_OWNER",
      slots: [{ slot_id: "footer_note", default: "" }],
    },
    { block_id: "SHIFT_TAIL", region: "TAIL_LOCKED", slots: [] },
  ],
  example_data: SHIFT_CLOSE_EXAMPLE,
} as const satisfies DocumentSpec<ShiftCloseData>;

// ── day_summary (02-F24) ─────────────────────────────────────────────────────────────────────────

const DAY_BLOCK_RENDERERS: Readonly<Record<string, BlockRenderer>> = {
  DAY_REPRINT_BAND: (data) => reprintBand(dayOf(data).reprint),
  DAY_HEAD: (data) => [
    // `01-F46`'s BUSINESS date, already derived. A day opened at 01:30 belongs to the night it
    // was served, and a calendar date on this document would file that night under tomorrow.
    { kind: "text", value: `DAY SUMMARY ${dayOf(data).business_date}`, ink: "normal" },
    GROUP_BREAK,
  ],
  DAY_HEAD_NOTE: (_data, slot) => ownerNote(String(slot("header_note"))),
  DAY_SALES: (data) => {
    const day = dayOf(data);
    return [
      { kind: "text", value: "Sales by channel", ink: "normal" },
      { kind: "feed", lines: 1 },
      ...ORDER_CHANNELS.flatMap((channel) =>
        row(CHANNEL_LABELS[channel], amountToken(day.sales_by_channel[channel])),
      ),
      GROUP_BREAK,
    ];
  },
  /**
   * `02-F24`'s third group, printed as the gap it is. See `DaySummaryData`: `01 §4` has no
   * void/comp/discount event, so there is nothing to count — and `Rs 0` on a night with twelve
   * voids is a worse document than one that says so.
   *
   * This is the widest line either cash document produces, which makes it the line `MIN_COLUMNS`
   * derives `day_summary`'s floor from.
   */
  DAY_ADJUSTMENTS: () => [...row(ADJUSTMENTS_LABEL, NOT_RECORDED), GROUP_BREAK],
  DAY_TOTALS: (data) => {
    const day = dayOf(data);
    return [
      ...row("Opening float", amountToken(day.opening_float_paisa)),
      ...row("Deposit", amountToken(day.deposit_paisa)),
      ...row("Counted cash", amountToken(day.counted_cash_paisa)),
      // The SUM of the day's CARRIED shift variances, computed by the caller (`26 §7`).
      ...row("Over/short", varianceToken(day.over_short_paisa)),
      ...row("Shifts closed", String(day.shifts_closed)),
      // A day closed over an open shift is a real and reportable state (`02-F37`/`02-F43`'s
      // spirit: record it, never block it), and it is what makes the sum above readable.
      ...row("Shifts open", String(day.shifts_open)),
      GROUP_BREAK,
    ];
  },
  DAY_FOOT_NOTE: (_data, slot) => ownerNote(String(slot("footer_note"))),
  DAY_TAIL: () => TAIL,
};

const DAY_SUMMARY_EXAMPLE: DaySummaryData = {
  business_date: "2026-08-07",
  sales_by_channel: {
    counter: 9_999_999_900,
    phone: 120_000,
    storefront: 340_000,
    whatsapp: 88_000,
    foodpanda: 415_000,
  },
  opening_float_paisa: 500_000,
  deposit_paisa: 1_100_000,
  counted_cash_paisa: 1_248_000,
  over_short_paisa: -2_000,
  shifts_closed: 2,
  shifts_open: 0,
  reprint: false,
};

const DAY_SUMMARY_SPEC = {
  type: "day_summary",
  version: 1,
  min_columns: MIN_COLUMNS.day_summary,
  blocks: [
    { block_id: "DAY_REPRINT_BAND", region: "HEAD_LOCKED", slots: [] },
    { block_id: "DAY_HEAD", region: "HEAD_LOCKED", slots: [] },
    {
      block_id: "DAY_HEAD_NOTE",
      region: "HEAD_OWNER",
      slots: [{ slot_id: "header_note", default: "" }],
    },
    { block_id: "DAY_SALES", region: "BODY", slots: [] },
    { block_id: "DAY_ADJUSTMENTS", region: "BODY", slots: [] },
    { block_id: "DAY_TOTALS", region: "TOTALS", slots: [] },
    {
      block_id: "DAY_FOOT_NOTE",
      region: "FOOT_OWNER",
      slots: [{ slot_id: "footer_note", default: "" }],
    },
    { block_id: "DAY_TAIL", region: "TAIL_LOCKED", slots: [] },
  ],
  example_data: DAY_SUMMARY_EXAMPLE,
} as const satisfies DocumentSpec<DaySummaryData>;

export const CASH_DOCUMENT_SPECS = {
  shift_close_slip: SHIFT_CLOSE_SPEC,
  day_summary: DAY_SUMMARY_SPEC,
} as const;

export const CASH_BLOCK_RENDERERS = {
  shift_close_slip: SHIFT_BLOCK_RENDERERS,
  day_summary: DAY_BLOCK_RENDERERS,
} as const;
