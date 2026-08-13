/**
 * ACCEPTANCE TESTS — the merge rules for `C8`'s `order.line_removed` (`02-F8`) and `C7`'s
 * `order.note_added` (`02-F6`).
 *
 * **AUTHORED FROM SPEC TEXT ONLY.** Written by a session that read `specs/02-pos-app.md`,
 * `specs/01-kernel-sync.md`, `specs/03-kitchen-fulfillment.md` and `specs/26-merge-semantics.md`,
 * and that did not write the implementation it describes (`24 §3` step 2). Read-only to the
 * implementing session.
 *
 * ⚠ **`packages/sync-client` IS A PROTECTED PATH (`20 §4.4`, commandment 10) AND NEEDS SENIOR
 * REVIEW.** `26 §7` makes a merge rule an ORACLE-PINNED decision rather than an implementer's, so
 * §0 below is the argument a reviewer should attack, not the code that follows it.
 *
 * ## Why these two are NOT projection-inert, unlike every registry addition before them
 *
 * The last four registry landings (`approval.*`, the four escalatable writes, the park pair,
 * `order.rejected`) all arrived **consumed and projection-inert with a stated debt**, because no
 * FR determined what they should project. That is the right default and it is the WRONG answer
 * here, for a reason that is textual rather than aesthetic:
 *
 *   **`02-F9`** — *"Items gone unavailable since placement must be resolved before accept: remove
 *   the line … **this explicit line-removal path is the only partial-confirmation mechanism**."*
 *   A partial confirmation that leaves the line in the order is not partial. The order confirms
 *   whole, the KOT prints the unavailable dish, and the customer is billed for it.
 *
 *   **`01-F30`** conserves `Σ payments − Σ refunds = billed_total − void_value − comp_value −
 *   discounts`. There is **no `removed_value` term**. So a line that stays in `billed_total` after
 *   a removal makes the identity unsatisfiable without a `void.recorded` — which is precisely the
 *   event `02-F8` says a pre-confirm removal is NOT.
 *
 *   **`02-F6`** — the note is *"printed prominently on the KOT"*, and `03 §1` lists
 *   `order.note_added` among this module's consumed events. A note that reaches no projection
 *   reaches no ticket, and `03-F55` gives it a slot on the chit that nothing could fill.
 *
 * A projection-inert arm here would therefore ship a **control that returns without complaint and
 * changes nothing** — strictly worse than the unbuilt state, because the cashier believes the Coke
 * came off. That is the judgement this file makes and it is the one to overturn if it is wrong.
 *
 * ## §0 — PINNED MERGE RULES (`26 §7`), with the law-1 argument for each
 *
 * **M1 — `order.line_removed` is a grow-only TOMBSTONE SET keyed by `line_id`; a tombstoned line
 * is absent from `json_lines` and contributes ZERO to `billed_effective`.**
 *   · *Convergence without ordering metadata.* The rule is `project(values, tombstones)` — a pure
 *     function of two SETS, both grow-only. Union is commutative and idempotent, so no clock, no
 *     `lamport_seq`, no `global_seq` and no envelope-id comparison is reachable (`01-F34`).
 *   · *Why remove-WINS and not add-wins.* A `line_id` is minted by the till that adds the line, so
 *     a removal naming it can only be issued by a device that has already SEEN the add — the
 *     genuinely concurrent add/remove pair does not arise. What does arise, constantly, is
 *     **delivery reordering**: the removal reaching a peer before the add. Remove-wins is the only
 *     rule under which the two orders agree. §B is aimed at exactly that.
 *   · *Why a tombstone SET and not a mutation.* Deleting the value at fold time would make the
 *     outcome depend on arrival order — a live `01-F34` break, and the shape `merge.ts`'s
 *     retention `droppedLines` filter has (legitimately, because a retention drop is a
 *     session-scoped outer-layer act, not a ledger fact). Copying that filter here is the single
 *     most likely mis-implementation and §B kills it.
 *   · *Why nothing is deleted from the LEDGER.* `02-F5`: *"Nothing is deleted in any of these —
 *     pure event composition."* `01-F1`. §A asserts the `order.line_added` is still readable.
 *
 * **M2 — `order.note_added` is a grow-only VALUE SET per `line_id`, rendered on the line's cell as
 * `notes`, deduplicated by TEXT and sorted by text.**
 *   · *Why a set and not a register.* `02-F50` and `01 §4`: the catalog has `note_added` and no
 *     `note_removed` / `note_changed`, and `02-F6`'s quick-tags are a pick list, so two taps are
 *     two facts. A register would need a tiebreak, every available tiebreak is banned (`01-F34`;
 *     `26 §7` bans `min(envelope.id)` by name because UUIDv7 makes an id comparison wall-clock in
 *     disguise), and the failure direction is the unsafe one: the second tag silently erasing
 *     *"no peanuts"*.
 *   · *Why sorted by TEXT and not by id or arrival.* Sorting by envelope id is an id comparison
 *     REACHING A PROJECTED VALUE — the exact `01-F34` break, and one that survives plain
 *     convergence testing (every replica agrees, and the agreed answer still moves under a
 *     bijective relabel). Sorting by text is set-determined. §F is the relabel oracle.
 *   · *Why deduplicated by text.* Two taps of one tag, or one tag redelivered, must print one row.
 *     Value-keying is what makes redelivery idempotent, exactly as `createMembers`, `lineValues`
 *     and the availability lattice already key by canonical bytes rather than by id.
 *   · *Why an ARRAY on the cell and not a joined string.* The join separator would be a
 *     presentation decision taken in the kernel, and `03-F55` puts the KOT's arrangement in
 *     `packages/escpos`. A shape that can only hold one note would force M2 back to a register.
 *
 * **M3 — a note whose line has not been delivered is HELD, never parked, never dropped.** The
 * engine already states this rule for the neighbouring per-line fact: matrix row 61, *"edges for a
 * not-yet-added line are held, never parked, never dropped"*. A note is the same shape, and
 * `01-F10`'s `PARKING_TYPES` hold is for bare ORDER facts waiting on an order key — wiring a note
 * into it would move a real operator act into a delivery-layer holding table (`DEC-SYNC-011`'s
 * shape). §E asserts it by execution.
 *
 * **M4 — a note on a REMOVED line disappears with the line.** The cell is gone, so its notes are
 * gone. Stated because the alternative is reachable by accident: an implementation that renders
 * notes from a separate map keyed only by `line_id` would print *"less spicy"* on a chit with no
 * dish above it.
 *
 * ## WHAT THIS FILE DELIBERATELY DOES NOT PIN
 *
 * - **Whether the removal is REFUSED after confirm.** `02-F49` puts that guard in `main` against
 *   the till's own projection; the fold is `01-F6`-replayable history and must apply what the
 *   ledger holds. A fold that refused a post-confirm removal would make one device's projection
 *   depend on which events it happened to receive first — and would silently diverge from the
 *   cloud Auditor's refold (`01-F7`, `20 §4.2`).
 * - **Whether the removed line's cell is retained with a marker instead of dropped.** Asserted as
 *   ABSENT because `billedEffectiveFromJsonLines` sums the cells it finds, so a retained cell
 *   would have to carry a new "excluded" flag that `01-F30` has no term for. Named so a reviewer
 *   can overturn M1's rendering half without touching its convergence half.
 * - **Whether `notes` is OMITTED or `[]` on a line with no notes.** A projection is not a ledger,
 *   `01-F1` does not reach it, and pinning the empty-case bytes would churn every existing
 *   `json_lines` assertion for nothing. `notesOf` below reads both.
 */

