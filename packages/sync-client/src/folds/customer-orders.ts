// The `customer_orders` fold (`02-F64`'s order→customer link, `17-F23`'s loyalty counter) — the
// EIGHTH device fold, and the first to consume a type that did not exist before August 2026.
//
// A pure function of the delivered event SET, exactly as `folds/merge.ts`, `folds/shift-cash.ts`
// and `folds/customer-file.ts` are, and it lives beside them under the
// `@restos/sync-client/fold-engine` subpath for the same reason: the cloud Auditor refolds without
// loading the better-sqlite3 addon (`01-F7`, `20 §4.2`), and a fold it cannot refold is
// unauditable.
//
// ── WHY ONE FOLD AND NOT TWO ──────────────────────────────────────────────────────────────────
//
// `02-F64`'s link and `17-F23`'s counter look like two concerns and are one projection: both are
// keyed by `01-F23`'s phone, both read the same three event types, and the counter is defined AS a
// predicate over the links. Two folds over one key is two places to get `01-F34` wrong, and the
// second one would have to re-derive the first's answer — `02-F45`'s two-sources argument, one
// layer down. What is genuinely separate stays separate: the money side of a discount is
// `folds/merge.ts`'s and is not touched here.
//
// ── WHAT THIS FOLD MAY NOT DO, AND BOTH PROHIBITIONS ARE LOAD-BEARING ─────────────────────────
//
//  (1) `01-F34` — it reads NO ordering metadata. Not `global_seq`, not `lamport_seq`, not a device
//      clock, and no envelope id reaching a projected value. Like `folds/customer-file.ts` it needs
//      no per-envelope set key at all, because every member it holds is keyed by a payload VALUE
//      (`01-F23`'s phone, the order id, `01-F31`'s attempt token).
//  (2) `01-F87` — it reads NO configuration. `17-F14`'s `N` and `17-F22`'s `min_order_paisa` are
//      layer-2 values on the `campaign` artifact, so a fold that divided by `N` would make a
//      projected value depend on an artifact version, and two tills at different versions would
//      project different rewards from an identical event set. **THE DIVISION HAPPENS AT RENDER
//      TIME** in `@restos/domain`'s `loyaltyAvailable`, over the two counts this fold projects.
//      `01-F87`'s own carve-out is the shipped precedent — `03-F14`/`03-F47`'s aging thresholds are
//      read at display time by the pass screen's badge, and nothing stores the colour.
//
// ⚠ **THE BREAK IS ONE KEYSTROKE AWAY: memoizing that rendering into a materialized state table.**
// `17-F23` names it. At that moment the reward count stops being recomputed per read and becomes a
// projected one. This fold projects COUNTS on purpose; it must never project an ANSWER.
//
// ── THE MERGE RULES, PER PROJECTED FIELD (`01-F34` requires them declared) ─────────────────────
//   linked orders   G-map: `order_id` → G-set of linked phone keys, from `order.customer_linked`.
//                   Grow-only, order-free, duplicate delivery collapses. TWO DISTINCT phones on
//                   one order (two tills, one partition) is `01-F31`'s disposition and `02-F64`
//                   states it: both retained, the link **contested**, `loyalty_link_contested`
//                   raised on every phone that claimed it, and the order contributes ZERO to every
//                   one of them. A fold never picks a winner.
//   settled         Monotone OR over that order's `order.settlement_closed` members — `01-F33`'s
//                   own rule (*"nothing arithmetic settles or un-settles an order"*), and monotone
//                   facts are trivially order-free.
//   billed_paisa    MVR over the ATTESTED `billed_paisa` those closes carry (`01-F63`'s snapshot —
//                   a payload value, never re-derived here or anywhere). Exactly one distinct
//                   attested value ⇒ carried. Two or more ⇒ **contested**: nothing is picked,
//                   `loyalty_close_snapshot_disputed` is raised, and the order contributes zero.
//                   NONE is a third state and NOT an error — `01-F63` ratifies that an absent
//                   snapshot asserts nothing, and orders closed before that FR shipped have none.
//   redemptions     Unique-keyed map by `adjustment_attempt_id` (`01-F31`/`01-F83`), value-keyed
//                   per key so members diverging in ANY field mark the key disputed, contribute
//                   **zero**, raise `loyalty_redemption_disputed`, and are all retained.
//   consumed total  Σ of that map's `orders_consumed`, accumulated in **BigInt** (standing law 3).
//   exceptions      G-Set of anomaly codes, sorted (`folds/shift-cash.ts`'s convention).
//
// ── WHAT IS DELIBERATELY NOT PROJECTED ────────────────────────────────────────────────────────
//
// **Bearer redemptions.** `17-F21` gives them `phone_e164: null` because the card IS the identity,
// so they belong to no phone row and no account counter moves. They are in the ledger and this fold
// deliberately holds no count of them: `17-F25`'s end-of-day reconciliation (*"6 bearer redemptions
// recorded on this till"*) is a report surface that does not exist yet, and a counter with no
// reader is this wave's most-recorded defect. When that report is built it reads the events.
import { canonicalJson } from "@restos/domain";

