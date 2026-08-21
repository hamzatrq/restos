/**
 * `03-F31`'s `receipt` — the document a customer is handed, as a first-class type with its own
 * data contract (`02-F15`, `02-F16`).
 *
 * **Every field below is named by `02-F15` and nothing else is.** The FR lists the content in four
 * groups and this file is those four groups in that order:
 *
 *   * "order number, channel, date/time, cashier" → `RECEIPT_HEAD`;
 *   * "lines with variants/modifiers, discount lines, totals" → `RECEIPT_ITEMS` + `RECEIPT_TOTALS`;
 *   * "payment method(s) and change" → `RECEIPT_TENDERS`;
 *   * "fiscal fields when doc 16 is on" → **not in this spec at all**, see below.
 *
 * ── THREE OF `02-F15`'s FIELDS HAVE NO DATA IN THE PRODUCT, AND ARE ABSENT RATHER THAN FAKED ──
 *
 *   * **CHANGE.** `02-F12` computes and *displays* change at the counter; nothing records it.
 *     `payment.recorded.amount_paisa` is the amount APPLIED to the order — `TenderPanel` passes
 *     `coversBill ? remainingP : enteredP`, so a customer who hands Rs 1,000 for a Rs 770 bill
 *     produces the payload `770` and the Rs 230 exists nowhere in the ledger. There is no
 *     `tendered_paisa` field in the `01 §4`-registered schema and inventing one is commandment 2.
 *     A `Change Rs 0` line would be the "logged but uncounted" shape `02-F43` names, moved onto a
 *     document a customer keeps, so the line is absent and the gap is reported.
 *   * **VARIANTS / MODIFIERS.** The read models carry none — `main/gateway.ts` writes
 *     `modifiers: []` and says so, and the KOT's own assembly says the same. A line prints its
 *     quantity, its name and its captured price; a modifier prints when the fold projects one.
 *   * **DISCOUNT LINES.** `01 §4` has no `discount.recorded` payload schema at all (`26 §7`:
 *     "`void/comp/discount.recorded` … have **no payload schema at all**"), and `C25` has no
 *     surface, so no discount can exist against any order this device can settle.
 *     **Deliberately NOT printed as a named gap**, which is where this parts company with
 *     `day_summary`'s `Voids/comps/discounts NOT RECORDED`: that document is a RECONCILIATION a
 *     manager checks against a drawer, so a missing group breaks its arithmetic and must be
 *     visible. A receipt's arithmetic is self-contained — `total_paisa` is the fold's own
 *     `01-F30` billed_effective, and the day a discount event exists it must move THAT number
 *     before it can move this document. Nothing is silently dropped from what is printed here.
 *
 * ── DOC 16 FORCES NOTHING TODAY, AND THE MECHANISM IS ALREADY BUILT ──
 *
 * `16-F1`: "Tax is off by default." Doc 16's own header puts the compliance add-on at wave "on
 * demand (built when the first documented customer commits)". `03-F33` is then explicit that
 * `FISCAL_LOCKED` blocks are "**not in the `DocumentSpec` at all** — they are injected at render by
 * the certified authority adapter (16-F23), which declares the block **and its position**". So a
 * fiscal invoice number and `03-F35`'s rasterised QR reach this document through `render()`'s
 * existing `fiscal?` argument, and this spec declares no block for them **by rule, not by
 * omission**: a spec that authored the regulated block by hand is what `SpecRegion` exists to make
 * unrepresentable. `03-F34`'s mandatory-block and QR-size assertions already run on that path.
 *
 * ── THE INK LADDER: NORMAL THROUGHOUT, PLUS `03-F37`'s ONE BANNER ──
 *
 * `27-F56` allocates **2×2** to "the item line's quantity and the order/table identifier". That
 * allocation is read here the way S-7's two cash documents already read it — as §2b's KITCHEN
 * chit, whose subject `27-F55` states outright ("the KOT must therefore carry LESS information
 * than a pass-screen ticket") — so this document spends the rung nowhere, exactly as
 * `cash-documents.ts` does and for its stated reason: doubling a figure's column cost pushes a
 * line past a 32-column printer for no FR that asks for it, and `03-F49` fixes this type's floor
 * at **32**. `27-F57`'s pairing still binds and is honoured in full: the quantity sits immediately
 * left of the item name, on the same line, at the same size.
 */

