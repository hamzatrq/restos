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
 * `06-F20`'s rejection reasons, transcribed: *"The branch may reject a queued order
 * (`order.rejected`, reason: closed, item unavailable, out of delivery range); the status page
 * states the reason plainly."* Declared once, here, on the `18 §4` rule the four sets above follow —
 * `02-F9`'s inbox renders the three choices and `06-F20`'s status page maps each to prose on the
 * OTHER plane, and neither may hand-copy the list.
 *
 * **CLOSED, and the contrast that decides it is in this file already.**
 * `cash.drawer_opened.reason` a hundred lines down is deliberately OPEN because "`02-F21` names one
 * value and implies others exist, and closing it here would be inventing an FR". `06-F20` names
 * THREE and calls them a list, and `02-F9` says "**Reject** with a reason **from the 06-F20
 * list**" — so closing this one is the transcription and leaving it open would be the invention.
 * The cost of the open version is `payment.recorded.method`'s, one family over: a typo'd reason
 * fails nowhere and becomes a fourth category, printed plainly to a customer on a page the branch
 * cannot take back (`01-F1`).
 *
 * `item_unavailable`'s spelling is not a choice — `06-F27`'s worked scenario already writes it as a
 * backticked identifier. The other two are that same form applied to `06-F20`'s own words.
 * `closed` is transcribed rather than improved: it means *the branch is closed*, and a clearer
 * `branch_closed` would be a word `06-F20` does not use (commandment 2). Display prose is the
 * status page's job, on `06-F18`'s "display label, not a state" precedent.
 */
export const ORDER_REJECTION_REASONS = [
  "closed",
  "item_unavailable",
  "out_of_delivery_range",
] as const;
export type OrderRejectionReason = (typeof ORDER_REJECTION_REASONS)[number];

/**
 * `03-F53` — the CLOSED two-member set `printer.status_changed` reports, declared once here for
 * `18 §4`'s reason (a domain vocabulary is declared in `domain`, and the producer imports it
 * rather than typing the words a second time).
 *
 * `03-F11`'s own words are *"emitted on online/offline transitions per registered printer"*, so
 * the enumeration is transcription rather than design. It is CLOSED because `05-F3` matches on the
 * literal `offline` and `01-F1` admits a typo permanently — and, more sharply, because the
 * vocabulary sitting one import away in `packages/escpos` is the SPOOLER's five job states.
 * `stalled` is one of them and `03-F53` refuses it here at the schema: a printer holding a job for
 * a missing roll ANSWERED the `DLE EOT 4` query (`03-F41`), so it is reachable, and calling that
 * offline would send a manager to check a cable on the most ordinary event in a kitchen.
 */
export const PRINTER_STATUSES = ["online", "offline"] as const;
export type PrinterStatus = (typeof PRINTER_STATUSES)[number];

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

/**
 * **Is this string the FORM `01-F23` keys a customer by?** — the schema above, asked as a
 * question instead of enforced as a refusal.
 *
 * It exists so the rule has exactly ONE home while normalization stays where the comment on
 * `customer.created` puts it: *"Normalization belongs at the WRITER, upstream of `parseEvent`."*
 * A writer must decide, BEFORE it appends, whether the digits an operator typed resolve to a key
 * at all — `02-F27`'s lookup answers `phone_e164: null` for a half-typed number and appends
 * nothing, so it cannot learn the answer by being refused. Without this export the writer would
 * carry its own copy of the pattern, which is the second rule this schema's own comment names as
 * the defect: two rules make one number two identities.
 *
 * A PREDICATE and not the schema, deliberately. What a writer needs is a yes/no about a
 * candidate key; handing out `.parse` would put a second refusal point beside `parseEvent`'s,
 * with its own message and its own failure mode. **It normalizes nothing** — the country default
 * that turns `03001234567` into `+923001234567` is policy no FR or `00 §7` layer states, and
 * putting an unstated default in the kernel would make every plane inherit one guess.
 */
