// Typed event registry (01-F4): producing or parsing an unknown event type is an
// error, never silent acceptance. Seed catalog per 01 §4 — the full catalog lands
// with its consuming modules via spec-cited PRs.
import { z } from "zod";
import { type EventEnvelopeT, parseEnvelope } from "./envelope.js";
import { ORDER_LINE_STATES } from "./states.js";

export class UnknownEventTypeError extends Error {
  constructor(type: string) {
    super(`unknown event type: ${type} (01-F4 — event types live in the domain catalog only)`);
    this.name = "UnknownEventTypeError";
  }
}

/**
 * Tender methods (`02-F12` + `01-F32`). Declared once, here, because `18 §4` says a domain type
 * is declared in `domain` and redeclaring it elsewhere is a violation rather than a convenience.
 *
 * - `cash` · `card` · `raast` — `02-F12`'s three tenders. Card is a manual record at launch.
 * - `khata_credit` — `02-F14`; needs a linked customer, and `DEC-MONEY-007` makes its later
 *   repayment a `repays_receivable` payment so a repaid tab can never read as overpaid.
 * - `aggregator_receivable` — `01-F32`; the order is settled but the money arrives later from
 *   the aggregator, and doc 08 reconciles it against payouts.
 */
/**
 * Order channels (`02-F42`, the tags `02-F1` already names). Declared once, here, for the same
 * `18 §4` reason as `PAYMENT_METHODS` below.
 *
 * **This is a PRICE KEY, not a report category** — which is why it is closed. `01-F60` resolves a
 * line's `unit_price_paisa` from the order's channel, and `01-F53` snapshots that into the event
 * at line-add, so a typo is not a mislabelled row: it is a **wrong price frozen in an append-only
 * ledger** where `01-F1` allows no edit, only a linked correction. An open string fails nowhere
 * and is discovered as thin margin months later.
 *
 * **`channel` and `order_type` are different axes and neither substitutes for the other**
 * (`02-F1`). `dine_in`/`takeaway`/`delivery` are *types*; a channel drawn from that vocabulary is
 * invalid. That confusion is not hypothetical — `channel: "dine_in"` sat in 45 fixture sites
 * across 26 files from Wave 0 until `59d601a`, invisible because the field accepted any string.
 */