import type { OrderChannel, PaymentMethod, TaxPosture } from "@restos/domain";
import type { BlockRenderer, DocumentSpec } from "./document.js";
import {
  amountToken,
  CHANNEL_LABELS,
  clockOf,
  dateOf,
  GROUP_BREAK,
  METHOD_LABELS,
  NOT_RECORDED,
  ownerNote,
  reprintBand,
  row,
  TAIL,
  UNATTRIBUTED,
} from "./document-parts.js";
import type { EncoderPart } from "./encoder.js";
import { MIN_COLUMNS } from "./min-columns.js";

// ── the data contract (03-F31: "each declares its own data contract") ────────────────────────────

/** One billed line (`02-F15`: "lines with variants/modifiers"). */
export type ReceiptLine = {
  readonly quantity: number;
  /**
   * The catalog display name, resolved up the `01-F21` chain by the CALLER — `01-F54`'s
   * degrade-to-identifier is the caller's, exactly as it is for the KOT, because `01-F52` forbids
   * a fold reading the catalog and this layer is downstream of both.
   */
  readonly name: string;
  /**
   * `01-F53`'s captured price — "a line's `unit_price_paisa` is captured **into the event at the
   * moment the line is added** and is never re-read from the catalog".
   *
   * **A UNIT price and deliberately not an extended line total.** DECLARED INTERPRETATION
   * (`24 §3b`); the named alternative is `qty × unit_price` per line, and it is rejected because
   * that product is not multiplication — it is `billedCellPaisa`, fold logic carrying `01-F30`'s
   * exited-line rule and `CONTESTED_LINE_BILLABLE`, which `26 §8` forbids reimplementing outside
   * `packages/sync-client`. A naive product here would print a money figure beside a VOIDED line
   * that contributes zero to the total below it, and a receipt whose lines do not add up to its
   * total is worse than one that asks the reader to multiply. The extended amount is OWED and its
   * blocker is one exported function in a protected package.
   */
  readonly unit_price_paisa: number;
};

/** One tender against this order (`02-F15`: "payment method(s)"; `01-F32`'s closed set). */
export type ReceiptTender = {
  readonly method: PaymentMethod;
  /** `payment.recorded.amount_paisa` — the amount APPLIED to the order, never cash handed over. */
  readonly amount_paisa: number;
};

/**
 * `16-F5`'s snapshot as the receipt receives it — R39's *"receipts compute and show tax
 * properly"*, arriving FINISHED (`27-F24`: "the system computes; staff read").
 *
 * **Every figure here is `taxSnapshot`'s and nothing on this document re-derives one.** `16-F5`
 * puts the computation at settlement under `01-F18` discipline ("never re-derived") and
 * `packages/domain` owns it; a renderer that applied `rate_bps` to `subtotal_paisa` itself would
 * silently turn `16-F5`'s PER-LINE answer into a per-total one and disagree with the ledger by a
 * rounding step.
 *
 * `posture` travels because `16-F1`'s "off" and a configured 0 % rate must stay distinguishable on
 * paper: an org with no posture prints nothing, and a `Tax Rs 0` line is a claim about a tax regime
 * it is not in.
 */
export type ReceiptTax = {
  /**
   * `16-F2`'s posture, as `@restos/domain` declares it. Imported rather than re-spelled: a second
   * declaration of a domain type is a violation, not a convenience (`18 §2`), and a fourth posture
   * word must fail to compile here rather than print.
   */
  readonly posture: TaxPosture;
  /**
   * `16-F4`'s pack rate in integer basis points, carried and **not printed**.
   *
   * NO FR requires a rate on a customer's receipt — `02-F15` lists the content and names no rate,
   * and doc 16's receipt fields are `16-F9`'s fiscal ones, which R39 defers in full. It travels
   * because a tax amount is only checkable against the rate that produced it and the seam that
   * lands `16-F2`'s matrix will already hold both; printing it is a doc 02 or doc 16 question, and
   * inventing the row here would be commandment 2.
   */
  readonly rate_bps: number;
  /** `taxSnapshot`'s `subtotal_paisa` — the pre-tax figure, net of tax under BOTH postures. */
  readonly subtotal_paisa: number;
  /** `taxSnapshot`'s `tax_total_paisa`. */
  readonly tax_total_paisa: number;
};

