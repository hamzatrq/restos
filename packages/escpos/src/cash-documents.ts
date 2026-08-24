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
  NOT_TOTALLED,
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
 * **Two of the FR's three groups are carried below and the third is NOT, deliberately.** There is
 * no fold, no projection and no number for voids, comps and discounts, so a field defaulted to
 * zero would print `Voids Rs 0` on a night with twelve voids — worse than absent: it is the
 * "logged but uncounted" shape `02-F43` names, moved onto paper. The group therefore appears on
 * the document as a NAMED GAP (`00 §5.7` — the device reports what it knows), and the field lands
 * here when the projection does.
 *
 * ⚠ **THE REASON THIS PARAGRAPH GAVE WAS TRUE WHEN WRITTEN AND IS NOW FALSE, AND THE WORD ON THE
 * PAPER MOVED WITH IT (August 2026).** It read: *"`01 §4` has no `void.recorded`, `comp.recorded`
 * or `discount.recorded` — `26 §7` states it outright"* — and the document said `NOT RECORDED` on
 * exactly that basis. All three have carried payload schemas in
 * `packages/domain/src/registry.ts` since `plans/v0.md` gap 1 landed, `apps/pos-electron` emits
 * all three with an actor and an approver, and `26 §7` itself was amended 2026-08-23 to say so.
 * What is still missing is one step later: `merge.ts`'s three arms are **projection-inert** while
 * `DEC-MONEY-010`'s gate condition (iii) — *"an oracle-pinned merge rule in `26 §7`"* — is unmet,
 * so `01-F30`'s `void_value`, `comp_value` and `discounts` terms do not exist. **The GAP is the
 * same size and the CLAIM was not:** a manager's slip was telling her nothing had been recorded
 * about a night that held a void, a comp and three discounts, each with an approver. It prints
 * `NOT TOTALLED` now — see `DAY_ADJUSTMENTS`.
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
  /**
   * `02-F43`'s unbound treatment, applied to `01-F46`'s binding rather than `02-F22`'s: money this
   * device has taken that belongs to no BUSINESS DAY, and the number of orders it came from.
   *
   * **Why the figure exists at all.** An order projection's only delivered branch stamp is its
   * confirm anchor (`01-F43`), and `01-F17` lets a cashier settle an order that was never sent to
   * the kitchen — a drink, a packaged good, a bill rung after the food went out. That order has no
   * branch time, so `01-F46` cannot file it under a business date and it cannot enter
   * `sales_by_channel`. It was DROPPED until August 2026, and the drop was measured on a real
   * service day: Rs 521 of Rs 2,968 — 17.6% — settled, in the shift slip's expected cash, and
   * absent from the document the manager reconciles against the deposit. `02-F43` rules that shape
   * by name and names this very document: money that cannot be bound is *"counted into an unbound
   * bucket"* and surfaced, because the silent path is *"money vanishing from … `02-F24`'s day close
   * with nothing to point at"*.
   *
   * **CUMULATIVE AND BRANCH-WIDE, exactly as `unbound_paid_out_paisa` is on the shift slip.** An
   * order with no branch stamp has no business day by definition — that is what makes it undated —
   * so it appears on every summary this device prints until the order projection carries a
   * settlement stamp. The LABEL carries that (`so far`), because a manager who adds a running total
   * into one night's deposit is exactly the harm this field exists to prevent.
   *
   * **NOT defaulted, NOT optional.** A field absent-or-zero would make "no undated sales" and "the
   * undated figure was never computed" the same ink — the `02-F43` shape this whole contract
   * refuses one field up.
   */
  readonly undated_sales_paisa: number;
  readonly undated_orders: number;
  /**
   * **WHICH CHANNELS that undated money came from, exhaustive over `02-F42`'s closed set.**
   *
   * ⚠ **IT EXISTS BECAUSE THE BLOCK ABOVE WAS MAKING A COMPLETENESS CLAIM IT COULD NOT MAKE.**
   * Reproduced on a real device store, August 2026: a phone order settled with no confirm (`01-F17`
   * — a bill rung after the food went out) put Rs 893 in `undated_sales_paisa`, and the slip then
   * read **`Phone Rs 0`** five rows above it. Both figures are individually true — no phone sale
   * could be DATED to this business day — and together they tell a manager that the phone took
   * nothing on a night it took Rs 893. `sales_by_channel`'s own contract says an omitted bucket
   * cannot be told from an uncomputed one; the same argument applies to a bucket that reads zero
   * beside money the document is holding somewhere else.
   *
   * **It is a BREAKDOWN and never a second total.** `undated_sales_paisa` stays the authoritative
   * figure and is unchanged: an order whose `channel` falls outside `02-F42`'s closed set is
   * counted in the aggregate and bucketed nowhere, on `DAY_SALES`'s own stated rule that a
   * mis-bucketed sale is worse than a missing one. So Σ of this map is ≤ the aggregate, and on a
   * conforming writer they are equal.
   *
   * **What it must NOT be read as: a licence to file undated money under a business day.** These
   * orders carry no delivered branch stamp at all (`01-F45` — a stamp this device does not hold is
   * not one it may invent), so their money still may not enter `sales_by_channel`. The root fix is
   * a settlement stamp on the order projection, which is a `packages/sync-client` fold change under
   * `26 §8`'s oracle; until it lands, naming the channel is the most this document can honestly
   * say. `apps/pos-electron/src/main/printing.ts` records the sizing at its own walk.
   *
   * **NOT defaulted, NOT optional**, for `undated_sales_paisa`'s reason one field up.
   */
  readonly undated_by_channel: SalesByChannel;
  readonly reprint: boolean;
};