export const ORDER_CHANNELS = ["counter", "phone", "storefront", "whatsapp", "foodpanda"] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export const PAYMENT_METHODS = [
  "cash",
  "card",
  "raast",
  "khata_credit",
  "aggregator_receivable",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * `05-F7`'s `approval_type`, transcribed: *"`void | comp | discount | price_override | paid_out`"*.
 *
 * CLOSED, on `02-F42`'s precedent one field over. An approval type is not a report category — it
 * decides which matrix row `02-F20`'s escalation was refused under, and an open string means an
 * approval recorded against an act nothing can name, permanently (`01-F1`). The five members are
 * exactly `02-F20`'s four escalatable acts plus `05-F19`'s paid-out; adding a sixth is an FR.
 */
export const APPROVAL_TYPES = ["void", "comp", "discount", "price_override", "paid_out"] as const;
export type ApprovalType = (typeof APPROVAL_TYPES)[number];

/**
 * `02-F23`'s "system-expected cash (by method)" — EXHAUSTIVE over the closed tender set, with
 * explicit zeros. Derived from `PAYMENT_METHODS` rather than transcribed, so a sixth tender
 * cannot be added to the enum and silently skipped here.
 *
 * Exhaustive because a partial map cannot tell "no card sales this shift" from "the card figure
 * was never computed", and `01-F32`/`DEC-MONEY-007` make `khata_credit` and
 * `aggregator_receivable` behave differently in `01-F30` conservation — a dropped bucket is
 * money that vanishes from the reconciliation the cashier signs. Strict for the same reason
 * `02-F42` closed `payment.recorded.method`: a sixth key is a category no report knows to count.
 *
 * Signed integers: a method's expected figure nets `payment.refunded` against `payment.recorded`.
 */
const expectedPaisaByMethod = z.strictObject(
  Object.fromEntries(PAYMENT_METHODS.map((method) => [method, z.number().int()])) as Record<
    PaymentMethod,
    z.ZodNumber
  >,
);

/**
 * `14-F3` — one price cell that moved, which is the *"450 → 480"* half of the FR's own example
 * (*"price changed by Ali, 2 Jul, 450 → 480"*). Only cells that actually changed appear, so an
 * edit that renamed an item carries an empty list rather than its whole grid.
 *
 * **This is a DELTA, not an entity body**, and the distinction is what keeps `01-F52` intact. The
 * hazard `01-F52` names is a ledger event that carries the catalog — from which a reader could
 * reconstruct a menu and start folding it. A before/after pair for one `(branch, channel)` cell
 * carries no name, no station, no parent and no grid shape; nothing can rebuild a menu from it.
 *
 * **Why the numbers are carried rather than resolved from `before_ref`/`after_ref`.** The refs are
 * `payloadHash` digests — one-way, and nothing in the corpus indexes by them, so "resolve the ref"
 * would in fact mean "re-read the entity at version N-1 from the catalog store". That makes the
 * audit trail a *derived* read of mutable reference data: it decays when `01-F52`'s snapshot+delta
 * history is compacted (`450 → 480` becomes `— → —`), and it can be changed after the fact by a
 * later publish or a restore, which is the one thing commandment 1 forbids of a history. The refs
 * stay, unchanged, as the integrity handles `14 §16` names — the numbers are the record.
 *
 * `01-F53` is untouched by this: a line's price is captured into `order.line_added` from the
 * CATALOG at line-add. This is a display surface and never a price source; nothing resolves a
 * price by reading history.
 *
 * `null` on either side is a real state and both are constructible: `before_paisa === null` is a
 * cell that did not exist (a new entry, or a newly enabled channel), `after_paisa === null` a cell
 * the edit dropped. Collapsing either to `0` would print "free" where the truth is "absent" —
 * exactly the confusion `01-F60`'s explicit-zero rule exists to prevent.
 */
export const CatalogPriceChange = z.strictObject({
  branch_id: z.string().min(1),
  channel: z.enum(ORDER_CHANNELS),
  before_paisa: z.union([z.number().int().nonnegative(), z.null()]),
  after_paisa: z.union([z.number().int().nonnegative(), z.null()]),
});
export type CatalogPriceChangeT = z.infer<typeof CatalogPriceChange>;

/**
 * `01-F23`'s customer key: *"one customer identity per org, keyed by normalized phone number
 * (E.164)"*. Declared once, here, and used by both `customer.*` payloads — a second copy is a
 * second normalization rule, and two rules make one number two identities.
 *
 * The pattern is E.164 itself: a leading `+`, a country code that cannot start with 0, and at most
 * 15 digits in total. Spaces, hyphens and the local dialling form are all REFUSED — see the note
 * on `customer.created` for why refusing at the schema is the whole point rather than an
 * inconvenience.
 */
const PhoneE164 = z
  .string()
  .regex(
    /^\+[1-9]\d{1,14}$/,
    "phone_e164 must be normalized E.164 (01-F23) — a leading +, no spaces or hyphens, " +
      "at most 15 digits; the local dialling form (03001234567) is a SECOND identity for one " +
      "customer and is refused here rather than normalized in a fold",
  );

// Payloads are loose objects: required fields are law; extra fields pass through
// (additive evolution, 00 §6) and are preserved for consumers.
const payloadSchemas = {
  "order.created": z.looseObject({
    order_id: z.string().min(1),
    // 02-F42 — a CLOSED set, because 01-F60 makes this the key a line's price resolves from.
    // Required, and deliberately so: an order with no channel has no resolvable price at all.
    channel: z.enum(ORDER_CHANNELS),
    // Optional declared fields, additive under schema_version 1 (00 §6; T-01-04).
    order_type: z.string().min(1).optional(),
    table_id: z.string().min(1).optional(),
  }),
  "order.confirmed": z.looseObject({
    order_id: z.string().min(1),
  }),
  "order.line_added": z.looseObject({
    order_id: z.string().min(1),
    line_id: z.string().min(1),
    item_id: z.string().min(1),
    qty: z.number().int().positive(), // integer units (00 §6)
    unit_price_paisa: z.number().int().nonnegative(), // snapshotted at line-add, never re-derived (01-F18)
  }),
  // 01-F22 / 01-F57: an operational toggle, never a catalog edit. `supersedes` is the
  // carried causal link — the ONLY thing that makes this converge, exactly as for
  // `order.table_assigned`. "Latest wins" would need a clock or an id comparison, and both
  // are banned from folds (01-F45, 01-F34).
  "availability.changed": z.looseObject({
    item_id: z.string().min(1),
    available: z.boolean(),
    supersedes: z.array(z.string().min(1)),
    reason: z.string().min(1).optional(),
  }),
  /**
   * `01-F52` / `14 §` / `15 §` — an AUDIT record that a catalog version exists. It is in the
   * `01 §4` catalog and was missing from this registry, which `01-F4` turns into a runtime
   * error at emit: doc 14's back office could not record a menu edit at all.
   *
   * **It does not carry the catalog** (`01-F52`), and the device never consumes it — a device
   * learns its catalog is stale by comparing versions on `hello_ack` and fetching
   * (`plans/wave-1/catalog-transport.md` §3.1). Its consumer is the back-office history view
   * (`14-F6` price history), which is why the payload is actor + before/after REFS rather than
   * entity bodies: a ledger event that carried the menu would make the catalog ledger data,
   * contradicting `01-F52` in the same breath as satisfying it.
   *
   * **`01-F62` (August 2026) makes this ORG-SCOPED**: it carries `org_id`, no `branch_id` and no
   * branch stamp, and its ordering authority is `server_received_at` (`01-F18`). It never enters a
   * branch stream and no device folds it — which is why a server clock is legitimate here and is
   * not the `01-F43` device-clock threat wearing a disguise.
   */
  "catalog.changed": z.looseObject({
    /** The catalog entity edited — `item`, `variant`, `category`, `modifier_group`. */
    entity: z.string().min(1),
    entity_id: z.string().min(1),
    /** The org catalog version this edit produced. Devices compare against it; see §3.2. */
    version: z.number().int().positive(),
    /**
     * `14 §`'s before/after REFS. Opaque content-addressed handles into the published
     * snapshot, never inline entity bodies — see the note above.
     */
    before_ref: z.union([z.string().min(1), z.null()]),
    after_ref: z.union([z.string().min(1), z.null()]),
    /**
     * `14-F3` — the cells that moved, so the history can render *"450 → 480"*. See
     * `CatalogPriceChange`.
     *
     * **Optional HERE and required at the WRITER, and that is not a relaxation** — the same split
     * `01-F60` already makes for `CatalogEntryWire.prices`. Making it required in this schema
     * would be a *retroactive* requirement on an **append-only** ledger (commandment 1): every
     * `catalog.changed` written before August 2026 lacks the field, and `parseEvent` would refuse
     * to read the history this FR exists to render. Absent therefore means "predates the field",
     * which is a different fact from `[]` ("this edit moved no price") — and both are different
     * from a writer that forgot, which is why `services/api`'s `LedgerRecord` types it as
     * REQUIRED and possibly empty. The distinction the two levels buy is exactly the one
     * `01-F60`'s explicit zero buys: absence and nothing are not the same answer.
     */
    price_changes: z.array(CatalogPriceChange).optional(),
  }),
  "order.table_assigned": z.looseObject({
    order_id: z.string().min(1),
    table_id: z.string().min(1),
    // T-01-15 (01-F34 rewritten): the carried causal link — the ONLY thing that makes
    // the table anchor converge (matrix §3). Required; [] legal (a root assignment).
    supersedes: z.array(z.string().min(1)),
    // Names the origin table (null when none) so `table:<from>` is nameable — no ghost
    // chip, and the hub can compute the 01-F41 delivery halt (matrix §3).
    from_table_id: z.union([z.string().min(1), z.null()]),
  }),
  "kot.printed": z.looseObject({
    order_id: z.string().min(1),
  }),
  /**
   * `03-F5`'s third consequence: "`kot.print_failed` is emitted (consumed by doc 05 alarms)".
   * The type is `01 §4` catalog vocabulary already; this is its payload, and without it the
   * emission `03-F5` requires is a `01-F4` runtime error rather than a ledger record.
   *
   * TWO fields, because `03-F5` names exactly two nouns and rests its whole design on them —
   * "naming the printer and order ('KOT #142 did not print — grill printer offline')". `05-F3`
   * raises the same fact on the manager console ("the kitchen can't print" must reach the
   * manager off the floor), and a console alarm that cannot say WHICH printer sends someone
   * walking. `printer_name` rather than a printer id because no printer registry exists yet
   * (`03-F2`'s routing table is doc-14 work) and an id nothing resolves is worse than a name.
   */
  "kot.print_failed": z.looseObject({
    order_id: z.string().min(1),
    printer_name: z.string().min(1),
  }),
  "order.line_state_changed": z.looseObject({
    order_id: z.string().min(1),
    line_ids: z.array(z.string().min(1)).min(1),
    state: z.enum(ORDER_LINE_STATES),
    // T-01-15 (01-F34/01-F35): per-line edge context — without `from_states` the event
    // is a value, not an edge (legality judgeable only from comparator position);
    // without `preds` concurrency is undetectable. Required, per-line, because a
    // multi-line event's lines sit at different heads (matrix §3). `from_states` pins
    // min 1: ∀ over ∅ is vacuously legal (Addendum-C).
    line_context: z.record(
      z.string().min(1),
      z.looseObject({
        to: z.enum(ORDER_LINE_STATES),
        from_states: z.array(z.enum(ORDER_LINE_STATES)).min(1),
        preds: z.array(z.string().min(1)),
      }),
    ),
  }),
  "payment.recorded": z.looseObject({
    order_id: z.string().min(1),
    amount_paisa: z.number().int().nonnegative(),
    /**
     * A CLOSED set, not a free string. `02-F12` names four tender methods and `01-F32` names
     * the fifth; `payment.refunded` next door has been a closed enum since it was written, and
     * a settlement method that is open while a refund method is closed is an asymmetry with no
     * justification behind it.
     *
     * It matters more than tidiness because the method is not decoration: `02-F17` feeds it to
     * channel economics (docs 12/13) and to tax posture (doc 16), and `01-F32`/`DEC-MONEY-007`
     * make `aggregator_receivable` and `khata_credit` behave DIFFERENTLY in conservation. A
     * typo'd method would not fail anywhere — it would quietly become a sixth category that no
     * report knows to count, in an append-only ledger where it cannot be corrected in place.
     */
    method: z.enum(PAYMENT_METHODS),
    settlement_attempt_id: z.string().min(1), // 01-F31: double-taps cannot double-record
    /**
     * The shift this settlement buckets to (`26 §7`: shift/day/drawer bucketing of a payment is
     * "a **carried key**", explicitly not an ordering question). Carried because the alternative
     * — a fold asking "which shift was open when this payment arrived?" — reads the READING
     * device's state, so two devices project different money from the same event set: the
     * `01-F34` break law 1 exists to prevent.
     *
     * REQUIRED AND NULLABLE. `null` is `02-F37`'s "null shift reference": settling with no shift
     * open **succeeds** (`01-F17` forbids blocking the sale — a customer is standing there), and
     * the null is the record that it happened. Required rather than optional because `null` is a
     * stated fact and `undefined` is a forgotten field, and an optional field cannot tell them
     * apart.
     */
    shift_id: z.union([z.string().min(1), z.null()]),
    // T-01-15 (01-F30/01-F32, DEC-MONEY-007): the khata discriminator — without it the
    // settlement and its later repayment double-count under full observation (matrix §3).
    // Required: an unpurposed payment is neither tendering nor repayment.
    purpose: z.enum(["settles_order", "repays_receivable"]),
  }),
  "payment.refunded": z.looseObject({
    // T-01-15 (01-F29 amended): the order key is CARRIED, never resolved through the
    // parent — the late-resolving-entity trap's one-field fix (26 §4).
    order_id: z.string().min(1),
    amount_paisa: z.number().int().nonnegative(),
    method: z.enum(["cash_out", "raast_reversal_ref", "khata_credit"]),
    // 01-F31: the refund's OWN idempotency key — a double-tapped manager approval
    // must dedupe.
    settlement_attempt_id: z.string().min(1),
    // 01-F29: the parent payment's settlement_attempt_id — the cap resolves parents by
    // attempt id, never envelope id (an intent under two envelope ids fragments an
    // id-keyed cap, 26 §8). `payment_id` (envelope-id ref) is superseded: no longer
    // required, tolerated as a loose extra.
    payment_attempt_id: z.string().min(1),
  }),
  // T-01-15 (01-F33): settlement is an ACT, not a derivation — the cashier-emitted,
  // offline-legal closing fact `settled` folds as a monotone OR over. Snapshot fields
  // beyond order_id are additive loose extras until the oracle pins them (T-01-15
  // addendum: proposed in the implementer's report, pinned in a follow-up).
  "order.settlement_closed": z.looseObject({
    order_id: z.string().min(1),
  }),
  // ── The service surface (02-F21..F26): shifts, the business day, the drawer. ──────────
  // `26 §7` decides the shape of all seven: bucketing is a CARRIED KEY, duplicate shift/day
  // open needs a CARRIED CAUSAL LINK (`prev_shift_id`), and over/short is a CARRIED FACT.
  // Nothing here may be resolved at fold time from the reading device's state (01-F34).
  "shift.opened": z.looseObject({
    // 02-F22: the shift a cashier's subsequent settlements and drawer events bind to.
    shift_id: z.string().min(1),
    // 26 §7's carried causal link for "duplicate shift/day open". Two devices opening a shift
    // after a partition both name the same predecessor, so the fork is visible IN THE EVENT SET
    // instead of needing a clock or an id comparison (01-F45, 01-F34). Required; null is the
    // branch's first shift ever, which a non-nullable link would make unemittable.
    prev_shift_id: z.union([z.string().min(1), z.null()]),
  }),
  "shift.closed": z.looseObject({
    shift_id: z.string().min(1),
    // 02-F23: "system-expected cash (by method)" — see `expectedPaisaByMethod`.
    expected_paisa_by_method: expectedPaisaByMethod,
    counted_cash_paisa: z.number().int().nonnegative(),
    // 02-F23's over/short, SIGNED: "over/short" is two directions, and a magnitude-only field
    // can record an over but not a short — the half that costs a cashier their job. Carried,
    // not recomputed: re-deriving "expected" at read time silently changes a number the cashier
    // already signed once a late payment arrives, which `01-F1` forbids.
    variance_paisa: z.number().int(),
  }),
  "day.opened": z.looseObject({
    day_id: z.string().min(1),
    // 02-F22: "opening float entry → day.opened" — the float IS the entry. A magnitude: cash is
    // physically placed in the drawer, and 0 (an empty drawer) is legal and distinct from absent.
    opening_float_paisa: z.number().int().nonnegative(),
    // 26 §7 names duplicate shift/day open as ONE row — the day carries the same link.
    prev_day_id: z.union([z.string().min(1), z.null()]),
  }),
  "day.closed": z.looseObject({
    day_id: z.string().min(1),
    // 02-F24: "manager cash count + deposit record" — the count is the act.
    counted_cash_paisa: z.number().int().nonnegative(),
  }),
  "cash.drawer_opened": z.looseObject({
    // 02-F21: "cash.drawer_opened with reason=no_sale, logged and counted (classic theft
    // vector)". The set is NOT closed: the FR names one value and implies others exist, and
    // closing it here would be inventing an FR.
    reason: z.string().min(1),
    // 02-F22: "a shift binds subsequent cash settlements AND DRAWER EVENTS to that cashier";
    // 26 §7: drawer bucketing is a carried key. Nullable for 02-F21's own reason — an unbound
    // drawer open that the schema refused would go UNLOGGED, which is the theft vector itself.
    shift_id: z.union([z.string().min(1), z.null()]),
  }),
  "cash.paid_out": z.looseObject({
    // 02-F26 names reason + receipt ref but not the amount. Required anyway: `02-F23`'s
    // system-expected cash cannot be computed if cash may leave the drawer without saying how
    // much. A magnitude — direction comes from the event type, and a negative paid-out is a
    // deposit in disguise that would net the drawer the wrong way.
    amount_paisa: z.number().int().nonnegative(),
    reason: z.string().min(1),
    // 02-F26: "receipt photo (object storage ref)".
    receipt_photo_ref: z.string().min(1),
    // Petty cash leaves a particular cashier's drawer (02-F22, 26 §7); nullable as above.
    shift_id: z.union([z.string().min(1), z.null()]),
  }),
  "cash.deposit_recorded": z.looseObject({
    amount_paisa: z.number().int().nonnegative(),
    // 02-F24 emits the deposit record with the day close, so it buckets to a day (26 §7).
    day_id: z.string().min(1),
  }),
  /**
   * ── `02-F20`'s FOUR ESCALATABLE WRITES ───────────────────────────────────────────────────────
   *
   * *"Manager escalation required for: void after KOT, comp, discount above org threshold, price
   * override (`order.line_price_overridden`, extension §5) … the recorded event carries actor +
   * approver either way."* All four have been `01 §4` catalog vocabulary since July 2026 and none
   * had a payload schema here, so `01-F4` — *"producing an unknown/invalid event type is a
   * build-time and runtime error"* — made them **unemittable rather than merely unbuilt**, and
   * `05-F19`'s paid-out was the only act an approval could complete. `26 §` names the consequence
   * for the money: *"three of the four RHS terms of `01-F30` therefore evaluate to zero today."*
   *
   * **The APPROVER is a payload field and the ACTOR is not (`02-F20` + `02-F41` + `02-F45`).**
   * The envelope carries exactly one identity slot and `02-F45` forbids duplicating the actor into
   * the payload — so the cashier is `actor_user_id` on the envelope, stamped at append from the
   * live session, and the manager is the field below. Two identities, two homes, neither absorbing
   * the other. This is the shape `approval.granted`'s note fifty lines down describes from the
   * other end.
   *
   * **`approver_user_id` is REQUIRED and NULLABLE, and the nullability is not a hedge.**
   * `permissions.ts` ships `branch_manager: "allow"` for `order.void_after_kot`,
   * `order.comp_item`, `order.discount_above_threshold` and `order.price_override`, so a manager
   * performs all four **unsupervised** — there is no second identity to record and no escalation
   * happened. A non-nullable field would make her own void throw inside `store.append`, i.e.
   * `01-F4` refusing an act the matrix permits outright. `null` therefore means *"no approval was
   * involved"* and absence means *"a writer forgot"*; an `.optional()` field cannot tell those
   * apart, which is the `payment.recorded.shift_id` / `prev_shift_id` reasoning one family over.
   *
   * **The money is a MAGNITUDE.** `01-F30` SUBTRACTS all three terms, so a negative void would ADD
   * to the bill through a minus sign, permanently, in a ledger `01-F1` forbids correcting in
   * place. `cash.paid_out` above records the identical rule in its own words.
   *
   * **`reason` is required on all four**, and the binding constraint is mechanical rather than
   * stylistic: `approval.requested.reason` below is `z.string().min(1)` and its only honest source
   * is the act being approved, so an act carrying no reason makes a legal request unconstructible
   * unless something INVENTS words for it (commandment 2). `05-F5` also requires the interrupt
   * card to show a *"stated reason"* before a manager decides, and doc 04's void flow ("waiter
   * requests void **with reason**") and `01-F29`'s `reason` on refunds are the same requirement on
   * neighbouring surfaces.
   *
   * **What is deliberately NOT declared.** A payload `line_id` on the three `*.recorded` acts:
   * `05-F5` says "order/line refs" and `00 §6` puts soft references on the ENVELOPE's `refs[]`, so
   * a payload line key would be a second place to say what an act touches and two can disagree.
   * `campaign_id` on `discount.recorded`: `17-F17` calls it *"additive under the same schema
   * version"*, `looseObject` already carries it, and declaring it now would be doc 17's work.
   * A `before_unit_price_paisa` on the override: `01-F53` snapshots the price into
   * `order.line_added` per line, so the previous number already has exactly one home (`14-F3`'s
   * before/after pair exists for the opposite reason — a catalog cell has no event to read its
   * previous value from, and a line does).
   *
   * **OWED, and named rather than left to look intentional:** `packages/sync-client`'s merge
   * engine consumes all four as **projection-inert**, so `01-F30`'s `void_value`, `comp_value` and
   * `discounts` terms still evaluate to zero. Declaring their fold rule is a `26 §7` decision
   * (an oracle-pinned merge rule), not an implementer's, and it is not what `01-F4` was blocking.
   */
  "void.recorded": z.looseObject({
    // `01-F30` conserves per ORDER, and `26 §3`'s projection-key sidecar answers
    // `order:<payload.order_id>` for every order-keyed event — an act with no order key reaches
    // no projection at all and can be conserved against nothing.
    order_id: z.string().min(1),
    amount_paisa: z.number().int().nonnegative(),
    reason: z.string().min(1),
    approver_user_id: z.union([z.string().min(1), z.null()]),
  }),
  "comp.recorded": z.looseObject({
    order_id: z.string().min(1),
    amount_paisa: z.number().int().nonnegative(),
    reason: z.string().min(1),
    approver_user_id: z.union([z.string().min(1), z.null()]),
  }),
  "discount.recorded": z.looseObject({
    order_id: z.string().min(1),
    amount_paisa: z.number().int().nonnegative(),
    reason: z.string().min(1),
    approver_user_id: z.union([z.string().min(1), z.null()]),
  }),
  /**
   * The override names ONE line and the price it becomes. Unlike a void it is definitionally
   * per-line: `01-F53` snapshots `unit_price_paisa` into `order.line_added` per line, and an
   * override with no line key names no number it could be replacing.
   *
   * Zero is accepted deliberately — `01-F60`'s explicit zero is what makes "free" distinguishable
   * from "forgotten", and a line given away is a real act the ledger must be able to hold.
   */
  "order.line_price_overridden": z.looseObject({
    order_id: z.string().min(1),
    line_id: z.string().min(1),
    unit_price_paisa: z.number().int().nonnegative(),
    reason: z.string().min(1),
    approver_user_id: z.union([z.string().min(1), z.null()]),
  }),
  /**
   * `05-F7`'s event extension, transcribed. The `01 §4` catalog has carried
   * `approval.requested / granted / denied` since its July 2026 absorption of the module
   * extensions; only the payload schemas were missing, so `01-F4` made every one of them an
   * emit-time `UnknownEventTypeError` and `02-F20`'s REMOTE path had nothing it could say.
   * `apps/pos-electron/src/main/authorize.ts` maps the escalatable acts to matrix actions ahead
   * of their events for the same reason and says so at its `WRITE_ACTIONS` table.
   *
   * **`requester_id` is a payload field and that is NOT a `02-F45` breach.** That FR forbids
   * duplicating the ACTOR into the payload, and on `approval.requested` the actor IS the
   * requester — so on this event alone the field would be a second source for one fact. It is
   * required anyway, for a reason `02-F45` does not reach: the GRANT is a different event with a
   * different actor, and `02-F38`'s refusal compares the approver against the requester. A grant
   * that cannot name its requester cannot be checked against `02-F38` at all, and the alternative
   * — resolving the requester by joining the request's envelope at grant time — is a read the
   * granting plane may not be able to perform (`05-F9` grants remotely, over cloud). `05-F5` also
   * lists "requester (name, role)" among what the interrupt card must show before a decision.
   */
  "approval.requested": z.looseObject({
    // `05-F7`: "Grants reference the request id, are idempotent, and the first response wins."
    // `01-F36` scopes that idempotency to a request that is still pending, so the id is the key
    // both responses carry and the only thing that makes a duplicate grant a logged no-op.
    request_id: z.string().min(1),
    approval_type: z.enum(APPROVAL_TYPES),
    // `05-F7`: "refs[] (order/line/paid-out ids)". The ENVELOPE's `refs[]` carries the kernel's
    // soft references (`00 §6`); this is the payload's own business list, and it may be empty
    // for an act whose subject is not addressable yet.
    approval_refs: z.array(z.string().min(1)),
    // `05-F7`: "amounts". Integer paisa (`00 §6`), a magnitude like `cash.paid_out`'s — the
    // direction is carried by what is being approved, never by a sign.
    amount_paisa: z.number().int().nonnegative(),
    // `05-F5`: "stated reason".
    reason: z.string().min(1),
    // `05-F7`: "requester_id, requesting device_id".
    requester_id: z.string().min(1),
    requesting_device_id: z.string().min(1),
  }),
  /**
   * `05-F6`/`05-F7`. **TWO IDENTITIES, AND THE SCHEMA IS WHERE LOSING ONE BECOMES
   * UNREPRESENTABLE.**
   *
   * `02-F41` rules that attribution is whoever's PIN is in, with no "acting for" concept. The
   * local path protects that mechanically: `apps/pos-electron/src/main/index.ts` builds a SECOND
   * `createPinSession` for approvals, because `unlock()` MOVES the session — approving through
   * the cashier's own would sign her out, and `02-F41` would then attribute her next twenty
   * orders to whoever authorised one paid-out, permanently, in a ledger `01-F1` forbids
   * correcting in place. `02-F20` asks for the opposite: *"the recorded event carries actor +
   * approver either way"*.
   *
   * A REMOTE grant has to preserve the same property across a plane boundary, where there is no
   * session to move and therefore no mechanism that protects it by construction. So it is
   * protected by the shape instead: `approver_user_id` and `requester_user_id` are BOTH required
   * and are DIFFERENT fields, so a grant that collapsed the two into one identity does not
   * typecheck and does not parse.
   *
   * **The envelope's `actor_user_id` on THIS event is the APPROVER** — the manager acted, on the
   * manager's own device, and granting is their act. It is not the cashier. A grant whose
   * envelope named the cashier would be the local path's defect committed on the remote one: the
   * session moved, one identity where there must be two.
   *
   * `05-F6`'s resulting `void/comp/discount.recorded` then carries `actor_user_id = requester`
   * (unchanged) and `approver_user_id` as a payload field — the envelope has exactly one identity
   * slot, which is why the approver is a payload field there and why it must be one here too, in
   * the shape the escalated write will consume.
   */
  "approval.granted": z.looseObject({
    request_id: z.string().min(1),
    approver_user_id: z.string().min(1),
    requester_user_id: z.string().min(1),
  }),
  /**
   * `05-F7`. A denial is a RECORD, never the absence of one — `05 §4`'s paid-out flow reads its
   * reason back at the counter (*"the paid-out stays pending at the POS with the denial reason;
   * cash does not leave the drawer against the ledger"*), and under `01-F1` a decision that left
   * no row could not be distinguished later from a request nobody ever saw.
   *
   * Both identities for `approval.granted`'s reason: a denial is a decision about somebody, and
   * `02-F38` binds it identically — a requester may not deny their own request into the ledger
   * any more than they may grant it.
   */
  "approval.denied": z.looseObject({
    request_id: z.string().min(1),
    approver_user_id: z.string().min(1),
    requester_user_id: z.string().min(1),
    reason: z.string().min(1),
  }),
  /**
   * ── THE CUSTOMER FILE (`02-F27`'s inline creation) ───────────────────────────────────────────
   *
   * *"unknown number → inline customer creation (`customer.created`, `customer.address_added`)"*.
   * Both types have been `01 §4` catalog vocabulary since the July 2026 absorption and neither had
   * a payload schema here, so `01-F4` made them **unemittable rather than merely unbuilt** — the
   * phone half of `restaurant-os.md §8`'s item 7 could not start, because `02-F28`'s *"≤30 s from
   * NUMBER ENTRY"* needs a lookup and a lookup needs something the ledger can write.
   *
   * **`phone_e164` is the projection key on BOTH events, and it is carried, never resolved.**
   * `01-F23` keys the identity *by the normalized phone number (E.164)*; no `customer_id` exists
   * anywhere in the corpus. So the address event carries the phone DIRECTLY rather than a handle to
   * its create — `26 §4`'s late-resolving-entity trap names resolving a key through a parent as the
   * defect and a one-field schema addition as the fix, and `01-F29` already applied exactly that to
   * `payment.refunded.order_id`.
   *
   * **E.164 IS VALIDATED HERE, AND THAT IS THE LOAD-BEARING DECISION.** The local dialling form a
   * Pakistani operator actually types (`03001234567`) is REFUSED. If both forms parsed, one
   * customer would become TWO identities in an append-only ledger `01-F1` forbids correcting in
   * place, `01-F23`'s *"one customer identity per org"* would be false, and `02-F28`'s lookup would
   * miss the repeat customer it exists to find. The alternative — accept anything and normalize
   * inside the fold — is refused because a normalizer in a fold is a POLICY in a fold: two devices
   * on two library versions key one number two ways and project different customer files from an
   * identical event set, the `01-F34` break standing law 1 exists to prevent. Normalization belongs
   * at the WRITER, upstream of `parseEvent`.
   *
   * **This is not an `01-F17` block.** A refused customer record does not refuse a sale: `08-F2`
   * has aggregator orders reach settlement while writing no customer file at all.
   *
   * **`name` is REQUIRED AND NULLABLE**, on the standing rule `payment.recorded.shift_id` and
   * `void.recorded.approver_user_id` already follow: `null` is a stated fact — `06-F11` creates a
   * customer *on first sight* from a checkout that captured only a number — and `undefined` is a
   * writer who forgot. An `.optional()` field cannot tell them apart afterwards. `""` is refused
   * for the same reason: `null` already says *"no name stated"*, so an empty string would be a
   * SECOND encoding of one fact. The name is free Unicode text (`00 §5.6`, `27-F6`): an
   * ASCII-only rule here would make half this country's customers unrecordable.
   *
   * **`address_id` is a MINTED BUSINESS KEY, not the add event's envelope id** — `26 §8`'s
   * ratified ground that *"one intent may legitimately exist under two envelope ids"*, which would
   * fragment a re-emitted address into two rows in a customer's saved list. `01-F31` mints
   * `settlement_attempt_id` at the UI for the identical reason.
   *
   * **What is deliberately NOT declared.** `06-F9`'s area/locality picker and optional map pin:
   * they are doc 06's fields (Wave 2) and ride the `looseObject` additively, exactly as
   * `discount.recorded` declines to declare doc 17's `campaign_id`. No `org_id` on either payload:
   * `01-F24` scopes customer data to the org absolutely and the ENVELOPE already carries `org_id`,
   * so a payload copy would be a second source for one fact — `02-F45`'s argument about the actor,
   * one field over. Both types are BRANCH-scoped under `01-F62` (the emitter is a POS device on a
   * branch floor, and the org-scoped set is fixed at five types that exclude them).
   *
   * **`customer.merged` and `customer.phone_verified` are NOT registered here, and that is a
   * decision rather than an omission.** `01-F23`'s *"merging two identities is an event"* is
   * precisely the act `DEC-CUST-001` governs, and that decision is **`proposed`, not accepted**;
   * giving it a schema would make emittable an event whose fold rule the corpus has not decided
   * (commandment 2). `customer.opted_in / opted_out` belong to `07-F18`'s canonical consent family.
   *
   * **PII, and a dependency rather than a design.** These payloads carry a phone number, a name and
   * a street address. `DEC-DATA-001` (crypto-shredding) is `proposed` and doc 22 owns erasure;
   * nothing here designs, implies or forecloses an erasure mechanism.
   */
  "customer.created": z.looseObject({
    phone_e164: PhoneE164,
    name: z.union([z.string().min(1), z.null()]),
  }),
  "customer.address_added": z.looseObject({
    // 26 §4 / 01-F29: the projection key travels ON the event. An address whose key had to be
    // resolved through its create could not be folded until the create arrived — and 01-F10's
    // parking is for facts waiting on a key that may yet come, not for a key the payload already
    // knows. A delivery address that vanishes because two events crossed is a real delivery a
    // rider cannot make (09-F10 reads this very text off the assigned order).
    phone_e164: PhoneE164,
    address_id: z.string().min(1),
    // 06-F9's "free-text address". Unicode, min 1 — a rider cannot deliver to an empty string.
    address_text: z.string().min(1),
  }),
} as const;

export type KnownEventType = keyof typeof payloadSchemas;

// Audit family (01-F5; 01 §4 admin-family `audit.*` wildcard). These six concrete
// subtypes are ordinary kernel events, hash-chained per device. The chain link lives in
// the PAYLOAD as `prev_audit_hash: string | null` (store-owned platform law, 01 §7) —
// NOT the envelope, because `EventEnvelope` is a strict z.object that strips unknown keys
// (DEC-AUDIT-001 decision 2). At v1 the chain field is the whole payload contract; the
// business fields (who/what) land additively with the emitting modules (docs 05/14/15),
// and `actor_user_id` already carries "who". Kept OUT of `payloadSchemas`/`KnownEventType`
// on purpose: audit events fold to nothing (the fold engine consumes KnownEventType only),
// so the fold layer never needs an audit case.
const auditPayloadSchema = z.looseObject({
  prev_audit_hash: z.union([z.string().min(1), z.null()]),
});

const auditPayloadSchemas = {
  "audit.login": auditPayloadSchema,
  "audit.drawer_opened": auditPayloadSchema,
  "audit.reprint": auditPayloadSchema,
  "audit.threshold_override": auditPayloadSchema,
  "audit.settings_changed": auditPayloadSchema,
  // 01-F5 (amended August 2026): `03-F5` requires that acknowledging an exhausted-retry
  // KOT print alert is "logged (`audit.*`)", and none of the original five fits. It sits in
  // THIS family, not beside `kot.*`, for the reason `audit.drawer_opened` does — silently
  // dismissing the band loses a kitchen ticket with nobody accountable, and the per-device
  // hash chain is what makes a quiet dismissal detectable. Until it was declared here, the
  // ack was an `01-F4` UnknownEventTypeError at emit and `03-F5` could not be satisfied at
  // all (found by K-7, which held the ack in memory rather than mint a subtype).
  "audit.print_acknowledged": auditPayloadSchema,
} as const;

/** The closed set of audit.* subtypes (01-F5). Iterable — `[...AUDIT_EVENT_TYPES]`. */
export const AUDIT_EVENT_TYPES = Object.keys(auditPayloadSchemas) as readonly AuditEventType[];

export type AuditEventType = keyof typeof auditPayloadSchemas;

const AUDIT_TYPE_SET: ReadonlySet<string> = new Set(AUDIT_EVENT_TYPES);

/** True for exactly the six audit.* subtypes (01-F5) — the store stamps the chain for these only. */
export const isAuditEvent = (type: string): boolean => AUDIT_TYPE_SET.has(type);

// Combined lookup for parse-time payload validation (01-F4) across both families — the
// fold-consumed `payloadSchemas` and the fold-inert `auditPayloadSchemas`.
const ALL_PAYLOAD_SCHEMAS: Record<string, z.ZodType> = {
  ...payloadSchemas,
  ...auditPayloadSchemas,
};

/**
 * @unreached-owed The `01 §4` catalog as a queryable thing — "is this a known type", "list the
 * types". Every shipping path validates a CONCRETE event through `parseEvent` instead, so nothing
 * enumerates. The callers are the back office and the Auditor's report surface, both unbuilt.
 */
export const eventRegistry = {
  has: (type: string): type is KnownEventType => type in payloadSchemas,
  types: (): readonly KnownEventType[] => Object.keys(payloadSchemas) as KnownEventType[],
} as const;

export type ParsedEvent = {
  type: KnownEventType;
  payload: unknown;
  envelope: EventEnvelopeT;
};

/** Validates envelope + payload against the catalog — operational and audit (01-F4/01-F5). */
export const parseEvent = (value: unknown): ParsedEvent => {
  const envelope = parseEnvelope(value);
  const schema = ALL_PAYLOAD_SCHEMAS[envelope.type];
  if (!schema) throw new UnknownEventTypeError(envelope.type);
  const payload = schema.parse(envelope.payload);
  return { type: envelope.type as KnownEventType, payload, envelope };
};
