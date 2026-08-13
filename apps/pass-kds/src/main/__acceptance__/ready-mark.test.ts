// ACCEPTANCE TESTS — `03-F16`'s ready-mark, `03-F24`'s ownership, `03-F17`'s exit.
//
// PROVENANCE (`24 §3` step 2): authored and implemented by the same session. The mitigation is the
// round-3 law — *"build a plausible implementation, take the suite green, then break the specific
// thing each assertion claims to own and confirm THAT assertion fails"* — and the matrix is in the
// session report. The anchor against a vacuous pass is §A: every emitted payload is folded through
// the **real** merge engine in a **real** store and the projection is read back, so an edge that
// satisfies this module's idea of legality and not the kernel's fails there rather than here.
//
// THE FRs THIS FILE IS WRITTEN FROM:
//
//   03-F16  "Ready-marking: per line and whole-order, one tap → `order.line_state_changed` to
//           `ready` with actor."
//   03-F24  "Who marks `ready` is a role assignment at layer 2 … The emitted event is IDENTICAL
//           regardless of owner; every surface capable of ready-marking respects the assignment
//           (others render read-only). … an owner's 'order ready' mark simply marks all remaining
//           lines at once. There is no separate order-ready state."
//   03-F17  "An order leaves the queue when all its lines reach a terminal service state."
//   03-F51  "a screen-only station's lines advance when the screen bumps them (03-F19)."
//   02-F31  "no `ready` state is fabricated" — and `03-F26`'s reason for it.
//   01 §4   the canonical chain, and `LEGAL_NEXT`'s encoding of it: `confirmed → ready` is ILLEGAL.
//   01-F31  a fold never picks a winner — a contested line is not this emitter's to decide.
//   01-F35  terminal monotonicity; an ignored event is retained and flagged.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAging } from "@restos/device-config";
import { LEGAL_NEXT } from "@restos/domain";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import { passQueue } from "../pass-queue";
import {
  createReadyMark,
  type LineStateChangedPayload,
  readyEdgesFor,
  walkTo,
} from "../ready-mark";
import { describeReadySignal, resolveReadySignal } from "../ready-signal";

const ORG = "0199aaaa-0000-7000-8000-000000000001";
const BRANCH = "0199aaaa-0000-7000-8000-000000000002";
const DEVICE = "0199aaaa-0000-7000-8000-000000000004";
const ORDER = "0199cccc-0000-7000-8000-00000000abcd";

