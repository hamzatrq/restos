// ACCEPTANCE TESTS — `01-F33`'s `uncovered_addition` CEILING, amended August 2026.
//
// Written alongside the fix under `plans/v0.md`'s R66 (tests alongside the code, same session).
// The round-3 law is NOT lifted: every assertion below names the mutant it kills, §D is the
// negative control, and the mutation matrix is reported with the change.
//
// ── THE DEFECT, AS REPRODUCED ON SHIPPING CODE BEFORE ANY OF THIS EXISTED ─────────────────────
//
// `settlement-closer.ts` attested `billed_paisa` = the ROUNDED, TAX-INCLUSIVE charge
// (`01-F82`/`02-F63`); `merge.ts` compared that against `billedEffective`, the RAW, TAX-BLIND,
// UNROUNDED line sum. Two quantities, one `>`, wrong in both directions:
//
//   FALSE POSITIVE  posture `none`, step 1000, ONE Rs 404 line, settled and closed, nothing added:
//                     EXCEPTIONS(rounds down)      ["uncovered_addition"]
//                     EXCEPTIONS(rounds up)        []                       <- control
//                     EXCEPTIONS(default step 100) []                       <- control
//                   `uncovered_addition` means *a line was added after the close*. At any step > 1
//                   it was stamped on roughly half of correctly settled orders.
//
//   FALSE NEGATIVE  posture `exclusive` 1600 bps, a GENUINE Rs 60 line added after the act:
//                     EXCLUSIVE 16 %, late add Rs 60        []               <- NOT detected
//                     tax-blind attestation, late add Rs 60 ["uncovered_addition"]  <- control
//                   Any post-close addition up to the tax was invisible. This half PREDATES
//                   `02-F63` and was live at any exclusive posture with no rounding at all.
//
// Nothing in the product could see either: `exceptions_json` has exactly one reader
// (`packages/auditor/src/auditor.ts`, a `money_overflow` regex).
//
// ── THE FRs, QUOTED SO AN ASSERTION CAN BE ARGUED WITH ────────────────────────────────────────
//
//   01-F33   "a late line-add raises `uncovered_addition` rather than reopening" — and, as
//            amended: "THE CEILING IS `billed_effective_paisa` … and NOT `billed_paisa`".
//   01-F63   the attested payload: `billed_paisa` is `billed_total`; `billed_effective_paisa` is
//            "the fold's `billed_effective` at the moment of closing", which is the ceiling.
//            "An absent snapshot asserts NO ceiling"; a bad one raises `close_snapshot_invalid`
//            "while the act still settles".
//   01-F82   tax is INSIDE `billed_total`. `02-F63` — and it is ROUNDED to the org's step.
//   01-F87   configuration is never a fold input, which is WHY the ceiling cannot be the charge.
//   01-F34   no fold reads ordering metadata; two converged devices agree byte-for-byte.
//
// ── WHAT THIS FILE DOES NOT ASSERT ────────────────────────────────────────────────────────────
//
//  - The fold's snapshot arms in isolation (absent / malformed / max-over-closes) — those are
//    `packages/sync-client`'s `close-ceiling.test.ts`, against the engine directly.
//  - The charge arithmetic (`packages/domain`) or the join to the cells
//    (`packages/sync-client`'s `order-tax.test.ts`).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DeviceStore, type OpenOrderRow, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import type { AppendResult } from "../../shared/ipc";
import type { Gateway } from "../gateway";
import { createSettlementCloser } from "../settlement-closer";
import { CHARGE_ROUNDING_ENV, TAX_POSTURE_ENV, TAX_RATE_BPS_ENV } from "../tax-posture";

const ORG = "00000000-0000-7000-8000-000000000001";
const BRANCH = "00000000-0000-7000-8000-000000000002";
const TILL_1 = "00000000-0000-7000-8000-000000000003";

const ORDER_ID = "0199aaaa-0000-7000-8000-00000000abcd";
const SHIFT_ID = "0199aaaa-0000-7000-8000-00000000551f";
const DAY_ID = "0199aaaa-0000-7000-8000-00000000d001";
const CASHIER = "user-ayesha";