/**
 * `02-F24`'s third group, named as a gap (`00 §5.7`) — see `DaySummaryData`. The WORD is shared
 * (`document-parts.ts`) because more than one document has a fact it does not hold; the LABEL is
 * this document's own.
 */
const ADJUSTMENTS_LABEL = "Voids/comps/discounts";

/**
 * `02-F43`'s unbound bucket at `01-F46`'s binding — see `DaySummaryData.undated_sales_paisa`.
 *
 * 20 and 21 columns. The money row is therefore 20 + 1 + 13 = **34** at `MIN_COLUMNS`' pinned
 * eight-digit display bound, which ties `day_summary`'s floor and does not move it.
 */
const UNDATED_SALES_LABEL = "Undated sales so far";
const UNDATED_ORDERS_LABEL = "Undated orders so far";

/**
 * The per-channel breakdown of the bucket above — see `DaySummaryData.undated_by_channel`.
 *
 * **The prefix is what keeps the two blocks apart on paper**, and it is a word rather than an
 * indent because `03-F36` bans space-as-layout: `Phone Rs 0` and `Phone Rs 893` five rows apart
 * would be the same label twice with opposite meanings, which is the misreading this breakdown
 * exists to end.
 *
 * **Width, checked rather than assumed.** `Storefront` is the longest `ORDER_CHANNELS` label at 10
 * columns, so the widest row here is `Undated storefront` = 18 + 1 + 13 = **32** at `MIN_COLUMNS`'
 * pinned eight-digit bound — inside `day_summary`'s 34 floor, which therefore does not move and
 * this stays an addition rather than an `03-F49` spec act.
 *
 * **`CHANNEL_LABELS` is used verbatim and is deliberately NOT lower-cased after the prefix.** Its
 * own declaration records that the label is *the product's name* — `whatsapp` is the kernel key
 * and **WhatsApp** is the thing a manager recognises — so a `.toLowerCase()` that made
 * `Undated storefront` read better would print `Undated whatsapp` and lose the one label on this
 * document that carries a brand's own capitalisation.
 */