import { describe, expect, it } from "vitest";
// Reached through the package's public entry point for the same reason `merge-builders.ts` drives
// `openStore`: the oracle tests the surface a host app has, never an internal.
import { billedEffectiveFromJsonLines as billedFrom } from "../index.js";
import {
  appendInput,
  canonicalJson,
  type Identity,
  identity,
  peerEnvelope,
  peerIdentity,
} from "./builders.js";
import {
  created,
  foldStats,
  ingestAll,
  invariantBytes,
  lineAdded,
  type MergeLineCell,
  type MergeStore,
  mapProjectionIds,
  mergeStore,
  relabelEnvelope,
  reversingIdMap,
} from "./merge-builders.js";

const T0 = 1752800000000;

/** `02-F8`'s pre-confirm removal — `{order_id, line_id}`, the domain oracle's P1. */
const lineRemoved = (order_id: string, line_id: string) => ({
  type: "order.line_removed",
  payload: { order_id, line_id },
});

/** `02-F6`'s item note — `{order_id, line_id, note}`, the domain oracle's P2. */
const noteAdded = (order_id: string, line_id: string, note: string) => ({
  type: "order.note_added",
  payload: { order_id, line_id, note },
});

const branchPeer = (id: Identity, device_id: string): Identity => ({
  ...peerIdentity(id),
  device_id,
});

const envelopeFor = (peer: Identity, lamport: number, typed: Record<string, unknown>) =>
  peerEnvelope(peer, lamport, {
    id: `e-${peer.device_id}-${String(lamport).padStart(3, "0")}`,
    device_created_at: T0 + lamport,
    ...typed,
  }) as Record<string, unknown> & { id: string };

const deliver = (
  store: MergeStore,
  peer: Identity,
  lamport: number,
  typed: Record<string, unknown>,
): void => {
  store.ingest(envelopeFor(peer, lamport, typed));
};

