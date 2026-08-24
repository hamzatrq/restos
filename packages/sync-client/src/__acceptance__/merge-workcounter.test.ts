// Acceptance tests — T-01-15 fold work counters. The contract mandates the
// foldStats() observable (carried forward from the T-01-14 oracle amendment):
// row writes are a proxy an O(N) implementation can game; events_folded is the
// real quantity. Laws pinned here: (a) global_seq adoption does ZERO fold work —
// structurally, on both adoption seams (01-F34, 26 §3); (b) fold work per arriving
// event is independent of ledger size N (T-01-15 DoD (b)); (c) the parked drain
// re-attempts only events waiting on the arrived key — work independent of the
// unrelated parked population (26 §4 defect 2; matrix row 70).
// Authored from specs 01/25 §17-corrections/26 + the matrix + the T-01-15 contract
// ONLY (24 §3 step 2). RED-AWAITING-IMPLEMENTATION.

import { eventRegistry, type KnownEventType } from "@restos/domain";
import { describe, expect, it } from "vitest";
import { type Identity, identity, peerEnvelope, peerIdentity } from "./builders.js";
import {
  confirmed,
  created,
  edge,
  foldStats,
  ingestAll,
  lineAdded,
  type MergeStore,
  mergeStore,
  payment,
  projectionBytes,
} from "./merge-builders.js";

const T0 = 1752800000000;

type Env = Record<string, unknown> & { id: string };

/** A self-similar ledger of `orders` orders × 5 events each from one peer device —
 * ids and shapes deterministic so two ledgers differ ONLY in N. */
const buildLedger = (id: Identity, orders: number): Env[] => {
  const peer = { ...peerIdentity(id), device_id: "d-ledger" };
  const envelopes: Env[] = [];
  let lamport = 0;
  const emit = (typed: Record<string, unknown>, offset: number) => {
    const env = peerEnvelope(peer, lamport, {
      id: `e-${String(envelopes.length).padStart(5, "0")}`,
      device_created_at: T0 + offset,
      ...typed,
    }) as Env;
    lamport++;
    envelopes.push(env);
    return env;
  };
  for (let o = 0; o < orders; o++) {
    const orderId = `O${o}`;
    emit(created(orderId), o * 50);
    emit(lineAdded(orderId, `${orderId}-L0`), o * 50 + 10);
    emit(edge(orderId, `${orderId}-L0`, "confirmed", ["placed"]), o * 50 + 20);
    emit(confirmed(orderId), o * 50 + 30);
    emit(payment(orderId, 500, { attempt: `sa-${orderId}` }), o * 50 + 40);
  }
  return envelopes;
};

const foldedDelta = (store: MergeStore, work: () => void): number => {
  const before = foldStats(store).events_folded;
  work();
  return foldStats(store).events_folded - before;
};

describe("foldStats — the mandated work-counter observable (T-01-15 contract)", () => {
  it("01-F6: foldStats() exposes { full_rebuilds, scoped_rebuilds, events_folded } and counts real fold work on delivery", () => {
    const id = identity();
    const store = mergeStore(id);
    const stats0 = foldStats(store);
    expect(stats0).toEqual({
      full_rebuilds: expect.any(Number),
      scoped_rebuilds: expect.any(Number),
      events_folded: expect.any(Number),
    });
    const delta = foldedDelta(store, () => {
      ingestAll(store, buildLedger(id, 3));
    });
    expect(delta).toBeGreaterThan(0); // delivering new events IS fold work
    store.close();
  });
});