/** One linked order as the projection renders it. */
export type LinkedOrderRow = {
  order_id: string;
  /** `01-F33`'s monotone closing fact for this order. */
  settled: boolean;
  /**
   * `01-F63`'s attested charge, or `null` when no close attested one — which is a LEGAL state and
   * not an error, and is why `billed_contested` is a separate field rather than another `null`.
   */
  billed_paisa: number | null;
  /** Two closes attested different amounts, or two phones claimed this order. Contributes zero. */
  billed_contested: boolean;
  /** `02-F64`: another phone claims this order too, so it counts for NOBODY (`01-F31`). */
  link_contested: boolean;
};

/** `17-F23`'s projection for one `01-F23` identity. */
export type CustomerOrdersRow = {
  phone_e164: string;
  /** Sorted by `order_id` — a sort on a payload VALUE, never on arrival (`01-F34`). */
  linked_orders: LinkedOrderRow[];
  /**
   * `17-F23`'s `orders_consumed_total`, as a decimal STRING.
   *
   * A string and not a `number` because the accumulator is a `bigint` and this row crosses a
   * JSON/SQLite boundary; narrowing it here would put standing law 3's hazard back one function
   * earlier, and `JSON.stringify` throws on a `bigint` rather than losing it quietly. The render
   * takes it back to `BigInt` in one place (`loyaltyAvailable`).
   */
  orders_consumed_total: string;
  /** canonicalJson of the sorted anomaly codes (`folds/customer-file.ts`'s convention). */
  exceptions_json: string;
};

export type CustomerOrdersProjection = { customers: CustomerOrdersRow[] };

type Payload = Record<string, unknown>;

/**
 * Exactly the envelope fields this fold reads: TWO — the same pair `folds/customer-file.ts` reads,
 * and for the same reason. `lamport_seq`, `global_seq`, `device_created_at`, `server_received_at`
 * and `id` are absent by design (`01-F34`), and `26 §8`'s Proxy-poisoned envelopes throw the moment
 * one of them is touched. `branch_created_at` is absent because this projection holds no time at
 * all: `17-F22`'s validity window is compared at RENDER time against a business date the caller
 * already derived (`01-F46`), never here.
 */
type CustomerOrdersEvent = { type: string; payload: Payload };

/** Per order: who claims it, whether it closed, and what each close attested. */
type OrderAcc = {
  /** `02-F64`'s G-set of claimant phone keys. More than one is contested. */
  phones: Set<string>;
  settled: boolean;
  /** Distinct ATTESTED `billed_paisa` values. Exactly one is carried; two or more is contested. */
  attested: Set<number>;
};

/** Per phone: the orders this key claims, and its redemption ledger. */
type PhoneAcc = {
  /**
   * `02-F64`'s G-set of order ids this phone claims — **the INVERSE of `OrderAcc.phones`, written
   * in the same case arm so the two can never disagree.**
   *
   * ⚠ **It exists because `rowOf` was quadratic and `17-N3` budgets 100 ms.** The projection used
   * to scan `[...orders.keys()].sort()` — the WHOLE order map — once per phone, so the cost was
   * `O(phones x orders)`. Measured on this fold through a real store before the index: 100 phones
   * / 1,000 orders 16 ms, 500 / 5,000 **151 ms**, 1,000 / 10,000 **572 ms**. `gateway.loyaltyFor`
   * calls `store.customerOrders()` — a full projection, no memo, by `17-F23`'s design — on every
   * ask, and the caller strip re-asks on every `changed` push while a caller is latched, so at a
   * few months of one till's volume the read blew `17-N3` **synchronously inside `ipcMain.handle`,
   * blocking every other IPC including `append`**. This is `specs/25`'s territory and it is an
   * INDEX, not a memo: nothing is cached and no projected value is stored (`17-F23`'s named break
   * is memoizing the RENDER, which is one layer up and untouched).
   *
   * **It changes no projected value and cannot.** Membership is identical to the filter it
   * replaces — both are written in the `order.customer_linked` arm from the same payload — and
   * `rowOf` still sorts on the order id, which is a payload VALUE and never arrival order
   * (`01-F34`). `customer-orders-fold.test.ts` §I asserts BOTH halves: the projection is
   * byte-identical to the scan it replaces, and the scan is gone (a Proxy counts `keys()` on the
   * order map and requires ZERO calls per phone).
   */
  orders: Set<string>;
  /** `adjustment_attempt_id` → (canonical member bytes → member). `01-F31`'s keyed map. */
  redemptions: Map<string, Map<string, { orders_consumed: number }>>;
};

