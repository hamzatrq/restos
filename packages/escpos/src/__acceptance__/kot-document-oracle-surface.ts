// K-5 ORACLE SURFACE — the `kot` document type's own DATA CONTRACT. NOT AN IMPLEMENTATION.
//
// This file declares the shape `kot-document.test.ts` hands `render()` as its `Data` argument. It
// contains no block ids, no slot ids, no regions, no column arithmetic and no layout: every one of
// those is what K-5 IMPLEMENTS, and an oracle that named them would be writing the ticket it exists
// to check. What it does declare is the set of FACTS a KOT must be able to state, because
// `03-F31` puts the data contract in the TYPE ("Each declares its own data contract") and four FRs
// below require distinctions that no unstructured payload can carry.
//
// Authored from spec text only (24 §3 step 2 — read-only to the implementing session):
//   specs/03-kitchen-fulfillment.md `03-F3`  — the KOT layout: "order number + table/channel in
//     large type, timestamp; one line per item with qty/variant/modifiers; … reprints carry a
//     'REPRINT' band".
//   specs/03-kitchen-fulfillment.md `03-F31` — document types are first-class entities; each
//     declares its own data contract, spec, invariants; "modifier emphasis, void marker, reprint
//     marker" are named as differences that live in the TYPE.
//   specs/03-kitchen-fulfillment.md `03-F32` — "a `kot` renders **no money token** under any
//     profile … prices are simply not in the chit data model."
//   specs/03-kitchen-fulfillment.md `03-F37` — "Reprint markers are mandatory per type, in a
//     locked region."
//   specs/03-kitchen-fulfillment.md `03-F38` — long item names are a CATALOG problem: the short
//     `kitchen_name` is resolved up the `01-F21` chain BEFORE it reaches here.
//   specs/03-kitchen-fulfillment.md `03-F50` — a sellable item's station is catalog data.
//   specs/27-design-language.md `27-F56` — the ink ladder and its two scopes.
//   specs/27-design-language.md `27-F57` — quantity immediately left of the item name.
//   specs/27-design-language.md `27-F59` — "Where a modifier is a **removal** it carries the
//     inverted marker of `27-F56`."
//   specs/27-design-language.md `27-F62` — "Print what was true at **append** time, stamped with
//     `branch_created_at`, and let the ledger own the present."
//   specs/01-kernel-sync.md `01-F43` — branch time is an integer millisecond quantity.
//
// K-1..K-4's LANDED exports were read as the contract this layer composes over (`PrinterCapability`,
// `MIN_COLUMNS`, `EncoderPart`, `DocumentSpec`, `render`). `plans/wave-1/kot-printing.md` was
// deliberately NOT read.
//
// NO HARDWARE IS INVOLVED IN ANY TEST THAT USES THIS FILE.
//
// ── WHY THIS ORACLE DECLARES FIELD NAMES AT ALL ──
//
// K-4's oracle walked `example_data` GENERICALLY — "string and number leaves" and nothing about
// what a leaf means — and its own DEFERRED block says why that had to stop here: "nothing here
// asserts that a quantity prints as a quantity, that a station filters, or that a modifier hangs
// under its item. `03-F31` puts the contract in the TYPE and `27-F57`/`27-F58` put the layout in
// K-5." A generic walk cannot reach K-5's dangerous cases, all of which are about a DISTINCTION:
// two removals on ONE item versus one removal on each of TWO items (`27-F59` + `27-F56`'s
// two-scope ruling), a reprint versus an ordinary ticket (`03-F37`), a removal versus a preference
// (`27-F59`). None of those is expressible without the contract naming the distinction.
//
// So the names below are this oracle's DECLARED INTERPRETATION (24 §3b), each traced to the FR
// sentence that forces the field to exist. A mismatch between a name here and the implementation's
// is a FINDING for this session, not a defect in either — but the distinctions are not negotiable,
// because each is an FR requirement rather than a modelling preference.

/**
 * One modifier on one line (`03-F3`: "one line per item with qty/variant/**modifiers**").
 *
 * `removal` exists because `27-F59` makes the ink depend on it — "Where a modifier is a *removal*
 * it carries the inverted marker of `27-F56`, because a removal that is missed is an allergen
 * incident, not a preference miss" — so a renderer that cannot tell a removal from a preference
 * cannot satisfy the FR at all. It is a BOOLEAN and not a string kind, because `27-F59` names
 * exactly two behaviours and `27-F56`'s budget is counted over one of them.
 */
export type KotModifier = {
  readonly name: string;
  /** `27-F59`: a removal carries the inverted marker; a preference does not. */
  readonly removal: boolean;
};