describe("registry growth must fail this suite before it can silently no-op (fix-round F5; 01-F4/01-F34)", () => {
  /** The oracle-pinned fold-consumed partition: every KnownEventType has a
   * pinned merge rule in this suite (kot.printed: consumed, projection-inert
   * per matrix rows 59/60; audit.* sits outside KnownEventType by
   * construction and is pinned fold-inert elsewhere).
   *
   * REVIEWED AND REVERTED TO ONE SET, July 2026 (oracle session; founder ruling on the
   * 26 §3 structural question). The July amendment split this into a partition —
   * engine-consumed types plus `availability.changed` dispositioned to
   * `folds/availability.ts` — on the argument that its key space was disjoint. That
   * argument was sound on its own terms and aimed at the wrong question: `26 §3`
   * specifies a projection-key sidecar in which the engine returns EVERY key an event
   * affects (`order:O1`, `item:I4`), and merge.ts's own key derivation records
   * generalising to it as the scheduled follow-up. Availability is the first `item:`-keyed
   * event, i.e. the trigger for that work — not grounds for a second fold outside the
   * engine, which also placed it outside persistence, the Auditor's independent refold
   * (01-F7/20 §4.2) and this very work counter.
   *
   * So the partition is gone and the pin is back to its original, stronger shape: EVERY
   * registry type is consumed by THIS engine. The disjointness assertion and the
   * `folds/.+\.ts` module-name string check went with it — neither describes anything
   * real once there is one engine.
   *
   * ── AMENDED August 2026 (S-1's seven service-surface types) ─────────────────────────
   * WIDENED, and a widening is what a weakening looks like from the diff alone, so read the
   * reason. `01 §4` grew by seven: `shift.opened`/`shift.closed`, `day.opened`/`day.closed`,
   * `cash.drawer_opened`, `cash.paid_out`, `cash.deposit_recorded`. All seven ARE folded —
   * `folds/merge.ts`'s `OTHER_FOLD_TYPES` routes each one to `folds/shift-cash.ts` (the
   * `shift_cash` fold, `FOLDS.md` line 15), which is also why this engine's `26 §3` sidecar
   * answers the EMPTY key list for them: they carry neither an order key nor an item key —
   * not that nothing reads them.
   *
   * `PINNED_FOLD_CONSUMED` is therefore the only honest side. `PINNED_NOT_FOLDED` states
   * `01-F52` — "not an input to ANY fold" — so filing a money-bearing shift event there would
   * assert the cash reconciliation is unfoldable, and this pin would then be defending the
   * opposite of the truth (the failure this file was rewritten to make impossible).
   *
   * The consequence for the paragraph above, stated rather than left to be inferred: this
   * set's claim is now "folded by a fold in this package", NOT "folded by the order-keyed
   * engine in this file" — "EVERY registry type is consumed by THIS engine" is SUPERSEDED as
   * of these seven. Kept, not deleted, because the July reversal it records still binds every
   * ORDER- and ITEM-keyed type. No assertion changed meaning: the two below are the union and
   * the disjointness, and neither ever read the narrower sense. */
  const PINNED_FOLD_CONSUMED = [
    // ── AMENDED August 2026 (05-F7) ──────────────────────────────────────────────────────
    // The manager console's event extension. Pinned HERE rather than in `PINNED_NOT_FOLDED`
    // on `kot.print_failed`'s reasoning ten lines down: that set states `01-F52`'s "not an
    // input to ANY fold", and these three are consumed by the order-keyed engine exactly as
    // the two print facts are — counted, projection-inert, no device projection in `26`'s
    // ratified matrix. `05-F6`'s resulting `void/comp/discount.recorded` is what carries an
    // approval into a projection, and it is a separate event appended by the requesting POS.
    // `01-F36`'s "first response wins" lives on the pending QUEUE (`05 §5`, `01-F7`), not
    // here: expressing it in a fold would need a total order `01-F34` forbids inventing.
    // These three lines are the "spec-PR + oracle-pin event" the assertion below demands.
    "approval.denied",
    "approval.granted",
    "approval.requested",
    "availability.changed",
    "cash.deposit_recorded",
    "cash.drawer_opened",
    "cash.paid_out",
    // ── AMENDED August 2026 (02-F20 / 05-F29 phase 0) ────────────────────────────────────
    // `02-F20`'s four escalatable writes gained payload schemas, which is what `01-F4` was
    // blocking: the types were `01 §4` vocabulary and unemittable, so `05-F19`'s paid-out was
    // the only act an approval could complete. These four lines are the "spec-PR + oracle-pin
    // event" the assertion below demands, and without them the compile-level pin reds — which
    // is the design working, exactly as it did for `kot.print_failed` and the approval family.
    //
    // Pinned HERE and not in `PINNED_NOT_FOLDED` for that set's stated reason: it asserts
    // `01-F52`'s "not an input to ANY fold", and filing money-bearing events there would claim
    // `01-F30`'s conservation is unfoldable — the inversion this file was rewritten to make
    // impossible.
    //
    // ⚠ **Their disposition in the engine is projection-inert, and that is a stated DEBT rather
    // than a settled rule** — `01-F30`'s `void_value`, `comp_value` and `discounts` terms still
    // evaluate to zero. `26 §7` makes the merge rule an oracle-pinned decision (each is money,
    // each needs its own idempotency key and `01-F31` divergence disposition), so it is owed to
    // this file's owner and was deliberately not guessed by the session that landed the schemas.
    "comp.recorded",
    // ── AMENDED August 2026 (02-F27 / 01-F23, the customer file) ─────────────────────────
    // `customer.created` and `customer.address_added` are `01 §4` catalog vocabulary that had
    // no payload schema, which is what `01-F4` was blocking: `02-F27`'s inline customer
    // creation was UNEMITTABLE, so the phone half of `restaurant-os.md §8`'s item 7 could not
    // start. These two lines are the "spec-PR + oracle-pin event" the assertion below demands;
    // without them the compile-level pin reds, which is the design working.
    //
    // Pinned HERE and not in `PINNED_NOT_FOLDED` for the reason the seven service-surface
    // types are: that set states `01-F52`'s "not an input to ANY fold", and these two ARE
    // folded — by `folds/customer-file.ts` (the `customer_file` fold), which
    // `OTHER_FOLD_TYPES` routes them to. This engine's `26 §3` sidecar answers the EMPTY key
    // list for them because they carry neither an order key nor an item key — the key is the
    // normalized phone (`01-F23`) — not because nothing reads them.
    "customer.address_added",
    "customer.created",
    "day.closed",
    "day.opened",
    "discount.recorded",
    // ── AMENDED August 2026 (K-7) ────────────────────────────────────────────────────────
    // `kot.print_failed` is `03-F5`'s third consequence and entered the registry with it.
    // Pinned HERE and not in `PINNED_NOT_FOLDED` because that set states `01-F52` — "not an
    // input to ANY fold" — and this event is consumed by the order-keyed engine exactly as
    // `kot.printed` beside it is: counted, projection-inert, no device projection in `26`'s
    // ratified matrix. This line is the "spec-PR + oracle-pin event" the assertion below
    // demands; without it the compile-level pin reds, which is the design working.
    "kot.print_failed",
    "kot.printed",
    "order.confirmed",
    "order.created",
    "order.line_added",
    "order.line_price_overridden",
    // ── AMENDED August 2026 (02-F8 / 02-F6 — the C8 + C7 registry growth) ────────────────
    // `order.line_removed` (`02-F8`) and `order.note_added` (`02-F6`) gained payload schemas,
    // which is what `01-F4` was blocking: both were `01 §4` vocabulary and therefore UNEMITTABLE,
    // so a cashier could neither take a line off an order nor send an instruction to the kitchen.
    // These two lines are the "spec-PR + oracle-pin event" the assertion below demands, and
    // without them the compile-level pin reds — the design working, exactly as it did for
    // `kot.print_failed`, the approval family, the escalatable writes and the park pair.
    //
    // Pinned HERE and not in `PINNED_NOT_FOLDED` for that set's own stated reason: it asserts
    // `01-F52`'s "not an input to ANY fold". Both are ORDER-keyed, so `26 §3`'s sidecar answers
    // `order:<order_id>` and the order-keyed engine in `merge.ts` is where they arrive.
    //
    // ⚠ **UNLIKE EVERY REGISTRY LANDING BEFORE THEM, THESE TWO ARE NOT PROJECTION-INERT — that is
    // the substance of the change and it is deliberate.** `26 §7` still makes the merge rule an
    // oracle-pinned DECISION rather than an implementer's; the difference is that here the FRs
    // determine it and the debt would be the defect. `02-F9` calls line removal *"the only
    // partial-confirmation mechanism"* and `01-F30` has **no `removed_value` term**, so a removal
    // that projected nothing would leave the dish in `billed_total` with no void to balance it;
    // `02-F6` prints the note *"prominently on the KOT"*, which a fold-inert note never reaches.
    // The rules are pinned by `line-correction-fold.test.ts` §0 (M1–M4) and asserted by execution
    // there, because a name in a list cannot tell a projecting arm from a `return;`.
    "order.line_removed",
    "order.line_state_changed",
    "order.note_added",
    // ── AMENDED August 2026 (02-F4 / 02-F9 / 06-F20 — the C10 + C20 registry growth) ─────
    // `order.parked` / `order.unparked` (`02-F4`) and `order.rejected` (`02-F9`, whose reason list
    // `06-F20` owns) gained payload schemas, which is what `01-F4` was blocking: all three were
    // `01 §4` vocabulary and therefore UNEMITTABLE, so a cashier could neither park an order nor
    // reject a cloud one. These three lines are the "spec-PR + oracle-pin event" the assertion
    // below demands, and without them the compile-level pin reds — the design working, exactly as
    // it did for `kot.print_failed`, the approval family and the escalatable writes.
    //
    // `order.unparked` is kept beside its pair rather than at its own alphabetical slot (which
    // would be after `order.table_assigned`): the two halves of one toggle are one decision, and
    // the assertion below sorts both sides anyway.
    //
    // Pinned HERE and not in `PINNED_NOT_FOLDED` for that set's own stated reason: it asserts
    // `01-F52`'s "not an input to ANY fold", and no FR says that of these three. All three are
    // ORDER-keyed, so `26 §3`'s sidecar answers `order:<order_id>` for them and the order-keyed
    // engine in `merge.ts` is where they arrive.
    //
    // ⚠ **Their disposition in the engine is projection-inert, and that is a stated DEBT rather
    // than a settled rule.** `26 §7` makes a merge rule an oracle-pinned DECISION, not an
    // implementer's, and the session that landed the schemas deliberately did not guess one. What
    // is owed, named so it is not discovered in the field:
    //   · `order.rejected` — a rejected order goes on appearing in every till's `open_orders`
    //     forever. Genuinely undecided by any FR rather than merely unbuilt: `06-F20`'s own
    //     consumer is the storefront status page, a CLOUD read model on the other plane, and
    //     `01 §4`'s canonical states have no `rejected` (its exit states are `voided / cancelled`).
    //   · `order.parked` / `order.unparked` — a parked order is indistinguishable from an active
    //     one, so `02-F10`'s recall cannot filter on it. **`02-F4`'s stated requirement is already
    //     met without any new projection**: "visible to every terminal in the branch" holds because
    //     `open_orders` is folded from the branch stream and the order has been in it since its
    //     `order.created`. Projection-inert is therefore CORRECT for `02-F4` as written, and owed
    //     only for the parked FLAG a later `02-F10` surface will want.
    //     `order-park-reject-fold.test.ts` asserts that visibility half by EXECUTION, because a
    //     comment claiming "the projection is unchanged" is not an assertion that it is.
    // ── AMENDED August 2026 (`01-F84` — `order.cancelled`'s payload) ────────────────────
    // The fourth member of the same growth event, pinned HERE for the same structural reason:
    // it is ORDER-keyed, so `26 §3`'s sidecar answers `order:<order_id>` and it arrives at the
    // order-keyed engine. Its disposition is projection-inert and its debt is **sharper** than
    // the three below rather than identical: `cancelled` IS one of `01 §4`'s canonical exit
    // states, so unlike `order.rejected` a removal rule is expressible today and only the
    // DECISION is missing (`26 §7`, `01-F35`). Stated consequence: a cancelled or auto-closed
    // order goes on appearing in every till's inbox — reachable in production only once
    // `06-F30`'s cloud origin exists, which is the first producer this type has ever had.
    "order.cancelled",
    "order.parked",
    "order.rejected",
    "order.unparked",
    "order.settlement_closed",
    "order.table_assigned",
    "payment.recorded",
    "payment.refunded",
    "shift.closed",
    "shift.opened",
    "void.recorded",
    // `02-F64` / `17-F23`, August 2026 — the order→customer link and the loyalty redemption. Both
    // are FOLD-CONSUMED, by `folds/customer-orders.ts`, which is why they belong on this side of
    // the partition and not beside `catalog.changed`. Neither reaches the order-keyed engine:
    // their projection is keyed by `01-F23`'s phone, so `merge.ts` lists them in
    // `OTHER_FOLD_TYPES` exactly as it lists `customer.created` and `customer.address_added`.
    //
    // ⚠ This pin RED-AT-COMPILED the moment the two types entered the registry — the design
    // working, and the same thing it did for `printer.status_changed`.
    "order.customer_linked",
    "loyalty.reward_redeemed",
  ] as const;

  /**
   * AMENDED July 2026, and the amendment is a STRENGTHENING — read the reason before the
   * change, because "the pin was widened" is what this would look like from the diff alone.
   *
   * The pin above modelled the registry as binary: every type is fold-consumed, or the build
   * fails. `catalog.changed` is the first type that must be in the registry (`01 §4` lists
   * it; `01-F4` makes emitting an unregistered type a runtime error, so doc 14 could not
   * record a menu edit at all without it) and must have NO merge rule (`01-F52`: "catalog
   * state is not an input to any fold"). The old model could not express that: the honest
   * disposition and the silent fall-through the pin exists to catch looked identical.
   *
   * So the pin now partitions instead of asserting a single set — and a partition is a
   * stronger claim than the union it replaces, because a type must be named in exactly one
   * side. A type in NEITHER list still fails to compile, which was the whole point; a type in
   * BOTH now fails too, which the old shape could not even ask.
   */
  // `printer.status_changed` (`03-F53`, August 2026) is the SECOND member, and it is here rather
  // than in `PINNED_FOLD_CONSUMED` for a structural reason, not a judgement call: it names no order
  // and no item, so `26 §3`'s sidecar has no key to answer with and the order-keyed engine is not
  // where it arrives. `merge.ts`' `NON_FOLD_TYPES` row states the claim at its real strength — no
  // fold in this package reads it, which is weaker than `catalog.changed`'s `01-F52` prohibition,
  // and the row moves the day one does.
  //
  // ⚠ This pin RED-AT-COMPILED the moment the type entered the registry, which is the design
  // working — and the session that landed the schemas is not the one that wrote this list. `03-F11`
  // declared the type in July and it sat schema-less for a month, so `05-F3`'s second alarm trigger
  // did not exist; giving it a payload is what made it fold-registry vocabulary at all.
  //
  // `stock.purchase_recorded` / `stock.wastage_recorded` / `stock.count_recorded` (`specs/10`
  // slice 1, August 2026) are members three, four and five, and they RED-AT-COMPILED the same way
  // the moment `packages/domain` gave the family payload schemas. They are here rather than in
  // `PINNED_FOLD_CONSUMED` for `printer.status_changed`'s structural reason plus a settled one:
  // none names an order, their `item_id` is an `01-F21` InventoryItem rather than the sellable
  // `availability.changed` keys on — and `10-F4` puts sale deduction in a CLOUD read model, so a
  // device fold over them would be a second, wrong stock number beside the cloud's. `merge.ts`'s
  // `NON_FOLD_TYPES` rows carry the full argument and the reopen trigger.
  const PINNED_NOT_FOLDED = [
    "catalog.changed",
    "printer.status_changed",
    "stock.purchase_recorded",
    "stock.wastage_recorded",
    "stock.count_recorded",
  ] as const;

  type PinnedType = (typeof PINNED_FOLD_CONSUMED)[number] | (typeof PINNED_NOT_FOLDED)[number];
  // COMPILE-LEVEL PIN (F5): if the registry grows, this assignment stops
  // compiling — the new type has no pinned disposition yet, and an engine switch
  // without an exhaustiveness guard would fold nothing while still counting
  // events_folded (the F5 honesty overcount). Red-at-compile forces the oracle
  // pin before the code can ship a silent fall-through.
  const registryIsCovered: [KnownEventType] extends [PinnedType] ? true : never = true;

  it("01-F4 (fix-round F5): every registry type has EXACTLY ONE pinned disposition — growth is a spec-PR + oracle-pin event, never a silent fall-through", () => {
    expect(registryIsCovered).toBe(true);
    expect([...eventRegistry.types()].sort()).toEqual(
      [...PINNED_FOLD_CONSUMED, ...PINNED_NOT_FOLDED].sort(),
    );
    // The partition is disjoint. Without this, a type could be pinned as BOTH folded and
    // not-folded and the union check above would still pass — which is how a "stronger"
    // assertion quietly becomes a weaker one.
    const both = PINNED_FOLD_CONSUMED.filter((t) =>
      (PINNED_NOT_FOLDED as readonly string[]).includes(t),
    );
    expect(both, "a type cannot be both folded and deliberately not folded").toEqual([]);
  });

  it("01-F52: a non-folded type does ZERO fold work and is NOT counted as folded", () => {
    // The honesty half, asserted by EXECUTION rather than by reading the branch. An
    // `events_folded` that claims an event which folded nothing is exactly the overcount this
    // file is named for, and it is the mistake `availability.changed` made when it was wired
    // to nothing: the counter incremented before a switch whose case did not exist.
    //
    // Driven through the real store rather than the engine in isolation, because `01-F52`'s
    // claim is about what the DEVICE does with a catalog event, and an engine-only assertion
    // would not notice a store that projected one on the way in.
    const id = identity();
    const store = mergeStore(id);
    const peer = { ...peerIdentity(id), device_id: "d-catalog" };
    const before = foldStats(store).events_folded;

    store.ingest(
      peerEnvelope(peer, 0, {
        id: "e-catalog-0",
        device_created_at: T0,
        type: "catalog.changed",
        payload: {
          entity: "item",
          entity_id: "I1",
          version: 2,
          before_ref: null,
          after_ref: "ref-2",
        },
      }),
    );

    expect(foldStats(store).events_folded, "a non-folded event was counted as folded").toBe(before);
    expect(store.openOrders(), "a catalog event reached the order projection").toEqual([]);
    expect(store.kitchenQueue(), "a catalog event reached the queue projection").toEqual([]);
    // Never PARKED either. Parking is for a fact waiting on a key that may yet arrive; a
    // catalog event has no key and never will, so parking it would leak an event that can
    // never drain into a table the operator can see (DEC-SYNC-011's stuck-cursor shape).
    expect(store.parked(), "a catalog event was parked and can never drain").toEqual([]);
    store.close();
  });
});

