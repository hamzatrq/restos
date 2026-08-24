// ACCEPTANCE TESTS — `03-F52`: *"The tier stops being an input."*
//
// **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2). The author wrote no production code for
// `03-F52`. This is the counter's half of the FR; the pass screen's half is
// `apps/pass-kds/src/main/__acceptance__/handover.test.ts`, and the contract both share is written
// out in that file's header.
//
// ───────────────────────────────────────────────────────────────────────────────────────────────
// THE FR, quoted:
//
//   03-F52  "**The tier stops being an input.** `02-F31`'s auto-advance ships **unchanged in
//           behaviour** and changes its trigger: the till emits on settlement because the branch's
//           serve-signal owner is `settlement`, not because a label reads `T1`. That is
//           `DEC-HW-003`'s checkable test — *'no code may branch on the tier to decide whether a
//           piece of hardware EXISTS'* — applied to the one producer that still failed it."
//
//   03-F52  "**The owners:** `settlement` (no device signals handover — `02-F31`'s auto-advance,
//           unchanged in behaviour), `pass` … `counter` … `waiter`."
//
//   03-F52  REJECTED "(a) *widening `02-F31`'s auto-advance to T2* — `03-F51` forbids it in terms,
//           and at counter service the customer pays before the food is cooked, so lines rest at
//           `confirmed`, `confirmed → served` is illegal, and the trigger emits NOTHING while
//           looking finished."
//
//   DEC-HW-003 "**No code may branch on the tier to decide whether a piece of hardware EXISTS.**
//           That last sentence is the checkable test that separates the two models."
//
// ───────────────────────────────────────────────────────────────────────────────────────────────
// ⚠ THE CONTRACT THIS FILE PINS:
//
//   `LineAdvanceDeps` gains `serveOwner: () => ServeSignalOwner` (from `@restos/device-config`,
//   see the pass-kds header for the whole declaration and why it lives in the package). `settled`
//   gates on `serveOwner() === "settlement"` and **no longer** on `autoAdvancesLines(tier())`.
//
//   `tier` STAYS on the deps and `printEvent` keeps reading it: `kot.printed → lines in_prep` is
//   `02-F31`'s OTHER half, `03-F52` says nothing about it, and deleting the gate there would be
//   scope this FR did not authorise (`24 §3b`). §C is the assertion that the move is a move.
//
// ⚠ **A PRE-EXISTING GREEN TEST ENCODES THE OVERRULED RULE AND WILL GO RED.** `line-advance-seam
// .test.ts` §D asserts `expect(rig("T2", "dine_in")).toHaveLength(0)` — the tier gate, on the
// settlement half — and its `rig` will also stop type-checking once `serveOwner` is required.
// **That is not a regression; it is the ruling landing**, and it must be retired in the same change
// with the reason recorded in place, which is the discipline `AGENTS.md` extracts from
// `catalog-pricing.test.ts:394` (*"a GREEN test went on defending an overruled rule, and would have
// failed the correct implementation"*). Its §B rows, which drive `printEvent` at T1/T2, stay
// correct and untouched.

import type { ServeSignalOwner } from "@restos/device-config";
import { describe, expect, it } from "vitest";
import type { HardwareTier } from "../hardware-tier";
import { createLineAdvance, type LineStateChangedPayload } from "../line-advance";

const ORDER_ID = "0199aaaa-0000-7000-8000-00000000abcd";
const LINE_A = "0199aaaa-0000-7000-8000-00000000ff01";

/**
 * One settle-able order, priced so `advancesOnSettlement`'s *"tendered in full"* reading is
 * satisfied — that predicate is `02-F31`'s and `03-F52` does not touch it, so it is held constant
 * here rather than re-asserted.
 */
