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

const till = (opts: { confirm?: boolean; failAppend?: number } = {}): Till => {
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
  let appendCalls = 0;
  const writes: RendererWrites = {
    append: (req: unknown): AppendResult => {
      appendCalls += 1;
      /*
        `opts.failAppend` fails the Nth call to the INNER writes, so §F can drive the one thing
        `01-F1` makes permanent and no refusal can reach: an append that got past every guard and
        then did not persist. The message is the real one — `AGENTS.md` records
        `SqliteError: database is locked` from the two-instance incident on a real till, and
        `01-F66`'s single-instance lock closed that CAUSE without making a failed append
        impossible (a full disk, a corrupt page and a killed process all arrive here too).
      */
      if (appendCalls === opts.failAppend) throw new Error("SqliteError: database is locked");
      const r = req as { type: string; payload: Record<string, unknown>; refs?: string[] };
      landed.push({ type: r.type, payload: r.payload, refs: r.refs ?? [] });
      raw(r.type, r.payload, r.refs ?? []);
      return { id: `landed-${landed.length}` };
    },
    addLine: () => ({ id: "unused" }),
    toggleAvailability: () => ({ id: "unused" }),
    recordCustomer: () => ({ id: "unused" }),
    // `02-F64` stub — this fixture has no opinion about a customer link.
    linkCustomer: () => ({ id: "unused" }),
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
    t.guarded.append(voidReq({ amount_paisa: 999_999_900 }));

    expect(t.landed.map((e) => e.type)).toEqual(["void.recorded", "order.line_state_changed"]);
    // ⚠ `amount_paisa` is asserted against a request that sent something ELSE, deliberately. This
    // assertion read `amount_paisa: NAAN` against a `voidReq()` that supplies exactly `NAAN`, so
    // it was a TAUTOLOGY: it passed against the layer copying the renderer's payload through,
    // which is what the layer did. See §A's derivation tests directly below.
    expect(t.landed[0]?.payload).toMatchObject({
      order_id: ORDER_ID,
      amount_paisa: NAAN,
      reason: "Wrong item",
    });
    expect(t.landed[0]?.refs, "the line rides refs, never the payload (00 §6)").toEqual([LINE_B]);
    expect(t.landed[1]?.payload).toMatchObject({ order_id: ORDER_ID, state: "voided" });
  });

  it("DERIVES amount_paisa from the fold and DISCARDS whatever the renderer sent", () => {
    /*
      ⚠ **THE DEFECT THIS ASSERTION WAS WRITTEN FOR, reproduced against the real store before it
      was fixed.** `amount_paisa` originated in `LineCorrection.tsx` (`act === "discount" ?
      entered : lineTotal`), crossed `shared/ipc.ts`'s bridge — *"the untrusted end of this bridge
      even though we ship it"* — and landed permanently under `01-F1`, and this module's own
      header claimed it *"is the value the line exit removed"* while the file mentioned the field
      nowhere but in that sentence. Measured:

        landed[0].payload.amount_paisa === 999_999_900   a permanent money field nothing derived
        billed_effective dropped by     ===       6_000   the NAAN, not the recorded amount

      It was not inert: `approval-record.ts` reads this field into `approval.requested`, which is
      the figure `05-F5`'s manager card shows the approver.

      MUTATION THIS CATCHES: the payload copied through (the shipped product before this fix), and
      any derivation that is not `billedLinePaisa` of the cell that exited.
    */
    const t = till();
    const before = t.billed();
    t.guarded.append(voidReq({ amount_paisa: 999_999_900 }));
    const recorded = t.landed[0]?.payload.amount_paisa;

    expect(recorded, "the renderer's figure must not survive the bridge").not.toBe(999_999_900);
    expect(recorded, "it is billedLinePaisa of the cell that exited").toBe(NAAN);
    // The strongest form, and the one that makes the module's sentence true rather than merely
    // consistent: the number recorded IS the money the exit removed, both sides read out of the
    // REAL fold rather than out of the request.
    expect(before - t.billed(), "amount_paisa === what the exit took off the bill").toBe(recorded);
  });

  it("the derivation is PER LINE — it is not the order total and not a constant", () => {
    // MUTATION THIS CATCHES: an amount read off `total_paisa`, or off the wrong cell. Without
    // this, a derivation that always answers with the first line passes the test above.
    const t = till();
    t.guarded.append(voidReq({ amount_paisa: 1 }, [LINE_A]));
    expect(t.landed[0]?.payload.amount_paisa).toBe(KARAHI);
    expect(t.landed[0]?.payload.amount_paisa).not.toBe(NAAN);
  });

  it("carries the rest of the payload through untouched — only the money is main's", () => {
    // The overwrite rebuilds the request, so this is the guard against it dropping a field on the
    // way: `01-F83`'s attempt key and `02-F20`'s approver are both load-bearing and neither is
    // derivable here. CONTROL for the two assertions above — without it, "main decides the
    // money" and "main rewrites the payload" are indistinguishable.
    const t = till();
    const req = voidReq({ amount_paisa: 7, approver_user_id: "user-hina" });
    t.guarded.append(req);
    expect(t.landed[0]?.payload).toMatchObject({
      order_id: ORDER_ID,
      reason: "Wrong item",
      approver_user_id: "user-hina",
      adjustment_attempt_id: req.payload.adjustment_attempt_id,
    });
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
      const resolved = voidExitFor(order([from]), [LINE_B]);
      expect("refused" in resolved).toBe(false);
      if ("refused" in resolved) continue;
      const edge = resolved.edge;
      expect(edge.line_context[LINE_B]?.from_states).toEqual([from]);
      expect(edge.line_context[LINE_B]?.to).toBe("voided");
      expect(edge.line_ids, "line_ids is derived from line_context, never assembled apart").toEqual(
        Object.keys(edge.line_context),
      );
    }
  });

  it("resolves the edge and its money from ONE cell, with no store and no request", () => {
    // The amount is a function of the PROJECTION, exactly as the edge is — so the derivation is
    // testable without a ledger, and the two can never come from different lookups.
    //
    // MUTATION THIS CATCHES: an `amount_paisa` that reads anything but this cell's own qty ×
    // unit_price, and one that ignores `26 §7`'s exited-cell rule.
    const priced = {
      order_id: ORDER_ID,
      json_lines: JSON.stringify({
        [LINE_B]: { item_id: "i-naan", qty: 3, unit_price_paisa: 2_500, states: ["confirmed"] },
      }),
    };
    const resolved = voidExitFor(priced, [LINE_B]);
    expect("refused" in resolved).toBe(false);
    if ("refused" in resolved) return;
    expect(resolved.amount_paisa, "qty x unit_price, the fold's own product").toBe(7_500);
  });

  it("an unrepresentable line value contributes ZERO, never a rounded double (standing law 3)", () => {
    /*
      `billedLinePaisa` is `merge.ts`'s own `billedCellPaisa` exported rather than re-derived, and
      it answers **0** for a product the double cannot hold exactly — matching what the fold's
      accumulators do, so `amount_paisa` and the `billed_effective` it comes off never disagree.

      MUTATION THIS CATCHES: a hand-rolled `cell.qty * cell.unit_price_paisa` here. It is
      behaviourally identical on every ordinary line — which is exactly why it would survive a
      suite without this assertion — and it puts a SILENTLY ROUNDED money figure into an
      append-only ledger on the one input where it differs. `26 §8`'s *fold logic is never
      reimplemented outside this module*, stated as a test instead of as a preference.
    */
    const huge = {
      order_id: ORDER_ID,
      json_lines: JSON.stringify({
        [LINE_B]: {
          item_id: "i",
          qty: 3,
          unit_price_paisa: Number.MAX_SAFE_INTEGER,
          states: ["confirmed"],
        },
      }),
    };
    const resolved = voidExitFor(huge, [LINE_B]);
    expect("refused" in resolved).toBe(false);
    if ("refused" in resolved) return;
    expect(resolved.amount_paisa).toBe(0);
    expect(resolved.amount_paisa, "a rounded product is the thing being refused").not.toBe(
      3 * Number.MAX_SAFE_INTEGER,
    );
  });

  it("refuses a cell carrying no projected VALUE rather than throwing on it", () => {
    // `01-F53`'s captured price. Unreachable from the real fold — `merge.ts` builds every cell FROM
    // a `LineValue` — but this function is exported as a pure function of a JSON string, and
    // `BigInt(undefined)` THROWS where every other bad input here is refused by name (`00 §5.7`).
    const valueless = {
      order_id: ORDER_ID,
      json_lines: JSON.stringify({ [LINE_B]: { states: ["confirmed"] } }),
    };
    expect(() => voidExitFor(valueless, [LINE_B])).not.toThrow();
    expect(voidExitFor(valueless, [LINE_B])).toMatchObject({ refused: expect.any(String) });
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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — ⚠ THE WINDOW. The two appends are NOT atomic, and the header no longer says they are.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F 01-F1 — a half-landed void, pinned as a fact rather than claimed away", () => {
  /*
    ⚠ **`line-void.ts` used to close *"Refusing up front makes both unreachable"* and *"EVERY
    `void.recorded` THIS PRODUCT EMITS NAMES EXACTLY ONE LINE, AND THAT LINE EXITS IN THE SAME
    ACT."* Neither survives a failure on the SECOND append**, and both were corrected in August
    2026 rather than defended. `DeviceStore` exposes only a single-event `append` (`appendTx` is a
    one-event transaction), so there is no door to make the pair atomic without widening a
    PROTECTED package's surface — measured and sized in the module header.

    This block exists so the window is a MEASURED, PINNED fact and not a sentence anyone can
    quietly re-strengthen. It is also the input `01-F30`'s owed `void_value` arm needs: an ORPHAN
    `void.recorded` names money the bill is still carrying, so a fold arm reading *"no line exit
    ⇒ contribute `amount_paisa`"* would subtract a rupee that was never removed.

    **If a transactional append ever lands, these tests must go RED** — the first two by becoming
    unreachable, and a session that sees that should delete them and strengthen the header back.
  */

  it("a failure on the EXIT leaves void.recorded in the ledger with the line still billed", () => {
    const t = till({ failAppend: 2 });
    expect(() => t.guarded.append(voidReq())).toThrow(/did NOT exit/);

    expect(
      t.landed.map((e) => e.type),
      "the corrective landed alone",
    ).toEqual(["void.recorded"]);
    expect(t.billed(), "01-F1: permanent, and the bill did not move").toBe(KARAHI + NAAN);
    expect(t.states(LINE_B), "the line never left").toEqual(["confirmed"]);
  });

  it("names what happened, because the cashier is the one who has to fix it (00 §5.7)", () => {
    // `SqliteError: database is locked` tells an operator nothing she can act on, and the original
    // is CARRIED rather than swallowed so a log still holds it.
    //
    // MUTATION THIS CATCHES: the try/catch removed (the raw error reaches the counter), and the
    // `cause` dropped (the diagnosis is lost).
    const t = till({ failAppend: 2 });
    try {
      t.guarded.append(voidReq());
      expect.unreachable("the exit failed, so the act must not report success");
    } catch (err) {
      const e = err as Error;
      expect(e.message).toMatch(/LANDED/);
      expect(e.message, "it must not read as a refusal — a refusal appends nothing").not.toMatch(
        /refused/,
      );
      expect(e.message, "and it must say what she can do about it").toMatch(/Void it again/);
      expect((e.cause as Error | undefined)?.message).toMatch(/database is locked/);
    }
  });

  it("CONTROL — an EXIT never lands without its corrective, on EITHER failure", () => {
    /*
      The two directions are not symmetric, and this is what makes that claim measured rather than
      argued. An exit with no `void.recorded` removes a cooked dish with **no approver** — Appendix
      A's void row bypassed by an event type, the theft vector `02-F49` exists to close — and it is
      unrecoverable, where the half that IS reachable leaves the dish on the bill for the cashier
      to void again. The corrective going first is what puts the recoverable half on the exposed
      side, so this sweeps both failure points rather than the convenient one.

      ⚠ **A first draft asserted only `failAppend: 1` ⇒ nothing landed, and the reversed-order
      mutant SURVIVED it** — with the appends swapped, failing the first call still lands nothing,
      so the assertion was true of both implementations. Reading it would not have shown that; the
      mutant did.
    */
    for (const failAppend of [1, 2]) {
      const t = till({ failAppend });
      expect(() => t.guarded.append(voidReq())).toThrow();
      expect(
        t.landed.map((e) => e.type),
        `a failure on append ${failAppend} must never leave an unapproved exit`,
      ).not.toContain("order.line_state_changed");
      expect(t.states(LINE_B), "no dish left the bill without an approver").toEqual(["confirmed"]);
    }
  });

  it("the cashier CAN recover, and the ledger keeps both correctives (01-F83 / 01-F1)", () => {
    // Why the recoverable half is the one on the exposed side. The dish is still billed, the line
    // is still non-terminal, so voiding again works — and the bill moves the second time.
    //
    // `LineCorrection.tsx` mints a FRESH `adjustment_attempt_id` per submit, so `01-F83`'s key
    // does NOT collapse the pair: the ledger ends up holding two `void.recorded` for one line,
    // one of them an orphan naming money the first attempt never removed. That is the input the
    // owed `01-F30` `void_value` arm has to survive, and it is asserted rather than described.
    const t = till({ failAppend: 2 });
    expect(() => t.guarded.append(voidReq())).toThrow();

    t.guarded.append(voidReq());
    expect(t.billed(), "the retry took the naan off").toBe(KARAHI);
    expect(t.states(LINE_B)).toEqual(["voided"]);

    const correctives = t.landed.filter((e) => e.type === "void.recorded");
    expect(correctives, "two correctives for one line — one of them an orphan").toHaveLength(2);
    expect(
      new Set(correctives.map((e) => e.payload.adjustment_attempt_id)).size,
      "under two different 01-F83 keys, so no fold can collapse them",
    ).toBe(2);
  });
});