const onlyOrder = (store: MergeStore) => {
  const rows = store.openOrders();
  expect(rows).toHaveLength(1);
  const row = rows[0];
  if (!row) throw new Error("expected exactly one open_orders row");
  return row;
};

const cells = (store: MergeStore): Record<string, MergeLineCell> =>
  JSON.parse(onlyOrder(store).json_lines) as Record<string, MergeLineCell>;

const lineIds = (store: MergeStore): string[] => Object.keys(cells(store)).sort();

/**
 * The order's billed total through **the engine's own derivation** (`26 §8`, `01-F34`, and the
 * T-01-11 ruling that deleted the Auditor's mirror of this sum). A test that re-summed the cells
 * here would be a second implementation of the one number this assertion is about.
 */
const billed = (store: MergeStore): number => billedFrom(onlyOrder(store).json_lines);

/** M2's rendering, read tolerantly of the omitted-vs-`[]` question §0 leaves unpinned. */
const notesOf = (cell: MergeLineCell): string[] => {
  const raw = (cell as unknown as { notes?: unknown }).notes;
  if (raw === undefined) return [];
  expect(
    Array.isArray(raw),
    "the cell's `notes` is not an array — M2 pins a SET, not a register",
  ).toBe(true);
  return raw as string[];
};

const notesOn = (store: MergeStore, lineId: string): string[] => {
  const found = cells(store)[lineId];
  if (!found) throw new Error(`expected a cell for line ${lineId}`);
  return notesOf(found);
};