/** `03-F31`'s data contract for the customer's copy. */
export type ReceiptData = {
  /** `02-F15`'s "order number" — the same eight-character handle `03-F5`'s band and the KOT use. */
  readonly receipt_no: string;
  /** `02-F15`'s "channel"; `02-F42`'s closed set, which is also the key the price resolved from. */
  readonly channel: OrderChannel;
  /**
   * `02-F15`'s "date/time" as `01-F43`'s DELIVERED branch stamp, in integer milliseconds —
   * `27-F62`: "Print what was true at **append** time, stamped with `branch_created_at`".
   *
   * **Nullable, and the null is a real state rather than a defensive one.** The only delivered
   * branch stamp an order carries on this device is its confirm anchor, and `01-F17` lets a
   * cashier settle an order that was never sent to the kitchen. Such a receipt has no branch time
   * at all, and `00 §5.7` makes saying so the required behaviour: reading this device's clock
   * instead would stamp the moment the printer got round to it, which `01-F45` bans and `27-F62`
   * contradicts in the same breath.
   */
  readonly branch_created_at: number | null;
  /**
   * `02-F15`'s "cashier". `02-F41`/`02-F45`: attribution is whoever's PIN is in, carried by the
   * envelope's `actor_user_id` and resolved to a display name by the caller.
   *
   * `null` prints `UNATTRIBUTED` for the same reason the shift slip does — a document that
   * silently omits its attribution is a document nobody can be held to.
   */
  readonly cashier: string | null;
  readonly lines: readonly ReceiptLine[];
  /**
   * `01-F30`'s billed_effective for this order, arriving FINISHED (`27-F24` — the system computes,
   * staff read). Nothing in this file adds two money values: the fold accumulates in BigInt
   * because a running double is non-associative near 2^53, and re-deriving the sum here would let
   * this layer disagree with the ledger by a rounding step.
   */
  readonly total_paisa: number;
  /**
   * `02-F15`'s "payment method(s)", in the order the CALLER supplies — which is
   * `PAYMENT_METHODS`' declared order (`27-F4`), aggregated per method.
   *
   * A LIST rather than the exhaustive `Record` the shift slip uses, and the difference is the
   * reader: `02-F23`'s slip prints every bucket because "no card sales this shift" and "the card
   * figure was never computed" must be distinguishable to someone reconciling a drawer. A
   * customer's receipt has no such reader, and five rows of `Rs 0` on a cash sale is exactly the
   * information `27-F55` says paper must carry LESS of.
   */
  readonly tenders: readonly ReceiptTender[];
  /** `03-F37`: "Reprint markers are mandatory **per type**, in a locked region"; `02-F16`. */
  readonly reprint: boolean;
  /**
   * `16-F5`'s snapshot, when one exists. **OPTIONAL, and ABSENT means no tax content at all** —
   * `16-F1`: "Tax is off by default", so the ordinary Pakistani restaurant this product ships to
   * prints the document it printed before this field existed, byte for byte.
   *
   * The rejected alternative (`24 §3b`) is three always-present fields defaulting to zero, which
   * makes "no posture is configured" (print nothing) indistinguishable from "a 0 % rate applies"
   * (print a tax row reading Rs 0) — `02-F43`'s "logged but uncounted" shape moved onto a document
   * a customer keeps and a `16 §1` legal red line one step away.
   *
   * `| undefined` is explicit because `exactOptionalPropertyTypes` makes "absent" and "present as
   * `undefined`" two different TYPES, and they must be the same DOCUMENT: a caller that composes
   * `tax: posture === undefined ? undefined : …` must not print differently from one that omits the
   * key.
   */
  readonly tax?: ReceiptTax | undefined;
};

const receiptOf = (data: unknown): ReceiptData => data as ReceiptData;