export type CustomerOrdersState = {
  orders: Map<string, OrderAcc>;
  phones: Map<string, PhoneAcc>;
};

export const emptyCustomerOrders = (): CustomerOrdersState => ({
  orders: new Map(),
  phones: new Map(),
});

/** `02-F64`/`01-F31`: two tills linked one order to two different customers. */
const LINK_CONTESTED = "loyalty_link_contested";
/** `01-F31`/`01-F63`: two closes attested different charges for one order. */
const CLOSE_DISPUTED = "loyalty_close_snapshot_disputed";
/** `01-F31`: one attempt key, two divergent redemption intents. */
const REDEMPTION_DISPUTED = "loyalty_redemption_disputed";
/**
 * `17-F13`'s ruled partition outcome, and it is a REPORT rather than a refusal.
 *
 * Two tills each see ten eligible orders and zero consumed, and both redeem; on merge the set holds
 * ten and consumed is twenty. **Both discounts stand and no sale is unwound** (`01-F17`, `01-F20`).
 * This code is what a manager surface reads.
 *
 * ⚠ **It is a CONFIGURATION-FREE approximation and deliberately weaker than the render's own
 * `available`**, because `01-F87` forbids this fold reading `min_order_paisa`: the comparison is
 * against every settled, uncontested, linked order rather than against the ones a campaign's
 * minimum admits. So it under-reports — an overdraw that exists only once the minimum filters
 * orders out is invisible here and visible at the render. Named rather than fixed: fixing it would
 * mean reading configuration in a fold, which is the break this whole file is arranged around.
 */
const OVERDRAWN = "loyalty_overdrawn";

const sub = <K, V>(m: Map<K, V>, k: K, mk: () => V): V => {
  const existing = m.get(k);
  if (existing !== undefined) return existing;
  const fresh = mk();
  m.set(k, fresh);
  return fresh;
};

const orderOf = (state: CustomerOrdersState, order_id: string): OrderAcc =>
  sub(state.orders, order_id, () => ({
    phones: new Set<string>(),
    settled: false,
    attested: new Set<number>(),
  }));

const phoneOf = (state: CustomerOrdersState, phone_e164: string): PhoneAcc =>
  sub(state.phones, phone_e164, () => ({ orders: new Set<string>(), redemptions: new Map() }));

/**
 * Fold one envelope. Types outside this fold's vocabulary change nothing — a payment delivered in
 * the same batch is never silently bucketed into a customer's counter.
 *
 * It never throws, and that is an obligation rather than a property: `device-store.ts` runs it
 * INSIDE ingest with no try/catch between, so a malformed loyalty event must never wedge the ingest
 * of a real, rung-up sale (`01-F17`). Every read below is a cast over a payload `parseEvent` has
 * already validated.
 */
export const foldCustomerOrders = (
  state: CustomerOrdersState,
  envelope: unknown,
): CustomerOrdersState => {
  const event = envelope as CustomerOrdersEvent;
  const payload = event.payload;
  switch (event.type) {
    case "order.customer_linked": {
      const phone = payload.phone_e164 as string;
      const order_id = payload.order_id as string;
      orderOf(state, order_id).phones.add(phone);
      // The phone row is created even when this is the only thing we know about it, so a linked
      // order with no settlement and no redemption still renders. `01-F10` never parks the link —
      // the event carries its whole projection key.
      //
      // **Both directions are written HERE, from one payload, in one statement pair** — see
      // `PhoneAcc.orders`. Two G-sets that are inverses of each other can only diverge if one of
      // them is written somewhere the other is not, so they are written together and nowhere else.
      // Both are idempotent and commutative, so duplicate delivery collapses on each (`01-F34`).
      phoneOf(state, phone).orders.add(order_id);
      return state;
    }
    case "order.settlement_closed": {
      const acc = orderOf(state, payload.order_id as string);
      // `01-F33`: monotone OR. Nothing un-settles an order and this fold judges no arithmetic.
      acc.settled = true;
      // `01-F63`'s attested snapshot. Read as a payload VALUE and never recomputed — `02-F63` says
      // in terms that the Auditor cannot recompute a rounded total without the granularity, and
      // `01-F87` forbids this fold reading the granularity. An absent or non-integer attestation
      // is simply not a member: `01-F63` ratifies that an absent snapshot asserts nothing.
      const billed = payload.billed_paisa;
      if (typeof billed === "number" && Number.isSafeInteger(billed)) acc.attested.add(billed);
      return state;
    }
    case "loyalty.reward_redeemed": {
      // `17-F21`: `null` is the BEARER case — the card is the identity, so no account counter
      // moves and this redemption belongs to no phone row. A stated `null`, not an omission.
      const phone = payload.phone_e164;
      if (typeof phone !== "string") return state;
      const acc = phoneOf(state, phone);
      // `01-F31`: "the payload minus its key is the immutable intent". Only the fields this fold
      // projects enter the member — a redemption's `proof_ref` differing between two retries of one
      // act is `17-F25`'s attestation detail and must not dispute a COUNT.
      const member = { orders_consumed: payload.orders_consumed as number };
      sub(
        acc.redemptions,
        payload.adjustment_attempt_id as string,
        () => new Map<string, { orders_consumed: number }>(),
      ).set(canonicalJson(member), member);
      return state;
    }
    default:
      return state;
  }
};