/** One order, two lines, priced so a wrong total is a wrong NUMBER and not a wrong flag. */
const TWO_LINE_ORDER = (peer: Identity) => [
  envelopeFor(peer, 0, created("O1")),
  envelopeFor(peer, 1, lineAdded("O1", "L1", { qty: 1, unit_price_paisa: 45000 })),
  envelopeFor(peer, 2, lineAdded("O1", "L2", { qty: 2, unit_price_paisa: 6000 })),
];
/** 45000 + 2×6000. Written out so the expectations below are arithmetic a reader can check. */
const BOTH_LINES_PAISA = 45000 + 2 * 6000;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — 02-F9/01-F30: the removal REACHES the projection. The assertion this file exists for.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F9/01-F30 — a removed line leaves the cart and leaves billed_total", () => {
  /**
   * ⚠ **THE PROJECTION-INERT MUTANT.** `case "order.line_removed": return;` — the arm every
   * previous registry landing shipped, and the one a session following the most recent precedent
   * will write. It passes the domain schema oracle, passes `merge-workcounter.test.ts`, passes
   * `seams:check`, and leaves the cashier tapping `×` on a line that never moves.
   */
  it("02-F9: the removed line is gone from json_lines and the other line is not", () => {
    const id = identity();
    const store = mergeStore(id);
    const counter = branchPeer(id, "d-counter-1");
    ingestAll(store, TWO_LINE_ORDER(counter));
    expect(lineIds(store)).toEqual(["L1", "L2"]);

    deliver(store, counter, 3, lineRemoved("O1", "L1"));

    expect(
      lineIds(store),
      "02-F9: 'remove the line' is the only partial-confirmation mechanism — a line that stays " +
        "is a confirmation that is not partial",
    ).toEqual(["L2"]);
    store.close();
  });

  it("01-F30: billed_effective drops by exactly the removed line's money", () => {
    const id = identity();
    const store = mergeStore(id);
    const counter = branchPeer(id, "d-counter-1");
    ingestAll(store, TWO_LINE_ORDER(counter));
    expect(billed(store)).toBe(BOTH_LINES_PAISA);

    deliver(store, counter, 3, lineRemoved("O1", "L1"));

    // Not merely "smaller": the exact remainder. A mutant that zeroed the whole order, or that
    // subtracted the unit price without the quantity, is smaller too.
    expect(
      billed(store),
      "01-F30 has no `removed_value` term — a line that stays in billed_total makes the " +
        "conservation identity unsatisfiable without the void 02-F8 says this is NOT",
    ).toBe(2 * 6000);
    store.close();
  });

  it("01-F33: the fold's OWN billed accumulator drops too — the two derivations must not diverge", () => {
    /**
     * ⚠ **ADDED BY MUTATION (matrix S6, first run: 0 kills).** Every other money assertion here
     * goes through `billedEffectiveFromJsonLines`, which is what the product reads
     * (`main/gateway.ts` feeds `OpenOrder.total_paisa` from it) — but `projectEntity` keeps a
     * SECOND accumulator of the same quantity, and that one is not a column on the row. It is the
     * input to `01-F33`'s `uncovered_addition` check, so a removal that dropped the CELL and kept
     * its MONEY was invisible to the whole suite: the cart read right and the ceiling comparison
     * read the pre-removal total.
     *
     * `01-F33` is where it becomes observable. The close attests a ceiling of 12,000 — exactly the
     * surviving line — so a correct fold lands ON the ceiling and raises nothing, while a fold
     * still carrying the removed 45,000 busts it and flags an addition nobody made. `26 §8` and
     * the T-01-11 ruling are explicit that one total may not have two implementations; this is the
     * assertion that the two inside this file agree.
     */
    const id = identity();
    const store = mergeStore(id);
    const counter = branchPeer(id, "d-counter-1");
    ingestAll(store, [
      envelopeFor(counter, 0, created("O1")),
      envelopeFor(counter, 1, lineAdded("O1", "L1", { qty: 1, unit_price_paisa: 45000 })),
      envelopeFor(counter, 2, lineAdded("O1", "L2", { qty: 2, unit_price_paisa: 6000 })),
      envelopeFor(counter, 3, {
        type: "order.settlement_closed",
        payload: {
          order_id: "O1",
          settlement_attempt_ids: [] as string[],
          billed_paisa: 2 * 6000,
          tendered_paisa: 2 * 6000,
          refunded_paisa: 0,
          closed_by_user: "u-close",
        },
      }),
      envelopeFor(counter, 4, lineRemoved("O1", "L1")),
    ]);

    expect(billed(store)).toBe(2 * 6000);
    expect(
      JSON.parse(onlyOrder(store).exceptions_json) as string[],
      "01-F33 flagged an addition nobody made — the fold's own billed accumulator still carries " +
        "the removed line while json_lines does not",
    ).toEqual([]);
    store.close();
  });

  it("02-F5/01-F1: the LEDGER still holds the line_added — nothing is deleted, only projected away", () => {
    // `02-F5`: "Nothing is deleted in any of these — pure event composition." A mutant that
    // implemented removal as a SQL delete of the event, or of the projection row, would satisfy
    // both assertions above and destroy the audit trail `02-F19` and Appendix A rest on.
    const id = identity();
    const store = mergeStore(id);
    const counter = branchPeer(id, "d-counter-1");
    ingestAll(store, TWO_LINE_ORDER(counter));
    deliver(store, counter, 3, lineRemoved("O1", "L1"));

    const types = store.readAllEvents().map((e) => e.type);
    expect(types.filter((t) => t === "order.line_added")).toHaveLength(2);
    expect(types).toContain("order.line_removed");
    store.close();
  });

  it("03-F25: a removed line is not in the kitchen queue's line count either", () => {
    // The pass screen and `02-F9`'s accept path read `lines_total` off the same cells. A removal
    // that reached `json_lines` and not this count would put a phantom dish on the cook's ticket.
    const id = identity();
    const store = mergeStore(id);
    const counter = branchPeer(id, "d-counter-1");
    ingestAll(store, TWO_LINE_ORDER(counter));
    deliver(store, counter, 3, { type: "order.confirmed", payload: { order_id: "O1" } });
    const before = store.kitchenQueue()[0];
    expect(before?.lines_total).toBe(2);

    deliver(store, counter, 4, lineRemoved("O1", "L1"));
    expect(store.kitchenQueue()[0]?.lines_total).toBe(1);
    store.close();
  });

  it("removing the ONLY line leaves the order present and billed zero", () => {
    // `02-F4`'s reasoning, one level down: an order that left the projection is reachable from
    // nowhere. A cashier who clears a mis-keyed order must still be able to ring it again, and
    // `01 §4` has no order state for "emptied".
    const id = identity();
    const store = mergeStore(id);
    const counter = branchPeer(id, "d-counter-1");
    ingestAll(store, [
      envelopeFor(counter, 0, created("O1")),
      envelopeFor(counter, 1, lineAdded("O1", "L1", { qty: 1, unit_price_paisa: 45000 })),
    ]);
    deliver(store, counter, 2, lineRemoved("O1", "L1"));

    expect(store.openOrders().map((r) => r.order_id)).toEqual(["O1"]);
    expect(lineIds(store)).toEqual([]);
    expect(billed(store)).toBe(0);
    store.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — M1's case that matters: REMOVE-WINS UNDER REORDERING. The tombstone-vs-filter mutant.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F34/01-F16 — the removal wins whichever way the two events arrive", () => {
  /**
   * ⚠ **THE ASSERTION §B EXISTS FOR.** `merge.ts` already contains the wrong pattern, written
   * correctly for a different purpose: retention's `droppedLines` filter reads
   *
   *     if (droppedLines.has(lineKey(p.order_id, p.line_id))) return;
   *
   * at the TOP of the `order.line_added` arm. That is legitimate there — a retention drop is a
   * session-scoped outer-layer act with its own atomicity rules — and it is exactly wrong here,
   * because it only removes the line when the removal was folded FIRST. An implementer reaching
   * for the nearest existing code writes it, every §A test stays green, and the defect appears
   * only on a peer whose delivery order differs: `01-F16` puts concurrent line-adds from two
   * terminals in ordinary service, and `02-F11` makes the same order reachable from every till.
   *
   * The same mutant is produced by the other tempting shape — `e.lineValues.delete(line_id)` in
   * the removal arm — which is destructive rather than order-dependent but fails identically here.
   */
  it("01-F34: the removal delivered BEFORE its line_added still removes the line", () => {
    const id = identity();
    const store = mergeStore(id);
    const counter = branchPeer(id, "d-counter-1");
    ingestAll(store, [
      envelopeFor(counter, 0, created("O1")),
      envelopeFor(counter, 2, lineAdded("O1", "L2", { qty: 2, unit_price_paisa: 6000 })),
      // The removal arrives with its line still in flight — an ordinary WAN/LAN reorder.
      envelopeFor(counter, 3, lineRemoved("O1", "L1")),
      envelopeFor(counter, 1, lineAdded("O1", "L1", { qty: 1, unit_price_paisa: 45000 })),
    ]);

    expect(
      lineIds(store),
      "the removal was applied as a FILTER or a DELETE rather than as a tombstone SET — it only " +
        "works when it happens to arrive last (01-F34)",
    ).toEqual(["L2"]);
    expect(billed(store)).toBe(2 * 6000);
    store.close();
  });

  it("01-F34: both delivery orders produce BYTE-IDENTICAL projections", () => {
    // The property behind the test above, stated as `26 §8`'s convergence claim rather than as one
    // outcome. Byte comparison rather than a field check: a divergence hiding in `exceptions_json`
    // or in an anomaly map is still a divergence.
    const id = identity();
    const counter = branchPeer(id, "d-counter-1");
    const events = [
      envelopeFor(counter, 0, created("O1")),
      envelopeFor(counter, 1, lineAdded("O1", "L1", { qty: 1, unit_price_paisa: 45000 })),
      envelopeFor(counter, 2, lineAdded("O1", "L2", { qty: 2, unit_price_paisa: 6000 })),
      envelopeFor(counter, 3, lineRemoved("O1", "L1")),
      envelopeFor(counter, 4, noteAdded("O1", "L2", "less spicy")),
    ];
    const forward = mergeStore(id);
    const backward = mergeStore(id);
    ingestAll(forward, events);
    ingestAll(backward, [...events].reverse());
    expect(invariantBytes(forward)).toBe(invariantBytes(backward));
    forward.close();
    backward.close();
  });

  it("01-F31-shaped idempotence: the same removal redelivered changes nothing", () => {
    // Redelivery is the transport's ordinary behaviour, not an exotic case. A counter that
    // decremented a running total per removal event would drift by one line per duplicate.
    const id = identity();
    const store = mergeStore(id);
    const counter = branchPeer(id, "d-counter-1");
    ingestAll(store, TWO_LINE_ORDER(counter));
    const removal = envelopeFor(counter, 3, lineRemoved("O1", "L1"));
    store.ingest(removal);
    const after = onlyOrder(store).json_lines;
    store.ingest(removal);
    expect(onlyOrder(store).json_lines).toBe(after);
    expect(billed(store)).toBe(2 * 6000);
    store.close();
  });

  it("TWO TILLS removing the SAME line converge on one removal, not two (02-F11)", () => {
    // Two devices, two distinct envelope ids, one `line_id`. `02-F11` makes this ordinary: the
    // order is reachable from every terminal, so two cashiers can act inside one LAN round trip.
    const id = identity();
    const store = mergeStore(id);
    const counter1 = branchPeer(id, "d-counter-1");
    const counter2 = branchPeer(id, "d-counter-2");
    ingestAll(store, TWO_LINE_ORDER(counter1));
    deliver(store, counter1, 3, lineRemoved("O1", "L1"));
    deliver(store, counter2, 0, lineRemoved("O1", "L1"));

    expect(lineIds(store)).toEqual(["L2"]);
    expect(
      JSON.parse(onlyOrder(store).exceptions_json) as string[],
      "two tills agreeing is not a conflict — a removal has no value to disagree about",
    ).toEqual([]);
    store.close();
  });

  it("CONTROL — a removal naming a line that never existed removes nothing else", () => {
    // Without this, an implementation that emptied `json_lines` on any removal would pass every
    // assertion above (each of which removes a line that IS there). It is also the straggler case:
    // a removal for a line this device will never see must not invent a projection change.
    const id = identity();
    const store = mergeStore(id);
    const counter = branchPeer(id, "d-counter-1");
    ingestAll(store, TWO_LINE_ORDER(counter));
    deliver(store, counter, 3, lineRemoved("O1", "L-never"));

    expect(lineIds(store)).toEqual(["L1", "L2"]);
    expect(billed(store)).toBe(BOTH_LINES_PAISA);
    store.close();
  });

  it("CONTROL — a removal on ORDER A does not reach the same line_id on ORDER B", () => {
    /**
     * `line_id` is minted per line and NOTHING in the schema makes it globally unique — a
     * per-order counter produces `L1` on every order by construction — so a tombstone set keyed by
     * `line_id` ALONE, rather than per entity, silently empties the neighbouring bill.
     *
     * ⚠ **THE LAST EVENT IS LOAD-BEARING AND WAS ADDED BY MUTATION.** Without it this test
     * SURVIVED a globally-keyed mutant (matrix S5, first run: 0 kills), and the reason is a
     * property of the engine rather than of the mutant: `apply` returns only the keys it marked
     * DIRTY, so after a removal on `OA` only `OA` is re-projected and `OB`'s stored row is the one
     * computed before the tombstone existed. A cross-order leak is therefore invisible until
     * something else touches `OB` — which in service is the very next tap. Adding a line to `OB`
     * after the removal is what forces that re-projection, and it is the ordinary case, not a
     * contrived one.
     */
    const id = identity();
    const store = mergeStore(id);
    const counter = branchPeer(id, "d-counter-1");
    ingestAll(store, [
      envelopeFor(counter, 0, created("OA")),
      envelopeFor(counter, 1, lineAdded("OA", "L1", { qty: 1, unit_price_paisa: 45000 })),
      envelopeFor(counter, 2, created("OB")),
      envelopeFor(counter, 3, lineAdded("OB", "L1", { qty: 1, unit_price_paisa: 45000 })),
      envelopeFor(counter, 4, lineRemoved("OA", "L1")),
      // The next ordinary act on the untouched order — a second dish rung on OB.
      envelopeFor(counter, 5, lineAdded("OB", "L2", { qty: 1, unit_price_paisa: 6000 })),
    ]);

    const rows = Object.fromEntries(store.openOrders().map((r) => [r.order_id, r]));
    expect(Object.keys(JSON.parse(rows.OA?.json_lines ?? "{}") as object)).toEqual([]);
    expect(
      Object.keys(JSON.parse(rows.OB?.json_lines ?? "{}") as object).sort(),
      "the tombstone set is keyed by line_id alone and crossed into another order",
    ).toEqual(["L1", "L2"]);
    store.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — 01-F4 on the path the PRODUCT uses: this till appending its own act.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F4/00 §5.2 — the till can APPEND both, which is what was blocked", () => {
  /**
   * Every other assertion here drives `ingest`, the PEER path. `02-F8` and `02-F6` are things a
   * cashier does on THIS till, and that is `store.append` — which runs the same `parseEvent` and,
   * before this change, threw `UnknownEventTypeError` inside it. Asserting the ingest path alone
   * would leave the product-facing claim resting on an inference, which is this repo's named
   * recurring defect in miniature.
   */
  it.each([
    ["order.line_removed", { order_id: "O-append", line_id: "L1" }],
    ["order.note_added", { order_id: "O-append", line_id: "L1", note: "less spicy" }],
  ])("%s is appendable by this device and lands in its own ledger", (type, payload) => {
    const id = identity();
    const store = mergeStore(id);
    store.append(appendInput(id, { type, payload }));
    expect(store.readOwnEvents().map((e) => e.type)).toContain(type);
    store.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — 01-F10: neither type is a `PARKING_TYPES` member (the name-collision trap, one door over).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 01-F10/M3 — a straggler is HELD on its line, never parked and never dropped", () => {
  it("a note for a line that has not arrived does not park an event or invent a row", () => {
    const id = identity();
    const store = mergeStore(id);
    const counter = branchPeer(id, "d-counter-1");
    deliver(store, counter, 0, created("O1"));
    deliver(store, counter, 1, noteAdded("O1", "L1", "less spicy"));

    expect(
      store.parked().map((r) => r.event_id),
      "a note was held by 01-F10's key-presence hold",
    ).toEqual([]);
    expect(lineIds(store), "a note invented a line cell with no line_added").toEqual([]);
    store.close();
  });

  it("M3: the note SURVIVES until its line arrives, and then renders on it (matrix row 61)", () => {
    // The half that makes "held, never dropped" a claim rather than a word. An implementation that
    // discarded a note for an unknown line would pass the test above and lose an allergen
    // instruction on every LAN reorder.
    const id = identity();
    const store = mergeStore(id);
    const counter = branchPeer(id, "d-counter-1");
    deliver(store, counter, 0, created("O1"));
    deliver(store, counter, 1, noteAdded("O1", "L1", "less spicy"));
    deliver(store, counter, 2, lineAdded("O1", "L1", { qty: 1, unit_price_paisa: 45000 }));

    expect(notesOn(store, "L1")).toEqual(["less spicy"]);
    store.close();
  });

  it("a removal whose order key has not arrived neither parks nor invents an order row", () => {
    const id = identity();
    const store = mergeStore(id);
    const counter = branchPeer(id, "d-counter-1");
    deliver(store, counter, 0, lineRemoved("O-never-created", "L1"));

    expect(store.openOrders(), "a bare removal invented an order row").toEqual([]);
    expect(store.parked().map((r) => r.event_id)).toEqual([]);
    store.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — M2/M4: notes ACCUMULATE on their line, and go with it when it is removed.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 02-F6/02-F50 — the note reaches its line's cell and never replaces another", () => {
  it("02-F6: a note renders on the line it names, and not on the other line", () => {
    const id = identity();
    const store = mergeStore(id);
    const counter = branchPeer(id, "d-counter-1");
    ingestAll(store, TWO_LINE_ORDER(counter));
    deliver(store, counter, 3, noteAdded("O1", "L1", "less spicy"));

    expect(notesOn(store, "L1")).toEqual(["less spicy"]);
    expect(
      notesOn(store, "L2"),
      "03-F55 puts the note in ITS OWN item block — a note on every line is a note on none",
    ).toEqual([]);
    store.close();
  });

  /**
   * ⚠ **THE ASSERTION §E EXISTS FOR.** The register mutant — `notes.set(line_id, text)` or a
   * `note: string` column — passes the test above and every `01-F34` invariance check, because a
   * register over a one-element set converges perfectly. It fails only when a second tag is
   * tapped, which `02-F6`'s pick list makes the ordinary case, and the fact it loses is exactly
   * the one `27-F59` calls an allergen incident.
   */
  it("02-F50: two tags on one line BOTH survive — the second does not erase the first", () => {
    const id = identity();
    const store = mergeStore(id);
    const counter = branchPeer(id, "d-counter-1");
    ingestAll(store, TWO_LINE_ORDER(counter));
    deliver(store, counter, 3, noteAdded("O1", "L1", "no peanuts"));
    deliver(store, counter, 4, noteAdded("O1", "L1", "less spicy"));

    expect(
      notesOn(store, "L1"),
      "the second note replaced the first — the quick-tag pick list is being folded as a register",
    ).toEqual(["less spicy", "no peanuts"]);
    store.close();
  });

  it("M2: the same tag twice is ONE note — value-keyed, so redelivery is idempotent", () => {
    const id = identity();
    const store = mergeStore(id);
    const counter = branchPeer(id, "d-counter-1");
    ingestAll(store, TWO_LINE_ORDER(counter));
    deliver(store, counter, 3, noteAdded("O1", "L1", "less spicy"));
    deliver(store, counter, 4, noteAdded("O1", "L1", "less spicy"));

    expect(notesOn(store, "L1")).toEqual(["less spicy"]);
    store.close();
  });

  it("M4: a note on a REMOVED line goes with the line", () => {
    // Otherwise a chit prints "less spicy" with no dish above it — and `03-F55` gives the note a
    // position INSIDE its item block, so an orphan note has nowhere legal to render at all.
    const id = identity();
    const store = mergeStore(id);
    const counter = branchPeer(id, "d-counter-1");
    ingestAll(store, TWO_LINE_ORDER(counter));
    deliver(store, counter, 3, noteAdded("O1", "L1", "less spicy"));
    deliver(store, counter, 4, lineRemoved("O1", "L1"));

    expect(lineIds(store)).toEqual(["L2"]);
    expect(notesOn(store, "L2")).toEqual([]);
    store.close();
  });

  it("00 §5.6: a non-Latin note reaches the projection unaltered — the refusal is the PRINTER's", () => {
    // `01-F54`'s degrade rule and `00 §5.6`'s user-content rule both bind here: the fold never
    // transliterates and never drops. `03-F8`'s `raster_font_unavailable` is a document-layer
    // refusal, and a fold that silently sanitised would hide it.
    const id = identity();
    const store = mergeStore(id);
    const counter = branchPeer(id, "d-counter-1");
    ingestAll(store, TWO_LINE_ORDER(counter));
    deliver(store, counter, 3, noteAdded("O1", "L1", "کم مرچ"));

    expect(notesOn(store, "L1")).toEqual(["کم مرچ"]);
    store.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — 01-F34: the projection is invariant under a bijective envelope-id relabel.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F 01-F34/26 §8 — no projected value reaches an envelope-id comparison", () => {
  /**
   * ⚠ **THE ASSERTION THIS SECTION EXISTS FOR, and the one plain convergence testing cannot
   * make.** The tempting rendering for M2's set is *"sort the notes by the id of the event that
   * added them"* — chronological-looking, stable, and agreed by every replica. It is a live
   * `01-F34` break: UUIDv7 puts wall clock in the id prefix, so the projected ORDER of two notes
   * would be decided by which device's clock ran ahead. `26 §8` names this as the binding oracle
   * lesson and `26 §7` bans `min(envelope.id)` by name.
   *
   * The relabel is ORDER-REVERSING (`reversingIdMap`), so any id-sorted rendering flips and the
   * bytes move. Text-sorted rendering does not.
   */
  it("a reversing id relabel leaves the projection byte-identical (notes and removals both)", () => {
    const id = identity();
    const counter = branchPeer(id, "d-counter-1");
    const events = [
      envelopeFor(counter, 0, created("O1")),
      envelopeFor(counter, 1, lineAdded("O1", "L1", { qty: 1, unit_price_paisa: 45000 })),
      envelopeFor(counter, 2, lineAdded("O1", "L2", { qty: 2, unit_price_paisa: 6000 })),
      // Two notes whose TEXT order is the reverse of their id order, so an id-sorted rendering
      // and a text-sorted one disagree on the base set as well as under φ.
      envelopeFor(counter, 3, noteAdded("O1", "L2", "no onions")),
      envelopeFor(counter, 4, noteAdded("O1", "L2", "extra raita")),
      envelopeFor(counter, 5, lineRemoved("O1", "L1")),
    ];

    const plain = mergeStore(id);
    ingestAll(plain, events);
    const before = JSON.parse(invariantBytes(plain)) as Parameters<typeof mapProjectionIds>[0];

    const map = reversingIdMap(events.map((e) => e.id));
    const relabelled = mergeStore(id);
    ingestAll(
      relabelled,
      events.map((e) => relabelEnvelope(e, map)),
    );

    expect(
      invariantBytes(relabelled),
      "a projected value moved under a bijective id relabel — something in the notes or the " +
        "tombstone set is reading envelope ids (01-F34)",
      // `canonicalJson` on BOTH sides, not `JSON.stringify`: `invariantBytes` is canonical
      // (keys sorted at every depth) and a plain stringify preserves insertion order, so the two
      // differ by key ORDER alone and the assertion fails against a CORRECT implementation. Caught
      // on the first green run — the round-3 law's second corollary in miniature.
    ).toBe(canonicalJson(mapProjectionIds(before, map)));
    plain.close();
    relabelled.close();
  });

  it("01-F45: injecting a different device clock leaves the projection byte-identical", () => {
    // Law 2's half. `device_created_at` is an untrusted forensic hint with one sanctioned reader
    // (`01-N2`), so no rendering of a note or a tombstone may reach it — including "sort by when
    // it was typed", which is the natural-language description of the id-sort mutant above.
    const id = identity();
    const counter = branchPeer(id, "d-counter-1");
    const build = (skew: number) =>
      [
        created("O1"),
        lineAdded("O1", "L1", { qty: 1, unit_price_paisa: 45000 }),
        lineAdded("O1", "L2", { qty: 2, unit_price_paisa: 6000 }),
        noteAdded("O1", "L2", "no onions"),
        noteAdded("O1", "L2", "extra raita"),
        lineRemoved("O1", "L1"),
      ].map((typed, i) =>
        peerEnvelope(counter, i, {
          id: `e-fixed-${String(i).padStart(3, "0")}`,
          device_created_at: T0 + skew - i * 1000,
          ...typed,
        }),
      );

    const a = mergeStore(id);
    const b = mergeStore(id);
    ingestAll(a, build(0));
    ingestAll(b, build(9_000_000));
    expect(invariantBytes(a)).toBe(invariantBytes(b));
    a.close();
    b.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §G — the work counter tells the truth: both are CONSUMED, not filed as non-fold types.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§G 01-F52/01-F6 — consumed and counted honestly", () => {
  it.each([
    ["order.line_removed", lineRemoved("O1", "L1")],
    ["order.note_added", noteAdded("O1", "L1", "less spicy")],
  ])("%s is consumed by the engine, not filed as a non-fold type", (_label, typed) => {
    // A type routed through `NON_FOLD_TYPES` (or whose `keysFor` returns `[]`) does ZERO fold work
    // and is NOT counted — `merge-workcounter.test.ts`'s own `01-F52` test asserts exactly that
    // shape for `catalog.changed`. A delta of zero here would mean the engine had quietly filed a
    // POS act under "no fold may read this".
    const id = identity();
    const store = mergeStore(id);
    const counter = branchPeer(id, "d-counter-1");
    ingestAll(store, TWO_LINE_ORDER(counter));
    const before = foldStats(store).events_folded;
    deliver(store, counter, 3, typed);
    expect(foldStats(store).events_folded - before).toBeGreaterThan(0);
    store.close();
  });
});
