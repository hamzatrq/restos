/**
 * ACCEPTANCE TESTS — what the fold engine does with `C10`'s `order.parked` / `order.unparked`
 * (`02-F4`) and `C20`'s `order.rejected` (`02-F9` / `06-F20`).
 *
 * **AUTHORED FROM SPEC TEXT ONLY.** Written by a session that read `specs/02-pos-app.md`,
 * `specs/06-storefront.md`, `specs/01-kernel-sync.md` and `specs/26-merge-semantics.md`, and that
 * did not write the implementation it describes (`24 §3` step 2). Read-only to the implementer.
 *
 * ⚠ **`packages/sync-client` IS A PROTECTED PATH (`20 §4.4`, commandment 10).**
 *
 * ## The disposition this file pins, and the one it deliberately refuses to
 *
 * `merge-workcounter.test.ts`'s partition puts all three in `PINNED_FOLD_CONSUMED` with the merge
 * rule stated as **projection-inert, a DEBT rather than a settled disposition** — `26 §7` makes a
 * merge rule an oracle-pinned decision and the schemas' landing session deliberately did not guess
 * one. That pin is a COMPILE-level claim plus a name in a list. This file is the EXECUTION half,
 * and it exists because two of the three plausible wrong implementations are invisible to a name
 * in a list:
 *
 *   **M1 — parking REMOVES the order from `open_orders`.** The most tempting fold in the whole
 *   task, and it is wrong on the FR's own words: `02-F4` says a parked order is "visible to every
 *   terminal in the branch" and `02-F11` says it can be "parked there and **resumed, extended, or
 *   settled on another**". An order that left the projection is resumable from nowhere. §A.
 *
 *   **M2 — `order.parked` wired into `PARKING_TYPES`.** `merge.ts` has a set called
 *   `PARKING_TYPES` and a projection called `parked()`, and NEITHER has anything to do with
 *   `02-F4`. They are `01-F10`'s key-presence hold: an event whose order key has not arrived yet
 *   waits there and drains when `order.created` lands. The collision is purely lexical and it is
 *   the single most likely mis-wiring in this change — a one-word edit, in a file where the word
 *   already appears, that would make every parked ORDER's event vanish from the fold into a
 *   holding table an operator cannot see. §B.
 *
 * ## What this file deliberately does NOT assert, and why that matters as much
 *
 * **Whether `order.rejected` removes its order from `open_orders`.** No FR decides it: `06-F20`'s
 * consumer is the storefront status page, a cloud read model on the other plane (`18 §6`), and
 * `01 §4`'s canonical states carry no `rejected` — its exit states are `voided / cancelled`.
 * Asserting *either* answer would be guessing a `26 §7` decision, and asserting the answer this
 * engine happens to give today would make a future CORRECT fold red. So §C asserts only that the
 * event is **consumed rather than silently dropped**, which is a claim about honesty, not about
 * projection — see the note on `events_folded` there.
 */

import { describe, expect, it } from "vitest";
import { appendInput, type Identity, identity, peerEnvelope, peerIdentity } from "./builders.js";
import { created, foldStats, type MergeStore, mergeStore } from "./merge-builders.js";

const T0 = 1752800000000;

/** `02-F4`'s pair. `[]` is a ROOT park (the domain oracle's P2); a resume names what it replaces. */
const parkedEvent = (order_id: string, supersedes: readonly string[] = []) => ({
  type: "order.parked",
  payload: { order_id, supersedes: [...supersedes] },
});

const unparkedEvent = (order_id: string, supersedes: readonly string[] = []) => ({
  type: "order.unparked",
  payload: { order_id, supersedes: [...supersedes] },
});

/** `06-F20`'s reason list; `06-F27`'s worked scenario is the one spelled in the corpus. */
const rejectedEvent = (order_id: string, reason = "item_unavailable") => ({
  type: "order.rejected",
  payload: { order_id, reason },
});

/** One peer device emitting into this store's branch — `02-F11`'s "another terminal". */
const branchPeer = (id: Identity, device_id: string): Identity => ({
  ...peerIdentity(id),
  device_id,
});