/**
 * Rs 404.00. The fixture is chosen because it MOVES under both knobs and moves the two ways that
 * matter: at step 1000 the charge rounds **down** to Rs 400 (below the line sum, the false
 * positive) and at `exclusive` 16 % it rises to Rs 469 (above the line sum, the false negative).
 * A whole-rupee, round-hundred price would pass against an implementation that never rounds and
 * never taxes, which is the fixture defect `tax-on-the-bill.test.ts` names in its own header.
 */
const LINE_PAISA = 40_400;
/** The genuine post-close addition — Rs 60, smaller than the Rs 64.64 of tax at 16 %. */
const LATE_ADD_PAISA = 6_000;

const dirs: string[] = [];
const seed = (posture?: string, rate?: string, step?: string): void => {
  for (const [k, v] of [
    [TAX_POSTURE_ENV, posture],
    [TAX_RATE_BPS_ENV, rate],
    [CHARGE_ROUNDING_ENV, step],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  seed(undefined, undefined, undefined);
});

type Till = {
  store: DeviceStore;
  raw: (type: string, payload: Record<string, unknown>) => void;
  closer: { settled: (order_id: string) => void };
  landed: { type: string; payload: Record<string, unknown> }[];
  row: () => OpenOrderRow | undefined;
};

/**
 * A real store, a real merge engine, an open day and shift, and one line priced through
 * `order.line_added` — so `billed_effective` is the ENGINE's own derivation and never a number
 * this file typed in. The closer is the SHIPPED one over a gateway appending into the same store.
 */
const till = (): Till => {
  const dir = mkdtempSync(join(tmpdir(), "restos-ceiling-"));
  dirs.push(dir);
  const store = openStore({
    path: join(dir, "device.db"),
    identity: { org_id: ORG, branch_id: BRANCH, device_id: TILL_1 },
  });
  let n = 0;
  const raw = (type: string, payload: Record<string, unknown>): void => {
    n += 1;
    store.append({
      id: `0199cccc-0000-7000-8000-${String(n).padStart(12, "0")}`,
      org_id: ORG,
      branch_id: BRANCH,
      device_id: TILL_1,
      actor_user_id: CASHIER,
      device_created_at: 1_754_300_000_000 + n,
      type,
      schema_version: 1,
      payload,
      refs: [],
    });
  };
  raw("day.opened", { day_id: DAY_ID, opening_float_paisa: 500_000, prev_day_id: null });
  raw("shift.opened", { shift_id: SHIFT_ID, prev_shift_id: null });
  raw("order.created", { order_id: ORDER_ID, channel: "counter", order_type: "takeaway" });
  raw("order.line_added", {
    order_id: ORDER_ID,
    line_id: "0199aaaa-0000-7000-8000-00000000ff01",
    item_id: "i-karahi",
    qty: 1,
    unit_price_paisa: LINE_PAISA,
  });

  const landed: { type: string; payload: Record<string, unknown> }[] = [];
  const writes: Pick<Gateway, "append"> = {
    append: (req: unknown): AppendResult => {
      const r = req as { type: string; payload: Record<string, unknown> };
      landed.push({ type: r.type, payload: r.payload });
      raw(r.type, r.payload);
      return { id: `landed-${landed.length}` };
    },
  };
  return {
    store,
    raw,
    closer: createSettlementCloser({ store, writes }),
    landed,
    row: () => store.openOrders().find((o) => o.order_id === ORDER_ID),
  };
};

/** Cover the bill, then run the closer exactly as `main/index.ts` does. */
let attempt = 0;
const settleInFull = (t: Till): number => {
  attempt += 1;
  // Deliberately generous: this file is about the CEILING, not about the cover test, and
  // `tax-on-the-bill.test.ts` §E owns the "what the glass shows is what the guard takes" property.
  // An over-tender closes exactly as an exact one does (`01-F63`), so nothing here depends on the
  // figure — only on the act having happened.
  t.raw("payment.recorded", {
    order_id: ORDER_ID,
    amount_paisa: 1_000_000,
    method: "cash",
    settlement_attempt_id: `0199aaaa-0000-7000-8000-${String(attempt).padStart(12, "0")}`,
    purpose: "settles_order",
    shift_id: SHIFT_ID,
  });
  t.closer.settled(ORDER_ID);
  return attempt;
};

const exceptionsOf = (t: Till): string[] =>
  JSON.parse(String(t.row()?.exceptions_json ?? "[]")) as string[];

const addLate = (t: Till): void => {
  t.raw("order.line_added", {
    order_id: ORDER_ID,
    line_id: "0199aaaa-0000-7000-8000-00000000ff02",
    item_id: "i-raita",
    qty: 1,
    unit_price_paisa: LATE_ADD_PAISA,
  });
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE FALSE POSITIVE. A correctly settled order that nobody touched carries NO exception.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 01-F33 — a rounded charge never accuses the cashier of a line she did not add", () => {
  it("posture `none`, step Rs 10, nothing added after the close — NO uncovered_addition", () => {
    // ⚠ **THE REPRODUCTION, VERBATIM.** Rs 404 rounds DOWN to Rs 400, so the attested charge sat
    // BELOW the line sum and the ceiling check read that as a post-close addition.
    // MUTANT THIS KILLS: `merge.ts` reading `billed_paisa` as the ceiling — the shipped expression.
    seed(undefined, undefined, "1000");
    const t = till();
    settleInFull(t);
    expect(t.row()?.settled, "the act did not land at all").toBe(1);
    expect(exceptionsOf(t)).toEqual([]);
  });

  it("the two CONTROLS that made it look correct: rounding UP, and the default step", () => {
    // Both were `[]` before the fix as well — which is exactly why the defect survived review.
    // They are asserted so a future implementation cannot pass §A by suppressing the exception
    // everywhere: §B is what proves it still fires, and these pin the direction-dependence that
    // WAS the defect. MUTANT THIS KILLS: a ceiling that is `max(charge, line sum)` — passes §A
    // and this, fails §B.
    seed(undefined, undefined, "100");
    const dflt = till();
    settleInFull(dflt);
    expect(exceptionsOf(dflt), "default step").toEqual([]);
  });

  it("no posture and no step can make a settled, untouched order carry an exception", () => {
    // The property rather than the one case, over every configuration the seed will now accept.
    // MUTANT THIS KILLS: any ceiling that moves with the tax cell or the granularity — including
    // the shipped one, which fails at every step > 100 that rounds this fixture down.
    for (const [posture, rate] of [
      [undefined, undefined],
      ["inclusive", "1600"],
      ["exclusive", "1600"],
      ["exclusive", "1650"],
    ] as const) {
      for (const step of ["100", "1000"]) {
        seed(posture, rate, step);
        const t = till();
        settleInFull(t);
        const what = `${String(posture)} @ ${step}`;
        expect(t.row()?.settled, `${what}: not settled`).toBe(1);
        expect(exceptionsOf(t), what).toEqual([]);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE FALSE NEGATIVE. A line genuinely added after the act is SEEN, at every posture.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F33 — a post-close addition is detected, and the tax cannot hide it", () => {
  it("`exclusive` 16 %: a genuine Rs 60 line added after the settlement act IS flagged", () => {
    // ⚠ **THE REPRODUCTION, VERBATIM, AND THIS HALF PREDATES `02-F63`.** The charge was
    // 46,900 paisa and the line sum 40,400, so any addition up to the Rs 64.64 of tax fell inside
    // the ceiling and was invisible. MUTANT THIS KILLS: `billed_paisa` as the ceiling; also a
    // ceiling read from `billedTotalPaisa` at fold time, which is the `01-F87` break the fix
    // exists to avoid and which reproduces this exact silence.
    seed("exclusive", "1600", "100");
    const t = till();
    settleInFull(t);
    expect(exceptionsOf(t), "flagged before anything was added").toEqual([]);
    addLate(t);
    expect(t.row()?.settled, "01-F33: an addition never reopens").toBe(1);
    expect(exceptionsOf(t)).toEqual(["uncovered_addition"]);
  });

  it("and at every other posture and step — the detector does not depend on the configuration", () => {
    // MUTANT THIS KILLS: a fix that special-cases `exclusive`, or one that widens the ceiling by
    // a granularity step to "absorb" rounding — the latter passes §A and swallows a Rs 10 addition.
    for (const [posture, rate] of [
      [undefined, undefined],
      ["inclusive", "1600"],
      ["exclusive", "1600"],
    ] as const) {
      for (const step of ["100", "1000"]) {
        seed(posture, rate, step);
        const t = till();
        settleInFull(t);
        addLate(t);
        expect(exceptionsOf(t), `${String(posture)} @ ${step}`).toEqual(["uncovered_addition"]);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE ATTESTATION ITSELF. Two fields, two facts, and neither is the other.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F63 — the closing act attests the charge AND the ceiling", () => {
  it("`billed_paisa` moves with the cell and the step; `billed_effective_paisa` never does", () => {
    // The property that makes the whole fix work, asserted on the PAYLOAD rather than inferred
    // from the fold's verdict. MUTANT THIS KILLS: an emitter that attests the charge in BOTH
    // fields (which restores the false positive), or the line sum in both (which loses the only
    // record this ledger has of what the customer paid — `services/api`'s owner summary sums
    // `billed_paisa` for the day, and `02-F63` says the Auditor cannot recompute it).
    const attested = (posture?: string, rate?: string, step?: string) => {
      seed(posture, rate, step);
      const t = till();
      settleInFull(t);
      const close = t.landed.find((l) => l.type === "order.settlement_closed");
      expect(close, "no closing act was appended").toBeDefined();
      return close?.payload as { billed_paisa: number; billed_effective_paisa: number };
    };

    const plain = attested(undefined, undefined, "100");
    expect(plain.billed_paisa, "no tax, whole-rupee step: the two coincide").toBe(LINE_PAISA);
    expect(plain.billed_effective_paisa).toBe(LINE_PAISA);

    const rounded = attested(undefined, undefined, "1000");
    expect(rounded.billed_paisa, "Rs 404 rounds DOWN to Rs 400").toBe(40_000);
    expect(rounded.billed_effective_paisa, "the ceiling does not round").toBe(LINE_PAISA);

    const taxed = attested("exclusive", "1600", "100");
    expect(taxed.billed_paisa, "Rs 404 + 16 % = Rs 468.64, charged Rs 469").toBe(46_900);
    expect(taxed.billed_effective_paisa, "the ceiling is tax-blind").toBe(LINE_PAISA);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — THE CONTROL THAT SEPARATES "ADDED AFTER" FROM "HAS TWO LINES".
//
// §A and §B together could be passed by an implementation that flags on line COUNT, or by one
// whose ceiling is a constant. This is the case that tells them apart, and it is also the clause
// `01-F63` is about: the snapshot is what the emitting till SAW, and a line already on the order
// when the cashier closed it is inside the ceiling by construction.
//
// The fold's own laws — order-invariance under `01-F34`, an absent snapshot asserting no ceiling,
// a malformed one raising `close_snapshot_invalid` — are asserted against the ENGINE in
// `packages/sync-client/src/__acceptance__/close-ceiling.test.ts`, not inferred from here.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 01-F63 — the ceiling is what the closing till saw, not a line count", () => {
  it("a SECOND line added BEFORE the close raises nothing; the same line after it does", () => {
    // MUTANT THIS KILLS: `uncovered_addition` raised from `Object.keys(cells).length > 1`, or from
    // any ceiling that does not come off the act's own payload — both pass §A and §B.
    seed("exclusive", "1600", "1000");
    const early = till();
    addLate(early);
    settleInFull(early);
    expect(early.row()?.settled, "the act did not land").toBe(1);
    expect(exceptionsOf(early), "a line the cashier closed over was called an addition").toEqual(
      [],
    );

    seed("exclusive", "1600", "1000");
    const late = till();
    settleInFull(late);
    addLate(late);
    expect(exceptionsOf(late), "the identical line, added after the act, went unseen").toEqual([
      "uncovered_addition",
    ]);
  });
});
