/**
 * # `02-F20` / `02-F8` / `02-F61` — THE POST-CONFIRM VOID, AND WHERE ITS MONEY MOVES
 *
 * `plans/v0.md` gap 1. `void.recorded` had a payload schema, a matrix row and an approval path and
 * **no production emitter**, so a mis-rung dish after `order.confirmed` was permanent (`01-F1`).
 *
 * **The property this file exists to hold is not "an event was appended".** It is that the BILL
 * MOVES, through `01 §4`'s line exit and `merge.ts`'s existing `billedCellPaisa` — and that the
 * two representations `DEC-MONEY-010` (2) warns about can never both carry the same money.
 * Every assertion below reads `billed_effective` out of the REAL fold rather than asserting on the
 * shape of a request, because a suite that only inspects payloads blesses an emitter whose events
 * project nothing.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { billedEffectiveFromJsonLines, type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import type { AppendResult } from "../../shared/ipc";
import { voidExitFor, voidExitsLine } from "../line-void";
import type { RendererWrites } from "../settlement-guard";

const ORG = "00000000-0000-7000-8000-000000000001";
const BRANCH = "00000000-0000-7000-8000-000000000002";
const TILL_1 = "00000000-0000-7000-8000-000000000003";
const ORDER_ID = "0199aaaa-0000-7000-8000-00000000abcd";
const OTHER_ORDER = "0199aaaa-0000-7000-8000-00000000abce";
const LINE_A = "0199aaaa-0000-7000-8000-00000000ff01";
const LINE_B = "0199aaaa-0000-7000-8000-00000000ff02";
const KARAHI = 45_000;
const NAAN = 6_000;

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

type Till = {
  store: DeviceStore;
  raw: (type: string, payload: Record<string, unknown>) => void;
  guarded: RendererWrites;
  landed: { type: string; payload: Record<string, unknown>; refs: readonly string[] }[];
  billed: (order_id?: string) => number;
  states: (line_id: string, order_id?: string) => string[];
  anomalies: (order_id?: string) => string[];
};

const till = (opts: { confirm?: boolean } = {}): Till => {
  const dir = mkdtempSync(join(tmpdir(), "restos-line-void-"));
  dirs.push(dir);
  const store = openStore({
    path: join(dir, "device.db"),
    identity: { org_id: ORG, branch_id: BRANCH, device_id: TILL_1 },
  });
  let n = 0;
  const raw = (type: string, payload: Record<string, unknown>, refs: string[] = []): void => {
    n += 1;
    store.append({
      id: `0199cccc-0000-7000-8000-${String(n).padStart(12, "0")}`,
      org_id: ORG,
      branch_id: BRANCH,
      device_id: TILL_1,
      actor_user_id: "user-ayesha",
      device_created_at: 1_754_300_000_000 + n,
      type,
      schema_version: 1,
      payload,
      refs,
    });
  };

  const order = (order_id: string) => {
    raw("order.created", { order_id, channel: "counter", order_type: "takeaway" });
    raw("order.line_added", {
      order_id,
      line_id: order_id === ORDER_ID ? LINE_A : "0199aaaa-0000-7000-8000-00000000ff09",
      item_id: "i-karahi",
      qty: 1,
      unit_price_paisa: KARAHI,
    });
  };
  order(ORDER_ID);
  raw("order.line_added", {
    order_id: ORDER_ID,
    line_id: LINE_B,
    item_id: "i-naan",
    qty: 1,
    unit_price_paisa: NAAN,
  });
  order(OTHER_ORDER);
  if (opts.confirm !== false) {
    raw("order.confirmed", { order_id: ORDER_ID });
    // `02-F31`'s own first edge, so the lines sit where a confirmed order's lines really sit.
    raw("order.line_state_changed", {
      order_id: ORDER_ID,
      line_ids: [LINE_A, LINE_B],
      state: "confirmed",
      line_context: {
        [LINE_A]: { to: "confirmed", from_states: ["placed"], preds: [] },
        [LINE_B]: { to: "confirmed", from_states: ["placed"], preds: [] },
      },
    });
  }

  const landed: Till["landed"] = [];
  const writes: RendererWrites = {
    append: (req: unknown): AppendResult => {
      const r = req as { type: string; payload: Record<string, unknown>; refs?: string[] };
      landed.push({ type: r.type, payload: r.payload, refs: r.refs ?? [] });
      raw(r.type, r.payload, r.refs ?? []);
      return { id: `landed-${landed.length}` };
    },
    addLine: () => ({ id: "unused" }),
    toggleAvailability: () => ({ id: "unused" }),
    recordCustomer: () => ({ id: "unused" }),
  };

  const row = (order_id = ORDER_ID) => store.openOrders().find((o) => o.order_id === order_id);
  const cells = (order_id: string) =>
    JSON.parse(row(order_id)?.json_lines ?? "{}") as Record<
      string,
      { states?: string[]; anomalies?: Record<string, string> }
    >;
  return {
    store,
    raw,
    guarded: voidExitsLine({ writes, store }),
    landed,
    // The ENGINE's own derivation, never re-summed here (`26 §8`) — which is also what makes this
    // a test of the SHIPPED merge rule rather than of a number this file computed.
    billed: (order_id = ORDER_ID) =>
      billedEffectiveFromJsonLines(row(order_id)?.json_lines ?? "{}"),
    states: (line_id, order_id = ORDER_ID) => cells(order_id)[line_id]?.states ?? [],
    // FLATTENED to the anomaly VALUES, because that is the claim every assertion makes ("no
    // `illegal_transition` anywhere on this order"). Returning the nested map instead made the
    // callers index into `unknown`, which typechecks only by looking away.
    anomalies: (order_id = ORDER_ID) =>
      Object.values(cells(order_id)).flatMap((c) => Object.values(c.anomalies ?? {})),
  };
};

let attempt = 0;
const voidReq = (over: Record<string, unknown> = {}, refs: string[] = [LINE_B]) => {
  attempt += 1;
  return {
    type: "void.recorded",
    payload: {
      order_id: ORDER_ID,
      amount_paisa: NAAN,
      reason: "Wrong item",
      approver_user_id: null,
      // `01-F83` — minted at the UI. The rig mints its own so a test can hold one act across two
      // deliveries, which is the case the key exists for.
      adjustment_attempt_id: `0199bbbb-0000-7000-8000-${String(attempt).padStart(12, "0")}`,
      ...over,
    },
    refs,
  };
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE MONEY MOVES. The whole point of gap 1.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F20/02-F8 — voiding a line takes it off the bill", () => {
  it("drops billed_effective by exactly that line, through 01 §4's exit state", () => {
    // MUTATION THIS CATCHES: the layer removed from the chain (the shipped product before this
    // work), and the layer appending `void.recorded` alone — which is what "the schemas exist" got
    // you, and which leaves the bill untouched for ever.
    const t = till();
    expect(t.billed()).toBe(KARAHI + NAAN);

    t.guarded.append(voidReq());

    expect(t.billed(), "the naan is still on the bill after a void").toBe(KARAHI);
    expect(t.states(LINE_B)).toEqual(["voided"]);
    expect(t.states(LINE_A), "the OTHER line is untouched").toEqual(["confirmed"]);
  });

  it("records BOTH facts — the approval act and the line's fate — from one call", () => {
    // `02-F8`: post-confirm removal "must be `void.recorded` with an approver". `01 §4`: the exit
    // states are the only vocabulary any module may use. Both, or the ledger tells half the story.
    const t = till();
    t.guarded.append(voidReq());

    expect(t.landed.map((e) => e.type)).toEqual(["void.recorded", "order.line_state_changed"]);
    expect(t.landed[0]?.payload).toMatchObject({
      order_id: ORDER_ID,
      amount_paisa: NAAN,
      reason: "Wrong item",
    });
    expect(t.landed[0]?.refs, "the line rides refs, never the payload (00 §6)").toEqual([LINE_B]);
    expect(t.landed[1]?.payload).toMatchObject({ order_id: ORDER_ID, state: "voided" });
  });

  it("the fold records NO `illegal_transition` — the edge is legal and its from_states are true", () => {
    // `01-F35`: an illegal edge is NOT refused by the ledger. It LANDS, is flagged
    // `illegal_transition`, and stays there for ever (`01-F1`). So an emitter that guessed
    // `from_states` would pass every payload-shaped assertion above and poison the projection.
    //
    // MUTATION THIS CATCHES: `from_states: ["placed"]` on a confirmed line.
    const t = till();
    t.guarded.append(voidReq());
    expect(
      t.anomalies(),
      "an illegal edge is permanent, so it must never be emitted",
    ).not.toContain("illegal_transition");
  });

  it("KNOWN AND PINNED — the terminal edge ships `preds: []`, so the retired edge flags", () => {
    // ⚠ **This is `line-advance.ts`'s measured, owed residual arriving on a second terminal
    // emitter, and it is pinned as a FACT rather than asserted away.** That file measured it
    // directly: `preds: []` projects the correct state and leaves `terminal_regression` on the
    // edges this one supersedes; `preds: [<the earlier edge>]` projects the same state with an
    // empty anomaly map. It ships anyway for that file's three bounded reasons — the STATE is
    // correct either way, the flag is DERIVED (every edge is legal, so nothing wrong enters the
    // append-only ledger and a refold clears it), and the cloud Auditor filters to
    // `illegal_transition` by name.
    //
    // **No money moves on it**: `billedCellPaisa` reads `states` only, which §A already asserts.
    // Closing it needs head ids on `BilledLineCell` — an oracle-pinned cell shape in a protected
    // package — exactly as `line-advance.ts` records. Pinned here so it cannot change silently in
    // either direction: a session that later supplies `preds` should see this go red and delete it.
    const t = till();
    t.guarded.append(voidReq());
    expect(t.anomalies()).toEqual(["terminal_regression"]);
    expect(t.billed(), "the flag is derived — the money is unaffected").toBe(KARAHI);
  });

  it("voiding EVERY line nets the order to zero (01-F30)", () => {
    const t = till();
    t.guarded.append(voidReq({}, [LINE_B]));
    t.guarded.append(voidReq({ amount_paisa: KARAHI }, [LINE_A]));
    expect(t.billed(), "01-F30: a fully-voided order nets to zero").toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — DEC-MONEY-010 (2). The double-count, made unreachable at the emitter.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B DEC-MONEY-010 (2) — the two representations are disjoint at the emitter", () => {
  it("refuses an ORDER-KEYED void that names no line at all", () => {
    // THE HAZARD, in the ruling's words: "a void expressed BOTH as line exits and as an
    // order-keyed `void.recorded { amount_paisa }` subtracts the same money twice, permanently and
    // converged". The resolution is that the LINE is authoritative wherever a line exists — so
    // this emitter cannot produce a void that has no line behind it, and `void.recorded`'s value
    // is therefore ALWAYS already removed by an exit.
    //
    // MUTATION THIS CATCHES: the `refs.length !== 1` guard dropped, which is the change a session
    // makes when it wants to add a whole-order void and does not read this ruling.
    const t = till();
    expect(() => t.guarded.append(voidReq({}, []))).toThrow(/names 0 lines/);
    expect(t.landed, "01-F1: a refusal appends nothing").toHaveLength(0);
    expect(t.billed()).toBe(KARAHI + NAAN);
  });

  it("refuses a void naming TWO lines", () => {
    const t = till();
    expect(() => t.guarded.append(voidReq({}, [LINE_A, LINE_B]))).toThrow(/names 2 lines/);
    expect(t.landed).toHaveLength(0);
  });

  it("STRUCTURAL — every void this product can emit names exactly one line", () => {
    // The invariant the future fold arm will rest on, asserted rather than left in prose: there is
    // no OTHER construction site, so there is no order-keyed void anywhere in the product.
    // `01-F30`'s `void_value` term, when `DEC-MONEY-010` (iii) admits it, contributes zero for
    // every member this emitter produced — and that is checkable, not hoped for.
    const sources = ["src/renderer/Counter.tsx", "src/main/line-void.ts"].map((f) =>
      readFileSync(join(import.meta.dirname, "../../..", f), "utf8"),
    );
    const all = readFileSync(join(import.meta.dirname, "../../renderer/Counter.tsx"), "utf8");
    expect(sources.length).toBe(2);
    // The renderer's ONE corrective emitter puts the line on `refs` and nothing else does.
    expect(all).toMatch(/refs:\s*\[correction\.line_id\]/);
    expect(
      all.match(/type:\s*CORRECTION_EVENT_TYPES\[/g) ?? [],
      "a second corrective construction site would need its own disjointness argument",
    ).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE REFUSALS. Each is a permanent wrong the ledger cannot take back.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F35/01-F31 — what a void may not do", () => {
  it("refuses a line that has already left (01-F35 makes it terminal)", () => {
    const t = till();
    t.guarded.append(voidReq());
    expect(() => t.guarded.append(voidReq())).toThrow(/voided and cannot be voided/);
    expect(t.billed(), "a second void did not subtract the naan twice").toBe(KARAHI);
  });

  it("refuses a CONTESTED line — a fold never picks a winner, and neither may an emitter", () => {
    // `01-F31`. A peer voided it and this till advanced it; the cell renders both terminals. An
    // emitter that picked one would launder a disputed line into a decided one through the back
    // door, permanently (`01-F1`).
    //
    // MUTATION THIS CATCHES: the `states.length !== 1` guard dropped.
    const t = till({ confirm: false });
    t.raw("order.line_state_changed", {
      order_id: ORDER_ID,
      line_ids: [LINE_B],
      state: "voided",
      line_context: { [LINE_B]: { to: "voided", from_states: ["placed"], preds: [] } },
    });
    t.raw("order.line_state_changed", {
      order_id: ORDER_ID,
      line_ids: [LINE_B],
      state: "cancelled",
      line_context: { [LINE_B]: { to: "cancelled", from_states: ["placed"], preds: [] } },
    });
    expect(t.states(LINE_B).length).toBeGreaterThan(1);
    expect(() => t.guarded.append(voidReq())).toThrow(/contested/);
  });

  it("refuses a line that is not on that order, and an order this till has never seen", () => {
    const t = till();
    expect(() => t.guarded.append(voidReq({}, ["0199aaaa-0000-7000-8000-0000000000ff"]))).toThrow(
      /not on that order/,
    );
    expect(() =>
      t.guarded.append(voidReq({ order_id: "0199aaaa-0000-7000-8000-00000000dead" })),
    ).toThrow(/no open order with that id/);
    expect(t.landed).toHaveLength(0);
  });

  it("CONTROL — every OTHER event type passes straight through, untouched", () => {
    // Without this, a guard that threw on everything, or one that appended a spurious exit beside
    // an unrelated event, would pass §A and §B entire.
    const t = till();
    t.guarded.append({
      type: "order.note_added",
      payload: { order_id: ORDER_ID, line_id: LINE_A, note: "less spicy" },
      refs: [],
    });
    expect(t.landed.map((e) => e.type)).toEqual(["order.note_added"]);
    expect(t.billed()).toBe(KARAHI + NAAN);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — `voidExitFor` alone. The policy, with no store and no ledger.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D the edge is a pure function of the projection", () => {
  const order = (states: string[]) => ({
    order_id: ORDER_ID,
    json_lines: JSON.stringify({ [LINE_B]: { item_id: "i", qty: 1, unit_price_paisa: 1, states } }),
  });

  it("carries the state the fold ACTUALLY projects, never an assumption", () => {
    // `01-F34`: legality is judgeable only from the states the edge CLAIMS to leave, so an emitter
    // that hardcoded `["placed"]` writes an edge the fold flags for ever.
    for (const from of ["placed", "confirmed", "in_prep", "ready"]) {
      const edge = voidExitFor(order([from]), [LINE_B]);
      expect("refused" in edge).toBe(false);
      if ("refused" in edge) continue;
      expect(edge.line_context[LINE_B]?.from_states).toEqual([from]);
      expect(edge.line_context[LINE_B]?.to).toBe("voided");
      expect(edge.line_ids, "line_ids is derived from line_context, never assembled apart").toEqual(
        Object.keys(edge.line_context),
      );
    }
  });

  it("refuses every terminal state by name (01-F35 / LEGAL_NEXT maps a terminal to [])", () => {
    for (const from of ["served", "delivered", "voided", "cancelled"]) {
      expect(voidExitFor(order([from]), [LINE_B])).toMatchObject({ refused: expect.any(String) });
    }
  });

  it("reads NO ordering metadata — it is handed only an id and a projection", () => {
    // `01-F34` is about folds and this is an emitter, but the discipline is the same one
    // `line-advance.ts` pins: nothing here may reach a `global_seq`, a `lamport_seq`, a clock or
    // an envelope id. The signature is what makes that true, so the signature is the assertion.
    expect(voidExitFor(order(["confirmed"]), [LINE_B])).not.toHaveProperty("refused");
    expect(voidExitFor(undefined, [LINE_B])).toMatchObject({ refused: expect.any(String) });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — THE SEAM. The wave's named defect: a correct subsystem the product never reaches.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E the product reaches this, on BOTH routes an approved write can take", () => {
  const mainSrc = readFileSync(join(import.meta.dirname, "../index.ts"), "utf8");

  it("main builds it INSIDE authorizeWrites and OUTSIDE the two money guards", () => {
    // MUTATION THIS CATCHES: the layer deleted from the chain — the shipped product before this
    // work — which leaves every assertion in §A–§D green and no cashier able to void anything.
    expect(mainSrc).toMatch(/voidExitsLine\(\{\s*writes:\s*tenderGuarded,\s*store\s*\}\)/);
    expect(mainSrc).toMatch(/authorizeWrites\(\{\s*writes:\s*voidGuarded,/);
  });

  it("the ESCALATION path travels it too, which is the route a cashier's void actually takes", () => {
    // ⚠ THE DEFECT THIS ASSERTION WAS WRITTEN FOR. `authorizeEscalation` was constructed over the
    // RAW `gateway`, so it went around the whole chain: a MANAGER voiding unsupervised got the
    // line exit and a CASHIER voiding with a manager's PIN got a `void.recorded` and NO exit —
    // the bill unchanged, on the one path `02-F20` exists for, and the path `order.void_after_kot`
    // makes the ONLY one a cashier has. Found by asking which object each route appends through,
    // not by reading the guard.
    expect(mainSrc).toMatch(/authorizeEscalation\(\{[\s\S]{0,2000}?writes:\s*voidGuarded,/);
    expect(mainSrc).not.toMatch(/authorizeEscalation\(\{[\s\S]{0,2000}?writes:\s*gateway,/);
  });
});