const deliver = (
  store: MergeStore,
  peer: Identity,
  lamport: number,
  typed: Record<string, unknown>,
): void => {
  store.ingest(
    peerEnvelope(peer, lamport, {
      id: `e-${peer.device_id}-${String(lamport).padStart(3, "0")}`,
      device_created_at: T0 + lamport,
      ...typed,
    }),
  );
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — 02-F4/02-F11: a parked order is STILL VISIBLE. The assertion this file exists for.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F4/02-F11 — parking does not remove the order from open_orders", () => {
  /**
   * Membership by `order_id` only, deliberately: a later `26 §7` decision may legitimately ADD a
   * `parked` column to the row, and a deep-equality assertion here would make that correct change
   * red. The claim is "the order is still reachable", which is exactly what `02-F4` promises.
   */
  const orderIds = (store: MergeStore): string[] =>
    store
      .openOrders()
      .map((r) => r.order_id)
      .sort();

  it("02-F4: an order parked on one till is still in open_orders", () => {
    const id = identity();
    const store = mergeStore(id);
    const counter1 = branchPeer(id, "d-counter-1");
    deliver(store, counter1, 0, created("O-park"));
    expect(orderIds(store)).toEqual(["O-park"]);

    deliver(store, counter1, 1, parkedEvent("O-park"));

    expect(
      orderIds(store),
      "02-F4: 'a parked order is durable and visible to every terminal in the branch' — " +
        "an order that left the projection is resumable from nowhere",
    ).toEqual(["O-park"]);
    store.close();
  });

  it("02-F11: the round trip — parked on Counter 1, resumed on Counter 2, parked again", () => {
    // The whole `02-F11` sentence in one delivery set: "an order started on one terminal can be
    // parked there and resumed, extended, or settled on another". Every step must leave the order
    // reachable, and the third fact is the one a bare-fact set cannot tell from the first — which
    // is why the domain oracle requires `supersedes` (its P2).
    const id = identity();
    const store = mergeStore(id);
    const counter1 = branchPeer(id, "d-counter-1");
    const counter2 = branchPeer(id, "d-counter-2");

    deliver(store, counter1, 0, created("O-trip"));
    deliver(store, counter1, 1, parkedEvent("O-trip"));
    expect(orderIds(store)).toEqual(["O-trip"]);

    deliver(store, counter2, 0, unparkedEvent("O-trip", ["e-d-counter-1-001"]));
    expect(orderIds(store)).toEqual(["O-trip"]);

    deliver(store, counter2, 1, parkedEvent("O-trip", ["e-d-counter-2-000"]));
    expect(
      orderIds(store),
      "a re-parked order vanished — the toggle is being read as a removal",
    ).toEqual(["O-trip"]);
    store.close();
  });

  it("02-F4: parking one order does not disturb the others on the same till", () => {
    // The CONTROL for §A. Without a second, untouched order, an implementation that simply never
    // removes anything from `open_orders` is indistinguishable from one that handles parking
    // correctly — and so is one that removes ALL orders on any park, if the suite only ever holds
    // one. This is the "differs in exactly one branch" discipline applied to the fixture.
    const id = identity();
    const store = mergeStore(id);
    const counter1 = branchPeer(id, "d-counter-1");
    deliver(store, counter1, 0, created("O-a"));
    deliver(store, counter1, 1, created("O-b"));
    deliver(store, counter1, 2, parkedEvent("O-a"));
    expect(orderIds(store)).toEqual(["O-a", "O-b"]);
    store.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A2 — 01-F4 on the path the PRODUCT uses: this till appending its own act.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A2 01-F4/00 §5.2 — the till can APPEND these, which is what was blocked", () => {
  /**
   * Every other assertion in this file drives `ingest`, the PEER path. `02-F4` and `02-F9` are
   * things a cashier does on THIS till, and that is `store.append` — which runs the same
   * `parseEvent` and, before this change, threw `UnknownEventTypeError` inside it. Asserting the
   * ingest path only would leave the product-facing claim ("a cashier can park an order") resting
   * on an inference, which is this repo's named recurring defect in miniature: a correct subsystem
   * with no seam to the act it exists to serve.
   *
   * `02-N5` ("a parked order is plug-pull safe the moment the park action returns") is the
   * durability half and is `00 §5.2`'s, not this file's — but a fact that never reaches the ledger
   * cannot be durable, so `readOwnEvents` is asserted rather than just a non-throwing call.
   */
  it.each([
    ["order.parked", { order_id: "O-append", supersedes: [] as string[] }],
    ["order.unparked", { order_id: "O-append", supersedes: [] as string[] }],
    ["order.rejected", { order_id: "O-append", reason: "closed" }],
  ])("%s is appendable by this device and lands in its own ledger", (type, payload) => {
    const id = identity();
    const store = mergeStore(id);
    store.append(appendInput(id, { type, payload }));
    expect(store.readOwnEvents().map((e) => e.type)).toContain(type);
    store.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — the `01-F10` NAME COLLISION. `parked()` is not `02-F4`.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F10 — store.parked() is the key-presence hold and NOT 02-F4's parked orders", () => {
  /**
   * `merge.ts`'s `PARKING_TYPES` holds "bare order facts that must wait for their order key"
   * (`order.confirmed`, `kot.printed`), and `parked()` renders that hold. `02-F4`'s parked ORDER is
   * a business fact about an order that is fully present. Conflating them would move a real,
   * operator-visible order into a delivery-layer holding table — `DEC-SYNC-011`'s stuck-cursor
   * shape, wearing a POS feature's name.
   */
  it("02-F4: an order.parked for a PRESENT order parks no event", () => {
    const id = identity();
    const store = mergeStore(id);
    const counter1 = branchPeer(id, "d-counter-1");
    deliver(store, counter1, 0, created("O-park"));
    deliver(store, counter1, 1, parkedEvent("O-park"));
    expect(
      store.parked().map((r) => r.event_id),
      "01-F10's key-presence hold was used for 02-F4's park — the name is the only thing they share",
    ).toEqual([]);
    store.close();
  });

  it("01-F10: an order.parked whose order key has NOT arrived neither parks nor invents a row", () => {
    // The straggler case, and the reason `kot.print_failed` and the approval family are
    // deliberately outside `PARKING_TYPES`: a projection-inert case touches no entity, so an early
    // arrival costs one counted no-op rather than a phantom order row an operator would see.
    const id = identity();
    const store = mergeStore(id);
    const counter1 = branchPeer(id, "d-counter-1");
    deliver(store, counter1, 0, parkedEvent("O-never-created"));
    expect(store.openOrders(), "a bare park invented an order row").toEqual([]);
    expect(
      store.parked().map((r) => r.event_id),
      "a bare park was held by 01-F10",
    ).toEqual([]);
    store.close();
  });

  it("06-F20: an order.rejected does not park either", () => {
    const id = identity();
    const store = mergeStore(id);
    const counter1 = branchPeer(id, "d-counter-1");
    deliver(store, counter1, 0, rejectedEvent("O-never-created"));
    expect(store.parked().map((r) => r.event_id)).toEqual([]);
    store.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — 01-F4/01-F6: all three are CONSUMED, and the work counter tells the truth about it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F52/01-F6 — consumed, counted honestly, and no projection guessed", () => {
  /**
   * The honesty claim, and the reason it is `> 0` rather than `=== 1`.
   *
   * `merge-workcounter.test.ts` pins all three in `PINNED_FOLD_CONSUMED` rather than
   * `PINNED_NOT_FOLDED`, and that is a claim with an observable: a type routed instead through
   * `NON_FOLD_TYPES` (or one whose `keysFor` returns `[]`) does ZERO fold work and is NOT counted —
   * that file's own `01-F52` test asserts exactly that shape for `catalog.changed`. So a delta of
   * zero here would mean the engine had quietly filed a POS event under "no fold may read this",
   * which is the inversion `merge-workcounter.test.ts` was rewritten to make impossible.
   *
   * `> 0` and not an exact count because a later `26 §7` ruling may legitimately make one of these
   * fold into a projection and touch more events on the way; the claim is "it was consumed", and
   * pinning arithmetic would make that correct change red.
   */
  it.each([
    ["order.parked", parkedEvent("O-c")],
    ["order.unparked", unparkedEvent("O-c")],
    ["order.rejected", rejectedEvent("O-c")],
  ])("%s is consumed by the engine, not filed as a non-fold type", (_label, typed) => {
    const id = identity();
    const store = mergeStore(id);
    const counter1 = branchPeer(id, "d-counter-1");
    deliver(store, counter1, 0, created("O-c"));
    const before = foldStats(store).events_folded;
    deliver(store, counter1, 1, typed);
    expect(foldStats(store).events_folded - before).toBeGreaterThan(0);
    store.close();
  });

  /**
   * ANTI-PIN, asserted as an ANTI-pin so a later session cannot mistake silence for an answer.
   *
   * A rejection is NOT asserted to leave `open_orders`, and it is NOT asserted to stay. `26 §7`
   * makes that an oracle-pinned decision, nothing in `02-F9`, `06-F20` or `01 §4` decides it, and
   * a test asserting today's answer would block tomorrow's correct one. What IS asserted is that
   * the engine does not CRASH on it and the store keeps serving reads — the minimum that makes the
   * type emittable in production, which is all `01-F4` was blocking.
   */
  it("06-F20: a rejection is survivable — the queue disposition is deliberately unpinned (26 §7)", () => {
    const id = identity();
    const store = mergeStore(id);
    const counter1 = branchPeer(id, "d-counter-1");
    deliver(store, counter1, 0, created("O-reject"));
    deliver(store, counter1, 1, created("O-keep"));
    deliver(store, counter1, 2, rejectedEvent("O-reject", "closed"));
    // The untouched order is the CONTROL: whatever a future fold does to a rejected order, it must
    // not reach an order nobody rejected.
    expect(store.openOrders().map((r) => r.order_id)).toContain("O-keep");
    expect(store.kitchenQueue()).toEqual([]); // nothing was confirmed; a rejection confirms nothing
    store.close();
  });
});