export const isPhoneE164 = (value: unknown): value is string => PhoneE164.safeParse(value).success;

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
  /**
   * `02-F9`'s other half: *"**Reject** with a reason from the 06-F20 list → `order.rejected`."*
   * The type has been `01 §4` vocabulary since the July 2026 absorption — which names THIS event
   * as the one that "blocked a Wave-1 cashier task" — and had no payload schema here, so `01-F4`
   * made it **unemittable rather than merely unbuilt** and the inbox could ship Accept only.
   *
   * `reason` is the closed `ORDER_REJECTION_REASONS`; the argument is at its declaration.
   *
   * **NO `supersedes`, and the asymmetry with the park pair below is deliberate.** A rejection is
   * terminal and has no inverse anywhere in `01 §4` — `06-F19` puts post-confirmation reversal on a
   * phone call and a `void.recorded`, not on an un-reject event — so it is the same monotone shape
   * as `order.confirmed` directly above, whose payload is the order key alone.
   *
   * **No `rejected_by`** (`02-F45`): the envelope's `actor_user_id` is the one home for who acted,
   * and a payload copy is a second answer that can disagree with it permanently (`01-F1`).
   */
  "order.rejected": z.looseObject({
    // `06-F22` makes the reversal metering event "idempotent on order id", and `26 §3`'s sidecar
    // answers `order:<payload.order_id>` — a rejection naming no order reverses nothing and
    // reaches no projection.
    order_id: z.string().min(1),
    reason: z.enum(ORDER_REJECTION_REASONS),
  }),
  /**
   * `02-F4`: *"Park/resume open orders: `order.parked` / `order.unparked`. A parked order is
   * durable (00 §5.2) and visible to every terminal in the branch."* Both types were `01 §4`
   * vocabulary with no schema, so parking was an `01-F4` `UnknownEventTypeError` inside
   * `store.append` — `apps/pos-electron` holds `cartOrderId` in renderer state for exactly that
   * reason, and an order abandoned to a relaunch is reachable only through an `orders[0]` fallback.
   *
   * **Each half carries a REQUIRED `supersedes` (`[]` legal), and this is the interpretation to
   * argue with.** The simpler alternative is `{ order_id }` alone — literally what `02-F4` lists —
   * and it is refused for two reasons, in this order:
   *
   *   (i) This is the catalog's first REPEATABLE toggle on one key: `02-F11` has an order "parked
   *       there and resumed, extended, or settled on another", so park → resume → park again is
   *       ordinary rather than exotic. A set of bare facts cannot tell the second park from the
   *       first without arrival order, a clock or an id comparison — all three banned by `01-F34`
   *       and `01-F45`. `availability.changed` and `order.table_assigned` are the corpus's two
   *       worked answers to this exact shape, and both say so in their notes above: the carried
   *       causal link is "the ONLY thing that makes this converge".
   *   (ii) The failure modes are ASYMMETRIC, which is the decisive half. A field that turns out
   *       unnecessary costs a column that is always `[]` and can be relaxed later. A field omitted
   *       and later needed cannot be added as required at all — `01-F1` makes every `order.parked`
   *       already written unparseable — and adding it `.optional()` then confuses "a root park"
   *       with "a writer forgot", the distinction `payment.recorded.shift_id` and
   *       `catalog.changed.price_changes` are both written up here to preserve.
   *
   * **A STATED COST, so it is not discovered later:** no fold projects a park today (see the
   * disposition below), so an emitter has no head set to read and every shipped park honestly
   * carries `[]`. That is a root, exactly what `order.table_assigned` writes for a root assignment.
   *
   * **OWED, and named rather than left to look intentional.** `packages/sync-client`'s merge engine
   * consumes all three as **projection-inert**, so a parked order is indistinguishable from an
   * active one and a rejected order goes on appearing in every till's `open_orders`. `26 §7` makes
   * a merge rule an ORACLE-PINNED decision rather than an implementer's, and it is not what `01-F4`
   * was blocking. `02-F4`'s own requirement is already met without a new projection: "visible to
   * every terminal in the branch" holds because `open_orders` folds from the branch stream and the
   * order has been in it since its `order.created`.
   */
  "order.parked": z.looseObject({
    order_id: z.string().min(1),
    supersedes: z.array(z.string().min(1)),
  }),
  "order.unparked": z.looseObject({
    order_id: z.string().min(1),
    supersedes: z.array(z.string().min(1)),
  }),
  "order.line_added": z.looseObject({
    order_id: z.string().min(1),
    line_id: z.string().min(1),
    item_id: z.string().min(1),
    qty: z.number().int().positive(), // integer units (00 §6)
    unit_price_paisa: z.number().int().nonnegative(), // snapshotted at line-add, never re-derived (01-F18)
  }),
  /**
   * `02-F8`'s pre-confirm removal — `C8`, ~10–25× a shift, and the only thing a cashier can do
   * when a customer says "no Coke". The type has been `01 §4` vocabulary since Wave 0, carrying
   * the dagger *"removal pre-KOT is a plain event; post-KOT it must be a `void.recorded` with
   * approver"*, and had no payload schema — so `01-F4` made it **unemittable rather than merely
   * unbuilt**, and `packages/ui`'s `Cart` shipped an `onRemove` prop with nothing to emit.
   *
   * **`{ order_id, line_id }` and nothing else, because `02-F8` calls it a *plain* event** in
   * contrast with the void it names in the same sentence. Each field the neighbouring
   * `void.recorded` requires is refused here for its own reason, and all three are product
   * failures rather than schema opinions:
   *   · `reason` — `27-F6` bans required non-numeric typing on a critical path, and Appendix B
   *     puts *"reason + PIN"* on the post-KOT void alone.
   *   · `approver_user_id` — its presence is precisely what `02-F8` says separates the two paths.
   *     Requiring one here would delete the distinction the dagger exists to draw.
   *   · `amount_paisa` — a removal states no money. `01-F53` snapshotted the price into
   *     `order.line_added`, so a second copy here is a number that can disagree with the line it
   *     names, permanently (`01-F1`), and `01-F30` has no `removed_value` term to feed.
   *
   * **NO `qty`.** No FR describes a partial-quantity decrement, and `AddLineRequestSchema`'s own
   * comment already records the corpus's reading: *"Positive: removing a line is
   * `order.line_removed`, not a qty of 0."* Removing two of three is a removal plus a re-add.
   *
   * **NO `supersedes`, and the asymmetry with `order.parked` above is deliberate.** A removal is
   * MONOTONE on its line key — `01 §4` has no `order.line_restored`, and putting the dish back is
   * a fresh `order.line_added` with a fresh `line_id` (`01-F1`) — so the delivered set converges
   * as a grow-only tombstone set with no causal link at all, commutative and idempotent, needing
   * no clock, no sequence and no id comparison (`01-F34`). The park pair needs its link because it
   * is a REPEATABLE TOGGLE on one key; a removal has no second state to return to.
   *
   * **The BOUNDARY is not enforceable here and `02-F49` says why**: `01-F4` validates a payload,
   * and whether an order is confirmed is a FOLD fact no payload carries. The guard is a
   * synchronous read of the till's own `openOrders()` in `apps/pos-electron/src/main` — see
   * `line-removal-guard.ts`. What this schema owns is that the two acts are structurally
   * different shapes, so neither can be silently routed through the other.
   */
  "order.line_removed": z.looseObject({
    // `02-F9` makes this "the only partial-confirmation mechanism", and a partial confirmation
    // that cannot name WHICH line is not partial.
    order_id: z.string().min(1),
    line_id: z.string().min(1),
  }),
  /**
   * `02-F6`'s item note — `C7`, ~10–40× a shift — *"free text + org-configurable quick-tags
   * ('less spicy') → `order.note_added`, printed prominently on the KOT"*. `01 §4` vocabulary
   * since Wave 0 with no payload schema, so `01-F4` made the whole FR unemittable.
   *
   * **`line_id` is REQUIRED, and the type name is the trap.** The event is called
   * `order.note_added`, so `{ order_id, note }` is what the name suggests — but `02-F6` writes
   * *"**Item** notes"* and `03-F3` *"**item** notes visually emphasized"*, and `03-F55` puts the
   * note inside its item's block for `27-F57`'s measured reason: separating a note from the dish
   * it qualifies is the mapping step where comprehension collapses from ~71% decode to ~35%
   * execute. A note with no line key can only print at the foot of the ticket, qualifying every
   * dish or none.
   *
   * Required rather than `.optional()` because that is the recoverable direction: relaxing to
   * nullable later refuses nothing already written, while adding a required key later makes every
   * historical note unparseable (`01-F1`), and `.optional()` permanently confuses "an order-level
   * note" with "a writer forgot" — the distinction `payment.recorded.shift_id` and
   * `catalog.changed.price_changes` are both written up in this file to preserve.
   *
   * **NO `supersedes`, and this is `01 §4`'s own naming.** The catalog carries `note_added` and
   * offers no `note_removed` and no `note_changed`. `02-F6`'s quick-tags are a PICK LIST, so two
   * taps are two facts (`02-F50`); a register would make the second tap erase the first, and
   * `27-F59`'s words about a missed removal — *"an allergen incident, not a preference miss"* —
   * apply with full force to a note reading *"no peanuts"*. The fold is a grow-only value set per
   * line (`packages/sync-client`'s `line-correction-fold.test.ts` M2).
   *
   * **NOT capped and NOT truncated.** No FR states a maximum; `03-F49` states minimum COLUMNS
   * only. A `.max()` would refuse an act on invented policy (commandment 2) and a
   * `.transform(slice)` is worse: `parseEnvelope` types `payload` as `z.unknown()`, so the FULL
   * note would be written durably to the ledger while every fold and every reader got the
   * truncated one — `catalog-fetch.ts`'s dropped-field defect relocated into the kernel.
   * `02-F50` keeps Wave 1's input a bounded pick list, which makes the long case rare.
   *
   * **`00 §5.6` reaches here: a non-Latin note is ACCEPTED.** User content is Unicode and is never
   * transliterated or rejected for its script. The printer's refusal is `03-F8`'s
   * (`raster_font_unavailable`) and belongs to `packages/escpos`, not to this schema.
   */
  "order.note_added": z.looseObject({
    order_id: z.string().min(1),
    line_id: z.string().min(1),
    // `.min(1)`: there is no `order.note_removed` in `01 §4`, so `""` cannot mean "clear the
    // note", and `03-F55` gives the note a position in its item block — an empty one prints a
    // blank emphasised row, which is `00 §5.7`'s zero on a clock.
    note: z.string().min(1),
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
  /**
   * **`03-F53` — `03-F11`'s printer transition, and the payload it went a month without.**
   *
   * `03-F11` declared the extension in July, `01 §4` absorbed the type, and no schema was ever
   * written — so `01-F4` made emitting it an `UnknownEventTypeError`, nothing produced it, and
   * `05-F3`'s SECOND alarm trigger has never existed. It is an ORDINARY kernel event and not an
   * `audit.*` one: nobody is accountable for a cable, so there is no chain to stamp.
   *
   * `printer_name` is `kot.print_failed`'s own field name one line up, deliberately — `05-F3`
   * raises both onto ONE alarm list, and a second vocabulary for the same noun would make the
   * console join two spellings of one printer (`03-F40`'s named defect).
   */
  "printer.status_changed": z.looseObject({
    printer_name: z.string().min(1),
    status: z.enum(PRINTER_STATUSES),
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
   *
   * ── `01-F83` — THE ATTEMPT KEY, ADDED AUGUST 2026 (founder ruling R56) ────────────────────────
   *
   * All four gain a REQUIRED `adjustment_attempt_id`. `01-F31`'s mechanism IS a key (*"folds
   * dedupe by attempt key … a fold never picks a winner"*), so a corrective without one
   * double-counts on re-delivery — a double-tapped "void Rs 500" subtracts Rs 1,000, converged on
   * every device and permanent under `01-F1`. `DEC-MONEY-010`'s gate (ii) requires it on **all
   * four** before any of `01-F30`'s three terms may enter the equation; this closes (ii) and
   * nothing else, and the terms stay ABSENT (see `invariants.ts`).
   *
   * **ONE NAMESPACE, TWO FIELD NAMES.** The token obeys `01-F31` unchanged — org-globally unique,
   * UI-minted, UUID-class (`DEC-MONEY-008`) — and shares `settlement_attempt_id`'s uniqueness
   * space, which is what stops a collision. It carries a **different field name** because the name
   * is what stops a fold summing both sides of `01-F30`'s equation into one Σ: settlements on the
   * left, correctives on the right. Its schema is therefore `settlement_attempt_id`'s, character
   * for character — a shape that drifted on one side would break the shared space it names.
   *
   * **REQUIRED, never `.optional()`**, on this file's own `order.parked` argument: `01-F1` makes
   * the append-only ledger permanent, so a field omitted and later needed cannot be added as
   * required at all, and an optional one cannot tell "a root act" from "a writer forgot". The
   * window is open exactly now — `DEC-MONEY-010` (i) measures ZERO production emitters for all
   * four — and it closes at the first emit.
   *
   * **`payment.refunded` gains NOTHING, and the refusal is written down so nobody adds one by
   * symmetry** (`01-F83`). R56's literal list names it; `01-F29` already gives it TWO keys "in
   * those words as *two fields, never one*" — its own `settlement_attempt_id` and the parent's
   * `payment_attempt_id` — so a third would be `02-F45`'s second source for one fact and would
   * fragment the `01-F29` cap that resolves parents by attempt id precisely to avoid fragmentation
   * (`26 §8`). `order.cancelled` and `order.rejected` gain nothing either: no amount, and terminal
   * monotone facts under `01-F35`, so a key on them would dedupe nothing.
   *
   * **Minted at the UI at `02-F20`'s approval path, before the append, and reused by a retry of
   * the same act.** Deriving it from the envelope is refused twice over: `01-F34` forbids a fold
   * comparing envelope ids into a projected value, and it would dedupe the wrong thing — `01-F8`
   * already covers transport duplicates, while the case this key exists for is a double-tapped
   * approval, i.e. two genuine events with two ids.
   *
   * ⚠ **WHAT AN EMITTER THAT FORGETS THIS KEY ACTUALLY COSTS — stated because it is worse than
   * a rejected event, and it is what makes "the window closes at the first emit" load-bearing
   * rather than tidy.** The parse-on-read surface includes `readAllParsed()`
   * (`packages/sync-client/src/device-store.ts:766`), the FULL-LEDGER replay run at **store
   * open** and by `refoldTx()`. So an unkeyed corrective is not merely refused on the way in:
   * on the next launch `parseEvent` throws inside `openStore`, which is **a till that will not
   * start** — and it will not start on the launch after that either, because `01-F1` makes the
   * event permanent. Mint it at the UI or do not append.
   */
  "void.recorded": z.looseObject({
    // `01-F30` conserves per ORDER, and `26 §3`'s projection-key sidecar answers
    // `order:<payload.order_id>` for every order-keyed event — an act with no order key reaches
    // no projection at all and can be conserved against nothing.
    order_id: z.string().min(1),
    amount_paisa: z.number().int().nonnegative(),
    reason: z.string().min(1),
    approver_user_id: z.union([z.string().min(1), z.null()]),
    // 01-F83: the corrective's own `01-F31`-class key. Same shape as `settlement_attempt_id`
    // above (one uniqueness space), different name (two sides of 01-F30's equation).
    adjustment_attempt_id: z.string().min(1),
  }),
  "comp.recorded": z.looseObject({
    order_id: z.string().min(1),
    amount_paisa: z.number().int().nonnegative(),
    reason: z.string().min(1),
    approver_user_id: z.union([z.string().min(1), z.null()]),
    adjustment_attempt_id: z.string().min(1), // 01-F83
  }),
  "discount.recorded": z.looseObject({
    order_id: z.string().min(1),
    amount_paisa: z.number().int().nonnegative(),
    reason: z.string().min(1),
    approver_user_id: z.union([z.string().min(1), z.null()]),
    adjustment_attempt_id: z.string().min(1), // 01-F83
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
    /**
     * **`26 §7` — THE CARRIED CAUSAL LINK, and it is REQUIRED because `01-F1` closes this door
     * permanently (added August 2026, adversarial review of the round that landed this schema).**
     *
     * This payload is a **register keyed on `line_id`** — the comment above says so in its own
     * words, *"the price it becomes"* — and a register is the one shape that cannot converge from
     * its members alone. Two overrides on one line (a manager discounts to Rs 400, the customer
     * negotiates again, a second override sets Rs 380 — `role-task-inventories.md` costs `C26` at
     * 0–5 per shift, so this is ordinary rather than exotic) leave a fold with two candidates and
     * no way to choose. Every tiebreak available to it is banned: `01-F34` forbids reading
     * ordering metadata, and `26 §7` bans `min(envelope.id)` **by name** because UUIDv7 makes an
     * id comparison wall-clock in disguise.
     *
     * `26 §7` prescribes the remedy for this exact row — *"a **carried causal link**
     * (`prev_shift_id`, `supersedes[]`)"* — and says of the sibling case that `supersedes[]` on
     * `order.table_assigned` *"is the only thing that makes the table anchor converge at all"*.
     * `order.parked` / `order.unparked` in this same file carry it for the same reason.
     *
     * **Why REQUIRED and why NOW.** `01-F1` makes the ledger append-only, so a required field
     * added after the first event is written makes that event **unparseable for ever** — this
     * file's own `order.parked` note states the asymmetry: *"A field omitted and later needed
     * cannot be added as required at all… and adding it `.optional()` then confuses 'a root
     * override' with 'a writer forgot'."* Measured at the moment of writing: **no production code
     * constructs this payload** (the `order.line_price_overridden` hits in `apps/` are a label
     * map, a permission-action map and a fold case), so the window is open and closes at the first
     * emit. An empty array is a root override; today every value is `[]`, and that cost is
     * accepted for exactly the reason the park pair accepts it.
     */
    supersedes: z.array(z.string().min(1)),
    /**
     * `01-F83`. This type is in the key's class on the corpus's own grouping rather than on an
     * implementer's judgment — `APPROVAL_TYPES` above already groups it with the other three as an
     * escalatable act, and `DEC-MONEY-010`'s gate (ii) names all four.
     *
     * **It does not duplicate `supersedes` and neither absorbs the other.** `supersedes` is `26 §7`'s
     * CAUSAL link — which earlier override this one replaces, so a register keyed on `line_id`
     * converges. This is `01-F31`'s IDEMPOTENCY key — that this act is ONE act however many times
     * it is delivered. Two overrides on one line are two acts with two keys and a link between
     * them; one override delivered twice is one key.
     */
    adjustment_attempt_id: z.string().min(1),
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

// Audit family (01-F5; 01 §4 admin-family `audit.*` wildcard). These seven concrete
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

/**
 * `05-F30`'s CLOSED two-member set: the categories of `05 §5`'s active alarm list an ack may name
 * — `05-F1`'s late order and `05-F3`'s failed print. Declared once here (`18 §4`) because the
 * DERIVED VIEW that suppresses an acknowledged alarm (`apps/manager/src/alarms.ts`) must narrow
 * against the same two words the ledger admits; two readings of one closed set is `03-F40`'s
 * defect, and here it would mean an ack that parses and clears nothing.
 *
 * ⚠ **`printer_offline` is DELIBERATELY ABSENT and is a founder call, not an oversight.**
 * `05-F3` names `printer.status_changed(offline)` as an alarm trigger, so a third kind is
 * foreseeable — but that alarm has no order to name and no ready/served exit, which neither
 * `05-F1`'s alarm shape (order, channel, table, age) nor `05-F2`'s persistence rule can express.
 * `05-F30` closes the set precisely so the ruling has to widen it VISIBLY, here, rather than
 * arriving as a string nobody enumerated and `01-F1` can never retract.
 *
 * ⚠ **AND THE ASSERTION THAT IS SUPPOSED TO ENFORCE THAT ONLY HALF WORKS — MEASURED 2026-08-13
 * (adversarial mutation).** `alarm-ack-schema` test 7 sweeps `alarm_kind` values including
 * `"printer_offline"` and demands each be refused, but it builds every case from `lateOrderAck()`,
 * whose `printer_name` is **`null`**. So a third arm is caught only if its printer rule also
 * rejects `null`:
 *   · third arm copied from the `late_order` arm (`printer_name: z.null()`) → test 7 REDDENS.
 *   · third arm requiring a printer (`printer_name: z.string().min(1)`) → **all 496 tests pass**,
 *     and `parseEvent` then accepts `alarm_kind: "printer_offline"` into an append-only ledger.
 *     Demonstrated, not inferred: the accepting envelope was parsed and its payload asserted.
 * The second shape is the LIKELIER one, because `05-F3`'s printer-offline alarm is about a printer
 * and `03-F5` says the manager must know which one to walk to — so the widening `05-F30` names as
 * a founder call is exactly the widening this suite cannot see. It is the round-3 law's own
 * worked example (`F60`'s "refused for the right reason") one FR later: `expectRefused` proves the
 * refusal was not `UnknownEventTypeError`, and nothing proves WHICH FIELD did the refusing.
 * The missing fixture is one line: sweep the same kinds against `printFailedAck()` too.
 */
export const ALARM_ACK_KINDS = ["late_order", "print_failed"] as const;
export type AlarmAckKind = (typeof ALARM_ACK_KINDS)[number];

/**
 * **`05-F30` — `05-F2`'s acknowledgment, `01-F5`'s SEVENTH subtype (August 2026).**
 *
 * Until it existed the act was not merely unbuilt but UNEXPRESSIBLE: `01-F4` refused the emit, so
 * **every alarm the manager console raises was permanent** — a manager could see it and never
 * clear it. `apps/manager/src/alarms.ts` had recorded that as unbuildable rather than guess at it.
 *
 * **Why not the sixth subtype, stated because it is the obvious reach.**
 * `audit.print_acknowledged` is `03-F5`'s TILL band: a cashier dismissing an S1 about a print JOB
 * the spooler minted an id for. This is a MANAGER clearing a row of `05 §5`'s list, whose
 * commonest member (`05-F1`) involves no printer at all — so recording a late-order ack under it
 * would state permanently (`01-F1`) that a print was acknowledged when nothing printed, and would
 * put two incompatible id spaces in one field name. Two acts, two surfaces, two people, two types;
 * `05-F30` is explicit that NEITHER ack clears the other's alert.
 *
 * **The business fields are REQUIRED, which `05 §5` forces rather than taste choosing.** `01-F5`'s
 * v1 contract is `prev_audit_hash` alone and *"the business fields (who/what) land additively with
 * the emitting modules"* — this is doc 05 landing them. `05 §5` materializes the alarm list on the
 * device with *"no console-only source-of-truth entities — everything folds from the ledger, so a
 * reinstalled phone reconstructs its state completely (01-F6)"*, so an ack that cannot say WHICH
 * alarm it cleared re-derives to nothing and every acknowledged alarm returns on reinstall.
 *
 * **The FACTS, never a composed alarm id.** The alternative — writing the view's own
 * `kind:order:printer` handle as one string, which is what the sixth subtype does with the
 * spooler's job id — is refused by `05-F30` because that id is a FORMAT: change it and every
 * historical ack silently stops matching. These three fields are already the ledger's own
 * vocabulary (`kot.print_failed` carries `order_id` and `printer_name` under those exact names).
 *
 * **A DISCRIMINATED UNION rather than one flat object**, because the cross-field rule is the
 * sharpest thing here: `05-F4` puts two failed printers on one order in TWO alarms, since `03-F5`
 * says the manager has to know which one to walk to — so a `print_failed` ack naming no printer
 * identifies neither, permanently. A flat `printer_name: string | null` accepts exactly that.
 * The `late_order` arm requires `null` for the mirror reason: `05-F30` says a late-order ack has
 * no printer, and a name written there would be a permanent claim about a printer nobody touched.
 *
 * `prev_audit_hash` comes from `auditPayloadSchema` rather than being retyped — `01-F5` makes the
 * chain STORE-OWNED (the device stamps it inside the append transaction and a caller-supplied
 * value is rejected), and both arms must carry one reading of that field. WHO is the envelope's
 * `actor_user_id`, read at append (`02-F41`); a payload copy would be a second source for one fact
 * that `01-F1` allows no path to correct.
 */
const alarmAckPayloadSchema = z.discriminatedUnion("alarm_kind", [
  auditPayloadSchema.extend({
    alarm_kind: z.literal(ALARM_ACK_KINDS[0]),
    order_id: z.string().min(1),
    // ⚠ **REQUIRED-AND-NULL is a READING of `05-F30` and NOTHING ASSERTS IT.** Measured
    // 2026-08-12: loosening this to `z.union([z.string().min(1), z.null()])` passes all 496 tests
    // in this package. The FR says *"`null` on a `late_order` ack"* and the strict form is taken
    // because `01-F1` makes the permissive direction irreversible — a printer name written onto an
    // alarm with no printer is a permanent claim about hardware nobody touched, while loosening
    // later costs one line and invalidates no history.
    //
    // ⚠ **RE-MEASURED 2026-08-13 (adversarial mutation) AND IT IS WORSE THAN THE NOTE ABOVE
    // SAYS: the whole line can be DELETED.** Not merely loosened to `string | null` — removed
    // outright. Both arms are `looseObject`s (deliberately, test 11), so with this key gone a
    // `late_order` ack carrying `printer_name: "TH230"` parses, and so does one carrying no
    // `printer_name` at all; all **496** tests in this package stay green either way. So the
    // `late_order` arm's printer rule is not weakly asserted, it is UNASSERTED, and `05-F30`'s
    // *"`null` on a `late_order` ack"* rests on this one token. The missing fixture is one line:
    // a `late_order` ack with `printer_name: "TH230"` must be REFUSED (via `expectRefused`, so it
    // cannot pass by way of `UnknownEventTypeError`).
    printer_name: z.null(),
  }),
  auditPayloadSchema.extend({
    alarm_kind: z.literal(ALARM_ACK_KINDS[1]),
    order_id: z.string().min(1),
    printer_name: z.string().min(1),
  }),
]);

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
  // 01-F5 (amended August 2026, SEVENTH subtype) / 05-F30. See `alarmAckPayloadSchema`.
  "audit.alarm_acknowledged": alarmAckPayloadSchema,
} as const;

/** The closed set of audit.* subtypes (01-F5). Iterable — `[...AUDIT_EVENT_TYPES]`. */
export const AUDIT_EVENT_TYPES = Object.keys(auditPayloadSchemas) as readonly AuditEventType[];

export type AuditEventType = keyof typeof auditPayloadSchemas;

const AUDIT_TYPE_SET: ReadonlySet<string> = new Set(AUDIT_EVENT_TYPES);

/** True for exactly the seven audit.* subtypes (01-F5) — the store stamps the chain for these only. */
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