describe("global_seq adoption does ZERO fold work (01-F34, 26 §3 — structurally, not by optimisation)", () => {
  it("01-F34: assignGlobalSeq over an entire ledger folds nothing, rebuilds nothing, and leaves the projection bit-identical", () => {
    const id = identity();
    const store = mergeStore(id);
    const ledger = buildLedger(id, 60); // 300 events
    ingestAll(store, ledger);
    const before = foldStats(store);
    const bytes = projectionBytes(store);
    // Cloud order arrives REVERSED relative to emission — the worst case for the
    // superseded comparator (a full reorder), a pure sidecar write here.
    [...ledger].reverse().forEach((env, i) => {
      store.assignGlobalSeq(env.id, i + 1);
    });
    const after = foldStats(store);
    expect(after.events_folded).toBe(before.events_folded); // ZERO fold work
    expect(after.full_rebuilds).toBe(before.full_rebuilds);
    expect(after.scoped_rebuilds).toBe(before.scoped_rebuilds);
    expect(projectionBytes(store)).toBe(bytes);
    store.close();
  });

  it("01-F34: the duplicate-id ingest-with-global_seq adoption seam (LAN-first-then-cloud-catchup) also folds nothing", () => {
    const id = identity();
    const store = mergeStore(id);
    const ledger = buildLedger(id, 40); // 200 events
    ingestAll(store, ledger);
    const delta = foldedDelta(store, () => {
      ledger.forEach((env, i) => {
        expect(store.ingest(env, { global_seq: i + 1 })).toEqual({ stored: false });
      });
    });
    expect(delta).toBe(0);
    store.close();
  });
});