/**
 * Project one identity's row — a pure function of that key's delivered members.
 *
 * `orders` is passed whole rather than pre-bucketed by phone, because an order's `settled` and
 * `billed_paisa` arrive on events that carry NO phone (`order.settlement_closed` is order-keyed).
 * Resolving them here is the join `26 §4`'s late-resolving-entity trap permits: the LINK carries
 * its own full key, so nothing waits on anything.
 */
const rowOf = (
  phone_e164: string,
  acc: PhoneAcc,
  orders: Map<string, OrderAcc>,
): CustomerOrdersRow => {
  const exceptions = new Set<string>();

  const linked: LinkedOrderRow[] = [];
  // Sorted on the KEY, which is a payload value. Returning insertion order would make delivery
  // order observable (`01-F34`) — the exact defect `folds/customer-file.ts` records for its rows.
  //
  // **This walks THIS phone's own order set, not the whole map** (`PhoneAcc.orders`): the set is
  // the inverse of the `o.phones.has(phone_e164)` filter it replaces, written in the same arm from
  // the same payload, so membership is identical and the sort is still on the payload value. The
  // `orders` map is still read — an order's `settled` and its attested charge arrive on events
  // that carry NO phone, which is the join `26 §4` permits — but it is no longer SCANNED.
  for (const order_id of [...acc.orders].sort()) {
    const o = orders.get(order_id) as OrderAcc | undefined;
    // A link whose order has produced no other event still has an `OrderAcc` (the link arm creates
    // it), so this is unreachable in practice and is a refusal to guess rather than a `!`: a row
    // this fold cannot describe is left out, never rendered as an unsettled order with no charge.
    if (o === undefined) continue;
    const link_contested = o.phones.size > 1;
    if (link_contested) exceptions.add(LINK_CONTESTED);
    const billed_contested = o.attested.size > 1;
    if (billed_contested) exceptions.add(CLOSE_DISPUTED);
    linked.push({
      order_id,
      settled: o.settled,
      // Exactly one attested value is the order's charge; none is `01-F63`'s legal silence; two or
      // more is `01-F31`'s disputed key, which contributes nothing and is rendered as the contest
      // it is rather than resolved.
      billed_paisa: o.attested.size === 1 ? ([...o.attested][0] as number) : null,
      billed_contested,
      link_contested,
    });
  }

  // Standing law 3: the Σ accumulates in BigInt. A running double lets delivery order decide the
  // outcome near 2^53, and `01-F34` forbids exactly that even where the quantity is a count.
  let consumed = 0n;
  for (const members of acc.redemptions.values()) {
    // `01-F31`: a key whose members diverge in any field contributes ZERO and raises an anomaly.
    // All members stay in the map — nothing is discarded (`01-F19`) — and no winner is picked.
    if (members.size !== 1) {
      exceptions.add(REDEMPTION_DISPUTED);
      continue;
    }
    const [member] = [...members.values()];
    consumed += BigInt((member as { orders_consumed: number }).orders_consumed);
  }

  // `17-F13`'s partition report. The configuration-free upper bound on eligibility — see OVERDRAWN.
  const settledUncontested = linked.filter(
    (o) => o.settled && !o.link_contested && !o.billed_contested,
  ).length;
  if (consumed > BigInt(settledUncontested)) exceptions.add(OVERDRAWN);

  return {
    phone_e164,
    linked_orders: linked,
    orders_consumed_total: consumed.toString(),
    exceptions_json: canonicalJson([...exceptions].sort()),
  };
};

/**
 * Project the whole fold — pure and repeatable, a function of the delivered SET alone.
 *
 * Row ORDER is part of the projection and is sorted by `01-F23`'s key, for the reason
 * `folds/customer-file.ts` states: returning insertion order would make delivery order observable.
 */
export const projectCustomerOrders = (state: CustomerOrdersState): CustomerOrdersProjection => ({
  customers: [...state.phones.keys()]
    .sort()
    .map((phone_e164) => rowOf(phone_e164, state.phones.get(phone_e164) as PhoneAcc, state.orders)),
});