const rig = (input: {
  tier: HardwareTier;
  owner: ServeSignalOwner;
  order_type?: string;
  state?: string;
}) => {
  const appended: { type: string; payload: LineStateChangedPayload }[] = [];
  const lines = createLineAdvance({
    store: {
      openOrders: () => [
        {
          order_id: ORDER_ID,
          order_type: input.order_type ?? "dine_in",
          pay_total: 45_000,
          json_lines: JSON.stringify({
            [LINE_A]: {
              item_id: "i-karahi",
              qty: 1,
              unit_price_paisa: 45_000,
              states: [input.state ?? "in_prep"],
            },
          }),
        },
      ],
    } as never,
    tier: () => input.tier,
    serveOwner: () => input.owner,
    append: (_caused_by, type, payload) => appended.push({ type, payload }),
  });
  return { lines, appended };
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE HEADLINE. Two runs differing in exactly ONE input, twice over.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 03-F52/DEC-HW-003 — the trigger is the ASSIGNMENT, not the tier", () => {
  it("a T2 branch whose serve-signal owner is `settlement` DOES advance", () => {
    // ⚠ **THE ROW THE WHOLE CLAUSE COMES DOWN TO.** Before `03-F52` this is the case the tier gate
    // refused outright, so an implementation that kept `autoAdvancesLines` — or that added the
    // owner check as an ADDITIONAL `&&` guard beside it, which is the change a careful session
    // makes when it does not want to break anything — fails here and nowhere else in this file.
    const served = rig({ tier: "T2", owner: "settlement" });
    served.lines.settled(ORDER_ID, null);
    expect(served.appended).toHaveLength(1);
    expect(served.appended[0]?.payload.state).toBe("served");
    // …and T3, so "T2" cannot be read as the new special case.
    const t3 = rig({ tier: "T3", owner: "settlement" });
    t3.lines.settled(ORDER_ID, null);
    expect(t3.appended).toHaveLength(1);
  });

  it("a T1 branch whose serve-signal owner is `pass` does NOT advance", () => {
    // THE CONTROL, and it is the half that keeps the assertion above from being satisfied by
    // deleting the gate altogether: one input differs from the row below, and the answer flips.
    // `03-F52` — *"Surfaces without the assignment are read-only for `served`"*; a till that
    // auto-served while a pass person was walking the plate out would race the human who owns the
    // act, and `served` is terminal under `01-F35`.
    const owned = rig({ tier: "T1", owner: "pass" });
    owned.lines.settled(ORDER_ID, null);
    expect(owned.appended).toEqual([]);
    // The same fixture with the assignment back: `02-F31` unchanged in behaviour.
    const settlement = rig({ tier: "T1", owner: "settlement" });
    settlement.lines.settled(ORDER_ID, null);
    expect(settlement.appended).toHaveLength(1);
    expect(settlement.appended[0]?.payload.state).toBe("served");
  });

  it("`counter` and `waiter` are refusals here too — the till owns only its own value", () => {
    // Three of `03-F52`'s four owners mean *"not this device"* from the counter's side. Asserted
    // per value rather than as "anything but settlement", because an implementation that tested
    // `owner !== "pass"` passes the row above and fails only here.
    for (const owner of ["pass", "counter", "waiter"] as const) {
      const r = rig({ tier: "T1", owner });
      r.lines.settled(ORDER_ID, null);
      expect(r.appended, owner).toEqual([]);
    }
  });

  it("the assignment is read INSIDE `settled`, on every call — not captured at construction", () => {
    // The same property `line-advance-seam.test.ts` §B pins for `printEvent`'s tier gate, and the
    // same reason: a gate the host applies is a gate no test can drive, and a value captured at
    // construction freezes this device on whatever was set at boot.
    let owner: ServeSignalOwner = "pass";
    const appended: LineStateChangedPayload[] = [];
    const lines = createLineAdvance({
      store: {
        openOrders: () => [
          {
            order_id: ORDER_ID,
            order_type: "dine_in",
            pay_total: 45_000,
            json_lines: JSON.stringify({
              [LINE_A]: { item_id: "i", qty: 1, unit_price_paisa: 45_000, states: ["in_prep"] },
            }),
          },
        ],
      } as never,
      tier: () => "T1",
      serveOwner: () => owner,
      append: (_caused_by, _type, payload) => appended.push(payload),
    });
    lines.settled(ORDER_ID, null);
    expect(appended).toEqual([]);
    owner = "settlement";
    lines.settled(ORDER_ID, null);
    expect(appended).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — WHAT `03-F52` DID NOT CHANGE. Everything `02-F31` already decided still decides.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F31 — unchanged in behaviour, changed in trigger", () => {
  it("01 §4's delivery rule still refuses, under the owner that would otherwise fire", () => {
    // The allowlist is `02-F31`'s and is untouched by this FR. Asserted with the assignment set to
    // `settlement` so the ONLY thing refusing is the order type — the same control discipline the
    // pass-side suite uses, and the thing that separates "refused for the right reason" from any
    // refusal.
    const delivery = rig({ tier: "T1", owner: "settlement", order_type: "delivery" });
    delivery.lines.settled(ORDER_ID, null);
    expect(delivery.appended).toEqual([]);
    const unknown = rig({ tier: "T1", owner: "settlement", order_type: "kerbside" });
    unknown.lines.settled(ORDER_ID, null);
    expect(unknown.appended).toEqual([]);
  });

  it("REJECTED (a) — a line at `confirmed` still moves NOTHING, and that is the FR's own warning", () => {
    // > at counter service the customer pays before the food is cooked, so lines rest at
    // > `confirmed`, `confirmed → served` is illegal, and the trigger emits NOTHING while looking
    // > finished, which `DEC-HW-002` names as the worst available outcome
    //
    // Pinned so that a session reading the row above as *"handover now works at T2"* cannot close
    // the gap by widening `LEGAL_NEXT` instead — a `packages/domain` change, protected, and the
    // thing `03-F52` was written to make unnecessary.
    const fresh = rig({ tier: "T2", owner: "settlement", state: "confirmed" });
    fresh.lines.settled(ORDER_ID, null);
    expect(fresh.appended).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE MOVE IS A MOVE. `02-F31`'s OTHER half keeps the tier gate `03-F52` never mentioned.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 02-F31 — `kot.printed → in_prep` is still tier-gated", () => {
  it("a T2 branch does not auto-advance on a print, whatever the serve-signal owner says", () => {
    // `03-F52` moves ONE trigger. `24 §3b`: minimum code that closes the FR — deleting the other
    // gate would be scope this ruling did not authorise, and it would auto-advance the lines a
    // `03-F51` screen-only station's bump owns (`03-F19`).
    const t2 = rig({ tier: "T2", owner: "settlement", state: "confirmed" });
    t2.lines.printEvent("kot.printed", { order_id: ORDER_ID });
    expect(t2.appended).toEqual([]);
    // Not vacuous — the SAME rig at T1 advances.
    const t1 = rig({ tier: "T1", owner: "settlement", state: "confirmed" });
    t1.lines.printEvent("kot.printed", { order_id: ORDER_ID });
    expect(t1.appended).toHaveLength(1);
    expect(t1.appended[0]?.payload.state).toBe("in_prep");
  });

  it("the serve-signal owner does not leak into the print half", () => {
    // The inverse mutant: an implementation that replaced the tier with the assignment EVERYWHERE
    // would make a `pass`-owned branch stop advancing on print, which is a different FR's rule.
    const t1 = rig({ tier: "T1", owner: "pass", state: "confirmed" });
    t1.lines.printEvent("kot.printed", { order_id: ORDER_ID });
    expect(t1.appended).toHaveLength(1);
    expect(t1.appended[0]?.payload.state).toBe("in_prep");
  });
});