describe("fold work per arriving event is independent of N (T-01-15 DoD (b))", () => {
  const arrivalDelta = (orders: number, arrival: (id: Identity, seq: number) => Env): number => {
    const id = identity();
    const store = mergeStore(id);
    ingestAll(store, buildLedger(id, orders));
    const delta = foldedDelta(store, () => {
      store.ingest(arrival(id, orders));
    });
    store.close();
    return delta;
  };

  const latePayment = (id: Identity, _orders: number): Env => {
    const peer = { ...peerIdentity(id), device_id: "d-late" };
    return peerEnvelope(peer, 0, {
      id: "e-late-payment",
      device_created_at: T0 + 10_000_000,
      ...payment("O0", 700, { attempt: "sa-late" }),
    }) as Env;
  };

  const lateEdge = (id: Identity, _orders: number): Env => {
    const peer = { ...peerIdentity(id), device_id: "d-late" };
    return peerEnvelope(peer, 0, {
      id: "e-late-edge",
      device_created_at: T0 + 10_000_000,
      ...edge("O0", "O0-L0", "in_prep", ["confirmed"]),
    }) as Env;
  };

  it("01-F6/00 §5: one arriving payment folds the same events_folded on a 40-order ledger as on a 160-order ledger", () => {
    expect(arrivalDelta(160, latePayment)).toBe(arrivalDelta(40, latePayment));
  });

  it("01-F6/00 §5: one arriving line edge folds the same events_folded on a 40-order ledger as on a 160-order ledger", () => {
    expect(arrivalDelta(160, lateEdge)).toBe(arrivalDelta(40, lateEdge));
  });
});