const dirs: string[] = [];
const freshStore = (): DeviceStore => {
  const dir = mkdtempSync(join(tmpdir(), "ready-mark-"));
  dirs.push(dir);
  return openStore({
    path: join(dir, "device.db"),
    identity: { org_id: ORG, branch_id: BRANCH, device_id: DEVICE },
  });
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

let seq = 0;
const uuid = (): string => `0199dddd-0000-7000-8000-${String(++seq).padStart(12, "0")}`;

const append = (store: DeviceStore, type: string, payload: unknown): void => {
  store.append({
    id: uuid(),
    org_id: ORG,
    branch_id: BRANCH,
    device_id: DEVICE,
    actor_user_id: null,
    device_created_at: 1_000,
    type,
    schema_version: 1,
    payload,
    refs: [],
  });
};

/**
 * A confirmed two-line order in a REAL store, with its lines walked to `at` by the same kind of
 * edge `apps/pos-electron`'s `02-F31` producer writes.
 */
const orderAt = (store: DeviceStore, at: "placed" | "confirmed" | "in_prep"): void => {
  append(store, "order.created", { order_id: ORDER, channel: "counter", order_type: "dine_in" });
  for (const n of [0, 1]) {
    append(store, "order.line_added", {
      order_id: ORDER,
      line_id: `L${n}`,
      item_id: "item-karahi",
      qty: 1,
      unit_price_paisa: 45_000,
    });
  }
  append(store, "order.confirmed", { order_id: ORDER });
  const step = (from: string, to: string): void => {
    append(store, "order.line_state_changed", {
      order_id: ORDER,
      line_ids: ["L0", "L1"],
      state: to,
      line_context: {
        L0: { to, from_states: [from], preds: [] },
        L1: { to, from_states: [from], preds: [] },
      },
    });
  };
  if (at === "placed") return;
  step("placed", "confirmed");
  if (at === "confirmed") return;
  step("confirmed", "in_prep");
};

const statesOf = (store: DeviceStore): Record<string, string[]> => {
  const row = store.openOrders().find((o) => o.order_id === ORDER);
  const cells = JSON.parse(row?.json_lines ?? "{}") as Record<string, { states: string[] }>;
  return Object.fromEntries(Object.entries(cells).map(([id, c]) => [id, c.states]));
};

const anomaliesOf = (store: DeviceStore): Record<string, Record<string, string>> => {
  const row = store.openOrders().find((o) => o.order_id === ORDER);
  const cells = JSON.parse(row?.json_lines ?? "{}") as Record<
    string,
    { anomalies?: Record<string, string> }
  >;
  return Object.fromEntries(Object.entries(cells).map(([id, c]) => [id, c.anomalies ?? {}]));
};

/** The mark, wired to a real store — the same construction `main/index.ts` makes. */
const markOn = (store: DeviceStore, owner?: string) => {
  const emitted: LineStateChangedPayload[] = [];
  const mark = createReadyMark({
    store,
    policy: () => resolveReadySignal(owner),
    // `03-F53` — REQUIRED now that the pass runs a PIN session. A signed-in cook is the
    // precondition for every act in this file; the refusal when nobody is signed in belongs
    // to `pass-identity.test.ts` §E, so a constant here keeps the two suites separate.
    actor: () => "0199bbbb-0000-7000-8000-00000000c001",
    append: (type, payload) => {
      emitted.push(payload);
      append(store, type, payload);
    },
  });
  return { mark, emitted };
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE FINDING THIS MODULE EXISTS FOR: `confirmed → ready` IS ILLEGAL, AND THE LINES ARE
//      AT `confirmed` ON THE BRANCH THIS APP IS FOR.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 01 §4 — the walk", () => {
  it("the kernel really does forbid the jump this module walks around", () => {
    // Asserted rather than asserted-about: if `LEGAL_NEXT` ever gains `confirmed → ready` the walk
    // becomes one hop and this test is what says so, instead of the walk quietly costing an event.
    expect(LEGAL_NEXT.confirmed).not.toContain("ready");
    expect(LEGAL_NEXT.confirmed).toContain("in_prep");
    expect(LEGAL_NEXT.in_prep).toContain("ready");
    // …and the walk is READ off that table rather than hardcoded, so it follows a kernel change.
    expect(walkTo("confirmed", "ready")).toEqual(["in_prep", "ready"]);
    expect(walkTo("in_prep", "ready")).toEqual(["ready"]);
    expect(walkTo("placed", "ready")).toEqual(["confirmed", "in_prep", "ready"]);
    // A terminal has no walk anywhere, and `ready` to itself is not a walk.
    expect(walkTo("served", "ready")).toEqual([]);
    expect(walkTo("ready", "ready")).toEqual([]);
  });

  it("a line at `confirmed` reaches `ready` through the REAL fold, with NO anomaly", () => {
    const store = freshStore();
    orderAt(store, "confirmed");
    expect(statesOf(store)).toEqual({ L0: ["confirmed"], L1: ["confirmed"] });

    const { mark, emitted } = markOn(store);
    const result = mark.mark(ORDER, null);

    expect(result).toEqual({ ok: true, events: 2, lines: 2 });
    // TWO events, in `01 §4`'s chain order — not one jump.
    expect(emitted.map((e) => e.state)).toEqual(["in_prep", "ready"]);
    // Every `from_states` is a state the branch genuinely reaches: the first off the projection,
    // the second because the first edge put it there. NEITHER is a claim about a state that never
    // happened, which is the route `line-advance.ts` names as "still wrong".
    expect(emitted[0]?.line_context.L0?.from_states).toEqual(["confirmed"]);
    expect(emitted[1]?.line_context.L0?.from_states).toEqual(["in_prep"]);

    // ⚠ **AND NOT ONE EVENT CLAIMING `in_prep`.** The dangerous implementation — the one a
    // helpful session writes when it discovers `confirmed → ready` is illegal — is a SINGLE
    // `ready` edge whose `from_states` says `in_prep`: legal on its face, so it works, and a
    // false statement about a state the branch never reached, permanent under `01-F1`.
    // `line-advance.ts` names it first among the routes that are "still wrong".
    expect(emitted).toHaveLength(2);
    expect(emitted.some((e) => e.state === "ready" && emitted.length === 1)).toBe(false);
    // The `in_prep` edge is REAL — it is emitted, so the branch genuinely reaches that state
    // before anything claims to leave it. That is the whole difference between a walk and a lie.
    expect(emitted[0]?.state).toBe("in_prep");
    expect(emitted[0]?.line_context.L0?.to).toBe("in_prep");

    // THE ANCHOR: the real merge engine's own answer, not this module's.
    expect(statesOf(store)).toEqual({ L0: ["ready"], L1: ["ready"] });
    // `preds: []` costs nothing here because `ready` is NON-terminal — `projectLine` takes ≼-max
    // over all legal edges rather than over heads. `line-advance.ts` measured the terminal case
    // costing two `terminal_regression` flags; this is the case where it does not.
    expect(anomaliesOf(store)).toEqual({ L0: {}, L1: {} });
  });

  it("a line already at `in_prep` takes ONE event, not two", () => {
    const store = freshStore();
    orderAt(store, "in_prep");
    const { mark, emitted } = markOn(store);
    expect(mark.mark(ORDER, null)).toEqual({ ok: true, events: 1, lines: 2 });
    expect(emitted.map((e) => e.state)).toEqual(["ready"]);
    expect(statesOf(store)).toEqual({ L0: ["ready"], L1: ["ready"] });
    expect(anomaliesOf(store)).toEqual({ L0: {}, L1: {} });
  });

  it("02-F31/03-F26 — nothing here fabricates `ready` on a line nobody marked", () => {
    // `03-F16` is per LINE as well as whole-order. Marking one line must move exactly that line:
    // an implementation that widened the selection would be inventing a ready-mark, which is the
    // prohibition `03-F26` depends on for the honesty of its sample set.
    const store = freshStore();
    orderAt(store, "in_prep");
    const { mark } = markOn(store);
    expect(mark.mark(ORDER, ["L0"])).toEqual({ ok: true, events: 1, lines: 1 });
    expect(statesOf(store)).toEqual({ L0: ["ready"], L1: ["in_prep"] });
  });

  it("03-F24 — the whole-order tap marks all REMAINING lines and re-marks nothing", () => {
    const store = freshStore();
    orderAt(store, "in_prep");
    const { mark } = markOn(store);
    mark.mark(ORDER, ["L0"]);
    // "an owner's 'order ready' mark simply marks all remaining lines at once" — L0 is already
    // ready, so a second whole-order tap must move L1 and leave L0 alone.
    const { mark: second, emitted } = markOn(store);
    expect(second.mark(ORDER, null)).toEqual({ ok: true, events: 1, lines: 1 });
    expect(Object.keys(emitted[0]?.line_context ?? {})).toEqual(["L1"]);
    expect(statesOf(store)).toEqual({ L0: ["ready"], L1: ["ready"] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — `03-F24`'s ASSIGNMENT, enforced in MAIN. This is the authorization, and it is a refusal.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 03-F24 — ready-signal ownership", () => {
  it("a surface that does not own the signal appends NOTHING", () => {
    const store = freshStore();
    orderAt(store, "in_prep");
    const { mark, emitted } = markOn(store, "counter");
    expect(mark.mark(ORDER, null)).toEqual({
      ok: false,
      reason: "not_the_owner",
      owner: "counter",
    });
    expect(emitted).toEqual([]);
    // The refusal is real: the ledger did not move.
    expect(statesOf(store)).toEqual({ L0: ["in_prep"], L1: ["in_prep"] });
  });

  it("the assignment is enforced on EVERY call, not captured at construction", () => {
    // A value captured when the object was built would freeze this device on whatever was set at
    // boot, and the assignment will one day arrive over a config plane. The getter is the seam.
    const store = freshStore();
    orderAt(store, "in_prep");
    let owner = "counter";
    const mark = createReadyMark({
      store,
      policy: () => resolveReadySignal(owner),
      // `03-F53` — REQUIRED now that the pass runs a PIN session. A signed-in cook is the
      // precondition for every act in this file; the refusal when nobody is signed in belongs
      // to `pass-identity.test.ts` §E, so a constant here keeps the two suites separate.
      actor: () => "0199bbbb-0000-7000-8000-00000000c001",
      append: (type, payload) => append(store, type, payload),
    });
    expect(mark.mark(ORDER, null).ok).toBe(false);
    owner = "pass";
    expect(mark.mark(ORDER, null).ok).toBe(true);
  });

  it("every owner in 03-F24's set is spellable, and anything else falls back permissively", () => {
    for (const owner of ["pass", "kds", "counter", "waiter"]) {
      expect(resolveReadySignal(owner).source).toBe("configured");
      expect(resolveReadySignal(owner).owner).toBe(owner);
    }
    // `01-F17`'s spirit, and the asymmetry with `station-routing.ts` is deliberate: a typo must
    // not leave a kitchen unable to bump a ticket, because a bump that does not happen is silent
    // where a printer that does not answer is loud.
    const refused = resolveReadySignal("passs");
    expect(refused.source).toBe("refused");
    expect(refused.maySignal).toBe(true);
    expect(refused.refused).toBe("passs");
    expect(resolveReadySignal(undefined).source).toBe("default");
    expect(resolveReadySignal(undefined).maySignal).toBe(true);
  });

  it("00 §5.7 — the read-only boot line names the owner AND the correction", () => {
    // Being wrong here looks exactly like being right: a screen assigned elsewhere renders a live
    // queue and simply never bumps. So the line has to carry the value, the consequence and what
    // to do about it, and each is asserted individually so a reword cannot drop one.
    const words = describeReadySignal(resolveReadySignal("counter"));
    expect(words).toContain("counter");
    expect(words).toContain("READ-ONLY");
    expect(words).toContain("RESTOS_READY_SIGNAL_OWNER");
    // …and the DEFAULT line warns that nobody chose it, which is the other half of 00 §5.7.
    expect(describeReadySignal(resolveReadySignal(undefined))).toContain("NOT CONFIGURED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — WHAT IT REFUSES TO DECIDE. `01-F31`, and the orders that are not there to mark.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C — the refusals", () => {
  it("01-F31 — a CONTESTED line is left alone, never laundered into a decision", () => {
    // Two terminal edges from one state: `merge.ts` renders the full MVR set and refuses to pick.
    // An emitter that picked one would make a disputed line decided, permanently under `01-F1`.
    const store = freshStore();
    orderAt(store, "in_prep");
    for (const to of ["voided", "cancelled"]) {
      append(store, "order.line_state_changed", {
        order_id: ORDER,
        line_ids: ["L0"],
        state: to,
        line_context: { L0: { to, from_states: ["in_prep"], preds: [] } },
      });
    }
    expect(statesOf(store).L0?.length).toBeGreaterThan(1);

    const { mark } = markOn(store);
    expect(mark.mark(ORDER, ["L0"])).toEqual({ ok: false, reason: "nothing_to_mark" });
    // …and the whole-order tap still moves the line that is NOT contested, which is what stops
    // this refusal turning into a screen that cannot bump anything.
    expect(mark.mark(ORDER, null)).toEqual({ ok: true, events: 1, lines: 1 });
    expect(statesOf(store).L1).toEqual(["ready"]);
  });

  it("an order this device does not hold is a no-op, never a throw", () => {
    const store = freshStore();
    const { mark, emitted } = markOn(store);
    expect(mark.mark("no-such-order", null)).toEqual({ ok: false, reason: "nothing_to_mark" });
    expect(emitted).toEqual([]);
  });

  it("a fully-ready order produces no event — `03-F16` is not an append button", () => {
    const store = freshStore();
    orderAt(store, "in_prep");
    const { mark } = markOn(store);
    mark.mark(ORDER, null);
    expect(mark.mark(ORDER, null)).toEqual({ ok: false, reason: "nothing_to_mark" });
  });

  it("01-F31 — a DIRECTED contested cell whose first member WOULD advance is still refused", () => {
    // ⚠ **THIS FIXTURE EXISTS BECAUSE THE MUTANT ABOVE SURVIVED.** The arity guard
    // (`states.length !== 1`) is MASKED by the done-check for every contested cell `merge.ts` can
    // actually produce: a contested cell is always all-TERMINAL, so relaxing the guard to take
    // `states[0]` still hits `KITCHEN_DONE` and still refuses. The store-driven test in this
    // section therefore could not tell the guard from its absence — the same masking
    // `apps/pos-electron`'s M8 row records one module over.
    //
    // A multi-state cell whose FIRST member would advance legally is not something the fold emits
    // today, and that is exactly why it has to be built by hand: the guard has to hold if the fold
    // ever renders one, and `01-F31`'s rule — *"a fold never picks a winner"* — is about the
    // emitter not picking one either.
    const contested = {
      A: { item_id: "i", qty: 1, unit_price_paisa: 1, states: ["in_prep", "ready"] },
    };
    expect(readyEdgesFor({ order_id: ORDER, json_lines: JSON.stringify(contested) }, null)).toEqual(
      [],
    );
  });

  it("readyEdgesFor is pure — it decides from a projection and needs no store", () => {
    const cells = {
      A: { item_id: "i", qty: 1, unit_price_paisa: 1, states: ["in_prep"] },
      B: { item_id: "i", qty: 1, unit_price_paisa: 1, states: ["served"] },
      C: { item_id: "i", qty: 1, unit_price_paisa: 1, states: ["ready"] },
    };
    const events = readyEdgesFor({ order_id: ORDER, json_lines: JSON.stringify(cells) }, null);
    // Only A moves: B is terminal and C is already there.
    expect(events).toHaveLength(1);
    expect(Object.keys(events[0]?.line_context ?? {})).toEqual(["A"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — `03-F17`: the order LEAVES the queue, and the honest gap under it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 03-F17 — leaving the queue", () => {
  const queue = (store: DeviceStore) =>
    passQueue({
      store,
      name: (id) => id,
      aging: resolveAging(undefined),
      now: () => 60_000,
    });

  it("a ready order STAYS — and that is the FR, not a defect", () => {
    // `03-F17` names a TERMINAL SERVICE state, and `ready` is not one. Nothing on a T2 branch
    // emits `served` today (`02-F31`'s settlement half is tier-gated to T1, `02-F33` and doc 04
    // are unbuilt), so a fully-ready ticket stays on the pass until it is served or voided. That
    // is stated in `pass-queue.ts` as an OWED gap; this pins the behaviour so the gap cannot be
    // "fixed" by inventing a handover the kitchen never observed.
    const store = freshStore();
    orderAt(store, "in_prep");
    markOn(store).mark.mark(ORDER, null);
    expect(queue(store)).toHaveLength(1);
    expect(queue(store)[0]?.linesDone).toBe(2);
    expect(queue(store)[0]?.bumpable).toBe(false);
  });

  it("an order whose every line is SERVED is off the pass", () => {
    const store = freshStore();
    orderAt(store, "in_prep");
    append(store, "order.line_state_changed", {
      order_id: ORDER,
      line_ids: ["L0", "L1"],
      state: "served",
      line_context: {
        L0: { to: "served", from_states: ["in_prep"], preds: [] },
        L1: { to: "served", from_states: ["in_prep"], preds: [] },
      },
    });
    expect(queue(store)).toEqual([]);
  });

  it("a PARTLY served order stays, because the rest is still food to cook", () => {
    const store = freshStore();
    orderAt(store, "in_prep");
    append(store, "order.line_state_changed", {
      order_id: ORDER,
      line_ids: ["L0"],
      state: "served",
      line_context: { L0: { to: "served", from_states: ["in_prep"], preds: [] } },
    });
    expect(queue(store)).toHaveLength(1);
    expect(queue(store)[0]?.lines.find((l) => l.line_id === "L1")?.state).toBe("in_prep");
  });

  it("a wholly VOIDED order is off the pass — the reading stated in `KITCHEN_DONE`", () => {
    // `03-F17` names `served`/`picked_up`; `voided` and `cancelled` are added, because a voided
    // line is not food anyone is cooking and leaving it on the pass puts work on the screen that
    // does not exist.
    const store = freshStore();
    orderAt(store, "in_prep");
    append(store, "order.line_state_changed", {
      order_id: ORDER,
      line_ids: ["L0", "L1"],
      state: "voided",
      line_context: {
        L0: { to: "voided", from_states: ["in_prep"], preds: [] },
        L1: { to: "voided", from_states: ["in_prep"], preds: [] },
      },
    });
    expect(queue(store)).toEqual([]);
  });
});