/**
 * An English word for a kernel identifier, degrading to the identifier itself.
 *
 * `01-F54`'s precedent applied one layer over: a value the label table does not know is printed as
 * itself rather than as `undefined`. The tables are exhaustive over their closed sets
 * (`02-F42`, `01-F32`) so this cannot fire on conforming data — it fires on a non-conforming
 * writer, and an identifier on paper is recoverable where the word `undefined` is not.
 */
const labelled = (table: Readonly<Record<string, string>>, key: string): string =>
  table[key] ?? key;

// ── the blocks (03-F33's region ladder, in 02-F15's own order) ───────────────────────────────────

const RECEIPT_BLOCK_RENDERERS: Readonly<Record<string, BlockRenderer>> = {
  RECEIPT_REPRINT_BAND: (data) => reprintBand(receiptOf(data).reprint),
  /**
   * `02-F15`'s first group: "order number, channel, date/time, cashier".
   *
   * The order of the four rows is the FR's own. `27-F58` fixes a reading order for the kitchen
   * chit and states it in kitchen terms (identifier → timing → items → modifiers → notes); the
   * identifier-then-timing shape is the same here, and where §2b is silent about a customer
   * document the FR that names the fields also names their sequence.
   */
  RECEIPT_HEAD: (data) => {
    const receipt = receiptOf(data);
    return [
      { kind: "text", value: `RECEIPT ${receipt.receipt_no}`, ink: "normal" },
      { kind: "feed", lines: 1 },
      ...row("Channel", labelled(CHANNEL_LABELS, receipt.channel)),
      // One row, not two: `02-F15` writes "date/time" as one field and a receipt is read as one
      // moment. `03-F36`'s single space separates the label from the value; the space inside the
      // value is part of the stamp, not layout.
      ...row(
        "Date",
        receipt.branch_created_at === null
          ? NOT_RECORDED
          : `${dateOf(receipt.branch_created_at)} ${clockOf(receipt.branch_created_at)}`,
      ),
      // The NAME is user content and the label is not. A staff display name can be Urdu
      // (`00 §5.6`: "user content is Unicode"), so it takes `user_text` and `03-F8`'s refusal
      // rather than being silently transliterated into a name that attributes the sale to nobody.
      { kind: "text", value: "Cashier ", ink: "normal" },
      receipt.cashier === null
        ? { kind: "text", value: UNATTRIBUTED, ink: "normal" }
        : { kind: "user_text", value: receipt.cashier },
      GROUP_BREAK,
    ];
  },
  RECEIPT_HEAD_NOTE: (_data, slot) => ownerNote(String(slot("header_note"))),
  /**
   * `02-F15`'s "lines", under `27-F57`'s pairing.
   *
   * "Quantity sits **immediately left of the item name on the same line**, at the same size, never
   * in a right-aligned column and never on its own row." So the quantity is not padded to align
   * with the line above it and the price is not pushed to a column — `03-F36` bans
   * space-as-layout, and the same FR's degradation ladder ends in "wrap to two rows", which
   * `03-F49` explicitly permits for this type ("a price column genuinely can degrade").
   *
   * The item NAME is `user_text`: it is catalog content an owner authored (`00 §5.6`), the same
   * category as the shift slip's cashier name and as an owner note, so a non-Latin name refuses
   * `raster_font_unavailable` — `03-F8`'s July 2026 ruling, which names the true state of the
   * world (no font, no shaping engine) — rather than `non_ascii_system_text`, which would claim
   * the platform's own English is broken and is permanent. Byte output for a Latin name is
   * identical either way; only the S1 band's sentence differs.
   */
  RECEIPT_ITEMS: (data) => [
    ...receiptOf(data).lines.flatMap((line): readonly EncoderPart[] => [
      { kind: "text", value: `${line.quantity} `, ink: "normal" },
      { kind: "user_text", value: line.name },
      // `each` is an English word (`00 §5.6`) and it is load-bearing: without it the figure reads
      // as this line's cost, and on a quantity above one that is a wrong number on a document a
      // customer checks. See `ReceiptLine.unit_price_paisa` for why the extended amount is not
      // printed instead.
      { kind: "text", value: ` ${amountToken(line.unit_price_paisa)} each`, ink: "normal" },
      { kind: "feed", lines: 1 },
    ]),
    // `27-F58`: "Groups are separated by **blank lines, not rules**."
    //
    // ⚠ THIS WAS MISSING AND ONLY LOOKING AT THE PAPER FOUND IT. The first receipt rendered
    // through `RESTOS_PRINT_TO_FILE` ran `Total Rs 930` straight on from the last item line with
    // no gap, so the body and the totals read as one block — while every other transition on the
    // document had its break. The suite did not see it because §I asserted only that SOME blank
    // line exists, which the head and totals breaks already satisfied: the round-3 shape exactly,
    // a mechanism that was right and a guard that was never pointed at the transition that lacked
    // it. §I now asserts a blank line at EVERY region change, and this is the part that fixes it.
    GROUP_BREAK,
  ],
  /**
   * `03-F33`'s `TOTALS` region and `02-F15`'s "totals" — the fold's own figure, never a sum here.
   *
   * **R39's itemised tax line lives here and nowhere else.** DECLARED INTERPRETATION (`24 §3b`):
   * *"an itemised tax line"* is the tax broken out as its OWN row between a pre-tax figure and the
   * amount due — three rows, three distinct figures, in that reading order, because a tax printed
   * below the number it is already inside cannot be checked by the person holding the paper. The
   * named alternative is a per-ITEM tax column beside each line, rejected because R39 writes
   * "line" singular, and because `27-F55`'s "carry LESS information" plus `03-F49`'s 32-column
   * floor make a fourth money column a layout this corpus refuses elsewhere.
   *
   * The three rows are CONTIGUOUS — no `GROUP_BREAK` between them. `27-F58` separates groups with
   * blank lines and does not say what a group is, but a base and the tax taken out of it are one
   * arithmetic statement: a blank line between them makes the tax read as a charge from somewhere
   * else.
   *
   * **`TOTALS` and deliberately not a region of its own.** `03-F33` puts `FISCAL_LOCKED` blocks
   * *"not in the `DocumentSpec` at all"* — they are injected at render by a certified adapter — so
   * a spec block for an ordinary posture tax would be the vendor authoring regulated content by
   * hand, which R39 defers in full and `SpecRegion` exists to make unrepresentable. It is equally
   * not `HEAD_OWNER`/`FOOT_OWNER`: those are the only regions an owner may reach (`03-F34`), and a
   * tax figure an owner can edit or suppress is what `16 §7` puts under "deliberately not
   * configurable, ever".
   *
   * **`none` prints nothing, exactly as an absent snapshot does.** `16-F1` is "tax is OFF", and
   * a receipt that says `Tax Rs 0` on an org with no posture configured is a claim about a tax
   * regime that org is not in. `16-F3`'s complete internal numbers are untouched by this: the
   * posture decides what the PAPER shows, never what the ledger records.
   *
   * The two labels are English (`00 §5.6`) and `Tax` is R39's own noun. A `16-F4` pack may one day
   * supply an authority's own label ("GST", "Sales Tax") — no FR rules on it, and `03-F49` refuses
   * rather than squeezes, so a verbose label is a layout decision and not a copy one.
   */
  RECEIPT_TOTALS: (data) => {
    const receipt = receiptOf(data);
    const tax = receipt.tax;
    return [
      ...(tax === undefined || tax.posture === "none"
        ? []
        : [
            ...row("Subtotal", amountToken(tax.subtotal_paisa)),
            ...row("Tax", amountToken(tax.tax_total_paisa)),
          ]),
      ...row("Total", amountToken(receipt.total_paisa)),
      GROUP_BREAK,
    ];
  },
  /**
   * `02-F15`'s "payment method(s)". Also `TOTALS`, because `03-F33`'s ladder has one region
   * between the body and the regulated block and what a customer paid is part of the settlement,
   * not owner content — `HEAD_OWNER`/`FOOT_OWNER` are the only regions an owner may reach and a
   * tender row must not be in one.
   *
   * A document with no tender prints the header and no rows. That is honest rather than empty:
   * `02-F37` lets a settlement exist with no shift, and `01-F17` lets an order be recalled before
   * any tender lands, so "paid nothing yet" is a real state a receipt may be printed in.
   */
  RECEIPT_TENDERS: (data) => [
    { kind: "text", value: "Paid", ink: "normal" },
    { kind: "feed", lines: 1 },
    ...receiptOf(data).tenders.flatMap((tender) =>
      row(labelled(METHOD_LABELS, tender.method), amountToken(tender.amount_paisa)),
    ),
    GROUP_BREAK,
  ],
  RECEIPT_FOOT_NOTE: (_data, slot) => ownerNote(String(slot("footer_note"))),
  RECEIPT_TAIL: () => TAIL,
};