/**
 * One item line (`03-F3`: "one line per item with qty/variant/modifiers").
 *
 * `name` is `03-F38`'s resolved name — "Add a short `kitchen_name` to the 01-F21 catalog chain …
 * falling back to the display name" — and the resolution happens up the catalog chain, not here.
 * K-4's landed `KotData` already reads it this way and this contract keeps it.
 *
 * `quantity` is a plain integer count. `00 §6`'s branded quantity types govern INVENTORY units
 * (mg/ml), and `27-F57`'s "quantity … immediately left of the item name" is a count of portions —
 * the number a cook reads off the ticket. No FR asks the chit for a unit.
 */
export type KotLine = {
  readonly quantity: number;
  readonly name: string;
  /** `27-F59`: "Modifiers are indented under their item and never inlined." */
  readonly modifiers: readonly KotModifier[];
};

/**
 * `03-F31`'s data contract for the kitchen chit, extended to the facts `03-F3` and `27 §2b` name.
 *
 * **There is no money field and there is no field a money value could hide in** (`03-F32`). That
 * clause is K-4's structurally and is not re-declared here; what IS new is that every field added
 * below is a fact about FOOD, IDENTITY or TIME, and none of them is a number an owner could point
 * a price at.
 */
export type KotData = {
  /** `03-F3`: "order number". `03-F5`'s alert says it out loud ("KOT #142 did not print"). */
  readonly ticket_no: string;
  /**
   * `03-F3`: "order number + **table/channel** in large type". One field, because `03-F3` writes
   * the two as one slot and no FR asks a chit to carry both at once. A takeaway ticket's value is
   * its channel; a dine-in ticket's is its table.
   */
  readonly table: string;
  /** `03-F18`/`03-F50`: the station this chit was routed to. Carried by K-4's landed contract. */
  readonly station: string;
  /**
   * `27-F62`: "Print what was true at **append** time, **stamped with `branch_created_at`**, and
   * let the ledger own the present"; `03-F3` asks the layout for a "timestamp".
   *
   * An integer millisecond quantity, because that is what `01-F43` computes ("a signed integer
   * millisecond `branch_time_offset` … computes *branch time* as `device_clock + offset`"). The
   * named simpler alternative — a caller-preformatted string — is rejected because it moves a
   * layout decision out of the versioned `DocumentSpec` and into every caller, which is the exact
   * split `03-F30` exists to prevent. Nothing downstream asserts a FORMAT: no FR states one, and
   * an oracle that pinned one would be designing the ticket.
   */
  readonly branch_created_at: number;
  /**
   * `03-F3`: "reprints carry a 'REPRINT' band"; `03-F37`: "Reprint markers are mandatory per type,
   * **in a locked region** … Reprints are already a named fraud vector — the paper must say so."
   *
   * On the DATA and not in the profile, precisely because `03-F37` makes it mandatory and `03-F32`
   * says "type invariants override configuration": a fact an owner could switch off is not a
   * mandatory marker. Whether THIS print is a reprint is a property of the print job (`03-F7`'s
   * `kot.reprint_requested`), which is data.
   */
  readonly reprint: boolean;
  readonly lines: readonly KotLine[];
};

/**
 * `01 §4`'s canonical order-line states, MINUS the two `27-F56` names as legal banner content.
 *
 * `27-F62`: "nothing whose meaning changes over time may be printed as if it were fixed — no
 * 'ready at' that a delay invalidates, **no state word that a later event contradicts**". Every
 * word below is a state the ticket's own order will leave after the paper is cut, so printing one
 * makes the chit assert something the ledger will contradict within minutes.
 *
 * `voided` and `cancelled` are deliberately absent: `27-F56` allocates the banner scope to
 * "`CANCEL`, `VOID`, `REPRINT`", so those two words are the one case the corpus explicitly wants
 * on paper. They are exit states — a later event does not contradict them — which is why the two
 * FRs do not actually conflict here.
 */
export const CONTRADICTABLE_STATE_WORDS = [
  "placed",
  "confirmed",
  "in_prep",
  "in prep",
  "ready",
  "served",
  "picked_up",
  "picked up",
  "delivered",
  "settled",
] as const;

/**
 * `27-F62`'s own example, plus `03 §3`'s rule that the kitchen never displays an ETA.
 *
 * Separate from the state words because these are not states: they are FORWARD-LOOKING times, and
 * `27-F62` names one of them verbatim ("no 'ready at' that a delay invalidates").
 */
export const FORWARD_LOOKING_TIME_TOKENS = ["ready at", "eta", "due at", "expected"] as const;