const undatedChannelLabel = (channel: OrderChannel): string => `Undated ${CHANNEL_LABELS[channel]}`;

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
  /**
   * `02-F24`'s "sales by channel", plus `02-F43`'s unbound bucket for the sales no channel row can
   * hold — see `DaySummaryData.undated_sales_paisa`.
   *
   * The two rows are INSIDE this group and not below it: they are sales, and `27-F58` separates
   * GROUPS with blank lines, so a break here would tell a manager the figure belongs to a
   * different statement from the one it has to be added to.
   *
   * **Printed on every summary, including at zero**, on `SHIFT_DRAWER`'s stated reason one document
   * over: *"a row that appears only on bad nights teaches readers to stop looking for it"*, and a
   * zero here is the manager's evidence that every sale on this device is in the rows above.
   *
   * `so far` is doing real work and is not a hedge. These figures are branch-wide and cumulative —
   * an undated order has no business day, so it is on tomorrow's summary too — and the shift slip's
   * terser `Unbound paid out` gets away without the qualifier because a cashier reconciles a
   * DRAWER she is holding, where this reader is adding rows into one night's deposit. `Undated
   * sales so far` + the 13-column money bound is 34 columns, which TIES `day_summary`'s floor
   * rather than moving it (`min-columns.ts` states the derivation).
   */
  DAY_SALES: (data) => {
    const day = dayOf(data);
    return [
      { kind: "text", value: "Sales by channel", ink: "normal" },
      { kind: "feed", lines: 1 },
      ...ORDER_CHANNELS.flatMap((channel) =>
        row(CHANNEL_LABELS[channel], amountToken(day.sales_by_channel[channel])),
      ),
      ...row(UNDATED_SALES_LABEL, amountToken(day.undated_sales_paisa)),
      // ── WHICH CHANNELS THE UNDATED MONEY CAME FROM ────────────────────────────────────────────
      //
      // Reproduced August 2026: a phone order settled with no confirm put Rs 893 in the row above
      // and left `Phone Rs 0` five rows higher — two individually true figures that together tell
      // a manager the phone took nothing on a night it took Rs 893. The channel is a DELIVERED
      // field of `order.created` that this document's caller already reads, so naming it invents
      // nothing and dates nothing (`01-F45`).
      //
      // EXHAUSTIVE over `02-F42`'s closed set and printed at zero, on this block's own stated rule
      // and `SHIFT_DRAWER`'s: a row that appears only on bad nights teaches readers to stop looking
      // for it — and here the whole point is that a manager can pair `Phone` with `Undated Phone`.
      // Immediately under the aggregate, before the COUNT, because it decomposes the money and not
      // the orders.
      ...ORDER_CHANNELS.flatMap((channel) =>
        row(undatedChannelLabel(channel), amountToken(day.undated_by_channel[channel])),
      ),
      // The count is what makes the money readable, on `shifts_closed`'s own argument: `Rs 0` over
      // no undated orders and `Rs 0` over three are the same ink and opposite facts.
      ...row(UNDATED_ORDERS_LABEL, String(day.undated_orders)),
      GROUP_BREAK,
    ];
  },
  /**
   * `02-F24`'s third group, printed as the gap it is. See `DaySummaryData`: the acts ARE recorded
   * in the ledger and no fold projects their value, so this slip cannot add them up — and `Rs 0`
   * on a night with twelve voids is a worse document than one that says so.
   *
   * **`NOT_TOTALLED` and not `NOT_RECORDED`, and the difference is the whole fix.** The stronger
   * word was true while `01 §4` carried no such event; it became a **false statement on a
   * manager's own paper** the day the emitters shipped, and it stayed there. The two words are
   * the same twelve columns, so `MIN_COLUMNS` derives the same 34 and no `03-F49` floor moves —
   * which is what made this a wording correction rather than a spec act.
   *
   * This is still the widest line either cash document produces (tied by `Undated sales so far`),
   * which makes it the line `MIN_COLUMNS` derives `day_summary`'s floor from.
   */
  DAY_ADJUSTMENTS: () => [...row(ADJUSTMENTS_LABEL, NOT_TOTALLED), GROUP_BREAK],
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
  // The measured defect's own figure (Rs 521 of Rs 2,968, 2026-08-23). Non-zero and ≥ Rs 10 for
  // `SHIFT_CLOSE_EXAMPLE`'s stated reason: `render.test.ts`'s data-axis control probes a money leaf
  // by ±1 paisa upward, and a zero leaf would be a DEAD witness in `03-F36`'s build-time gate.
  undated_sales_paisa: 52_100,
  undated_orders: 1,
  /**
   * The SAME Rs 521, decomposed — and it lands on `phone` because that is the shape the defect was
   * measured in: an order taken over the phone, settled with no confirm, so `01-F46` can date
   * nothing about it. Every leaf is non-zero for `SHIFT_CLOSE_EXAMPLE`'s stated reason —
   * `render.test.ts`'s data-axis control probes a money leaf by ±1 paisa and a zero leaf is a DEAD
   * witness in `03-F36`'s build-time gate — and the five sum to `undated_sales_paisa` above,
   * because an example whose breakdown contradicted its own aggregate would witness the bug rather
   * than the document. The COLUMN cost of this block is a property of its longest LABEL and not of
   * these values — `Undated Storefront` at `MIN_COLUMNS`' pinned eight-digit bound is 18 + 1 + 13 =
   * 32, inside `day_summary`'s 34 — so no example figure can move the floor.
   */
  undated_by_channel: {
    counter: 100,
    phone: 51_600,
    storefront: 100,
    whatsapp: 100,
    foodpanda: 200,
  },
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