/**
 * `03-F36`'s build-time witness, dimensioned against `03-F49`'s floor of 32.
 *
 * Every money leaf is **≥ Rs 10** on purpose and none is zero. `27-F23` drops sub-rupee, so the
 * data-axis control in `render.test.ts` probes a leaf by `1`, `7` and `7 × 10ᵏ` below its own
 * magnitude — and every one of those deltas leaves a figure under Rs 10 printing the same rupees,
 * which would make the leaf a DEAD witness for a reason that is correct behaviour rather than a
 * defect. `cash-documents.ts` records the same trap against its own zero buckets.
 */
const RECEIPT_EXAMPLE: ReceiptData = {
  receipt_no: "5f3a9c21",
  channel: "counter",
  branch_created_at: 1_754_300_000_000,
  cashier: "Ayesha Khan",
  lines: [
    { quantity: 2, name: "Chicken Karahi", unit_price_paisa: 45_000 },
    { quantity: 1, name: "Garlic Naan", unit_price_paisa: 6_000 },
  ],
  total_paisa: 96_000,
  // Two methods, because `02-F13` splits one settlement across several and a single-tender example
  // cannot witness the row-per-method shape at all.
  tenders: [
    { method: "cash", amount_paisa: 50_000 },
    { method: "raast", amount_paisa: 46_000 },
  ],
  reprint: false,
};