describe("the parked drain is keyed by waiting_for (26 §4 defect 2; matrix row 70)", () => {
  const drainDelta = (orphans: number): number => {
    const id = identity();
    const store = mergeStore(id);
    const peer = { ...peerIdentity(id), device_id: "d-orphans" };
    // M orphan confirms, each awaiting a DIFFERENT never-delivered order key…
    for (let i = 0; i < orphans; i++) {
      store.ingest(
        peerEnvelope(peer, i, {
          id: `e-orphan-${String(i).padStart(3, "0")}`,
          device_created_at: T0 + i,
          ...confirmed(`O-missing-${i}`),
        }),
      );
    }
    // …plus one orphan confirm for the order that WILL arrive.
    store.ingest(
      peerEnvelope(peer, orphans, {
        id: "e-orphan-target",
        device_created_at: T0 + orphans,
        ...confirmed("O-target"),
      }),
    );
    const delta = foldedDelta(store, () => {
      store.ingest(
        peerEnvelope(peer, orphans + 1, {
          id: "e-target-created",
          device_created_at: T0 + orphans + 1,
          ...created("O-target"),
        }),
      );
    });
    expect(store.parked().map((r) => r.event_id)).toHaveLength(orphans); // only the target drained
    store.close();
    return delta;
  };

  it("01-F10/01-F6: draining one arrived key does work independent of the UNRELATED parked population (5 vs 50 orphans)", () => {
    expect(drainDelta(50)).toBe(drainDelta(5));
  });
});