/**
 * The shipped `receipt` spec (`03-F30`: "vendor-authored, versioned, shipped as code under
 * CODEOWNERS").
 *
 * `min_columns` is READ FROM `MIN_COLUMNS`, never repeated: `03-F49` states the number once and
 * two declarations of one number is the defect.
 *
 * The two owner slots are `02-F15`'s "configurable header/footer" and `03-F33`'s customisation
 * surface. **`02-F15`'s other two customisations are NOT here and are owed rather than silently
 * dropped:** a *logo* is a raster and `03-F30` makes a slot value a SCALAR ("a hole takes a
 * SCALAR"), so no profile can carry one; and an *optional menu-link QR* has no `EncoderPart` —
 * `fiscal_qr` is `03-F35`'s regulated raster and K-2's encoder oracle is an ALLOWLIST, so a second
 * QR part is a finding for the encoder's test owner, not an addition this file may make.
 */
const RECEIPT_SPEC = {
  type: "receipt",
  version: 1,
  min_columns: MIN_COLUMNS.receipt,
  blocks: [
    { block_id: "RECEIPT_REPRINT_BAND", region: "HEAD_LOCKED", slots: [] },
    { block_id: "RECEIPT_HEAD", region: "HEAD_LOCKED", slots: [] },
    {
      block_id: "RECEIPT_HEAD_NOTE",
      region: "HEAD_OWNER",
      slots: [{ slot_id: "header_note", default: "" }],
    },
    { block_id: "RECEIPT_ITEMS", region: "BODY", slots: [] },
    { block_id: "RECEIPT_TOTALS", region: "TOTALS", slots: [] },
    { block_id: "RECEIPT_TENDERS", region: "TOTALS", slots: [] },
    {
      block_id: "RECEIPT_FOOT_NOTE",
      region: "FOOT_OWNER",
      slots: [{ slot_id: "footer_note", default: "" }],
    },
    { block_id: "RECEIPT_TAIL", region: "TAIL_LOCKED", slots: [] },
  ],
  example_data: RECEIPT_EXAMPLE,
} as const satisfies DocumentSpec<ReceiptData>;

export const RECEIPT_DOCUMENT_SPECS = { receipt: RECEIPT_SPEC } as const;

export const RECEIPT_BLOCK_RENDERER_TABLE = { receipt: RECEIPT_BLOCK_RENDERERS } as const;
