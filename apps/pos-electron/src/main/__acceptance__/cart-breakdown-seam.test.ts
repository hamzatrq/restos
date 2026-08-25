// The CART BREAKDOWN's seam — does the gateway actually carry `16-F5`'s two figures and
// `02-F63` (b)'s adjustment to the renderer, or is the cart drawing rows that never arrive?
//
// **This file exists because of the wave's named defect** (`AGENTS.md`: "a correct subsystem with
// no seam to the product"), and because of a second one this repo has paid for twice: the fields
// below are `.optional()` at the plane boundary, on the four Orders-tab fields' own precedent, and
// `shared/ipc.ts` records the cost in its own words — *"an optional money field is a number a host
// can decline to say while the screen goes on treating its absence as a value."* `packages/ui`'s
// `cart-breakdown.dom.test.tsx` proves the COMPONENT renders the rows given the props; it would
// stay green against a gateway that never supplies them, and the product would then show exactly
// the defect this work was sent to close.
//
// `pnpm seams:check` cannot see it. Rule A wants an unreached export (`createGateway` is reached)
// and Rule B an unsupplied optional member of an options bag on a FACTORY (these are fields on a
// mapping). `AGENTS.md` names the remedy — *"mutate the SEAM, not the logic"* — and this is that
// assertion written by hand.
//
// ## The defect, measured on shipping code (August 2026)
//
// `linesFrom` sends `billed_paisa` per line and the projection sends `01-F82`'s `billed_total`.
// Under `exclusive` those are two different quantities and nothing named the difference, so the
// counter showed rows adding to **Rs 853** under **`TOTAL Rs 989`**. Measured across all three
// postures on the fixture below (three whole-rupee lines, Rs 853, 16 %):
//
//     none      step  100  rows Rs 853  TOTAL Rs 853  gap Rs 0
//     inclusive step  100  rows Rs 853  TOTAL Rs 853  gap Rs 0
//     exclusive step  100  rows Rs 853  TOTAL Rs 989  gap Rs 136
//     none      step 1000  rows Rs 853  TOTAL Rs 850  gap Rs 3      <- NO TAX ANYWHERE
//
// The last row is why §B exists: the finding this work came from measured only the default step
// and concluded *"under `none` the gap is zero"*. It is zero at step 100 and Rs 3 at step 1000, a
// value `02-F63` (c) blesses by name (*"1000 rounds to ten rupees"*), so the defect is a ROUNDING
// defect as well as a tax one and it is live at the shipped default posture.
//
// PROVENANCE: written alongside the implementation (`20 §4.3` as amended by R66; `main/gateway.ts`
// is not a `20 §4.4` protected path and computes no money of its own — every figure here comes
// from `packages/sync-client`'s `orderChargeSnapshot`). Mutation matrix in the session report.

import { resolveAging } from "@restos/device-config";
import { type DeviceStore, orderChargeSnapshot } from "@restos/sync-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGateway, type GatewayDeps } from "../gateway";
import { CHARGE_ROUNDING_ENV, TAX_POSTURE_ENV, TAX_RATE_BPS_ENV } from "../tax-posture";

/**
 * Three WHOLE-RUPEE lines totalling Rs 853 — `14-F29` prices in whole rupees and `01-F53` freezes
 * them, so this is the shape every real order has. It matters: a price with a sub-rupee part would
 * make the subtotal itself carry paisa and the fixture would stop being able to tell a rounding
 * defect from a display one.
 */
const JSON_LINES = JSON.stringify({
  "line-a": { item_id: "i-karahi", qty: 1, unit_price_paisa: 44_900, states: ["confirmed"] },
  "line-b": { item_id: "i-biryani", qty: 1, unit_price_paisa: 32_500, states: ["confirmed"] },
  "line-c": { item_id: "i-naan", qty: 1, unit_price_paisa: 7_900, states: ["confirmed"] },
});
const SUBTOTAL = 85_300;

const ROW = {
  order_id: "order-1234abcd",
  channel: "counter",
  order_type: "dine_in",
  confirmed_at: null,
  settled: 0,
  json_lines: JSON_LINES,
  pay_total: 0,
};

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
afterEach(() => seed(undefined, undefined, undefined));

const deps = (): GatewayDeps =>
  ({
    store: {
      identity: { org_id: "org1", branch_id: "br1", device_id: "dev1" },
      openOrders: () => [ROW],
      kitchenQueue: () => [],
      availability: () => [],
      branchTimeStatus: () => ({
        offset_ms: 0,
        basis: "branch",
        skew_ms: null,
        skew_flagged: false,
      }),
      append: vi.fn((input) => ({ ...input, lamport_seq: 1 })),
    } as unknown as DeviceStore,
    catalog: () => ({ name: "Chicken Karahi" }),
    menu: () => [],
    priceOf: () => 145_000,
    actor: "Ayesha",
    session: () => ({ user_id: "user-1", display_name: "Ayesha" }),
    deviceLabel: "Counter 1",
    training: false,
    reachability: () => ({ lan: "ok", hub: "ok", cloud: "down" }),
    blockedCursor: () => null,
    catalogRefusal: () => null,
    businessDay: () => "2026-08-07",
    panelPpi: () => 100.5,
    aging: resolveAging(undefined).thresholdsFor,
    panelFit: () => null,
  }) as GatewayDeps;

const projected = () => createGateway(deps()).openOrders()[0];

describe("§A — the tax block crosses the seam exactly when the LINE ROWS lack the tax", () => {
  it("exclusive: the gateway supplies `Subtotal` and `Tax` — the Rs 136 that was on no surface", () => {
    seed("exclusive", "1600");
    const order = projected();
    // MUTANT THIS KILLS: `charge_tax` dropped from the projection. `packages/ui` stays green,
    // `pnpm verify` stays green, `seams:check` stays clean — and the till shows Rs 853 of rows
    // under `TOTAL Rs 989` again, which is the whole defect.
    expect(order?.charge_tax).toEqual({ subtotal_paisa: 85_300, tax_total_paisa: 13_648 });
    expect(order?.total_paisa).toBe(98_900);
  });

  it("inclusive: NOTHING, because the fold's per-line figure already contains the tax", () => {
    seed("inclusive", "1600");
    const order = projected();
    // `taxSnapshot`'s inclusive arm sets `line_total_paisa = billed`, so the money column already
    // sums to the total. A `Subtotal Rs 735` row under rows reading Rs 853 would be a smaller
    // number wearing a label that reads like their sum — the same non-reconciliation, one row down.
    expect(order?.charge_tax).toBeUndefined();
    expect(order?.total_paisa).toBe(SUBTOTAL);
  });

  it("none: NOTHING — a `Tax Rs 0` row is a claim about a tax regime the org is not in", () => {
    seed();
    const order = projected();
    expect(order?.charge_tax).toBeUndefined();
    expect(order?.total_paisa).toBe(SUBTOTAL);
  });

  it("the figures are the ENGINE's, not a re-derivation in the host app (26 §8)", () => {
    seed("exclusive", "1600");
    const engine = orderChargeSnapshot(JSON_LINES, { posture: "exclusive", rate_bps: 1600 }, 100);
    const order = projected();
    // MUTANT THIS KILLS: a subtotal computed as `Σ billed_paisa` in `gateway.ts`. It agrees with
    // `orderChargeSnapshot` under `exclusive` and disagrees under `inclusive`, which is precisely
    // the class of second implementation the T-01-11 ruling deleted the Auditor's mirror over.
    expect(order?.charge_tax?.subtotal_paisa).toBe(engine.tax.subtotal_paisa);
    expect(order?.charge_tax?.tax_total_paisa).toBe(engine.tax.tax_total_paisa);
    expect(order?.total_paisa).toBe(engine.charge_total_paisa);
  });
});

describe("§B — 02-F63's rounding crosses as a MAGNITUDE and a WORD, and only when it shows", () => {
  it("none at a Rs 10 step: the Rs 3 that vanished with no tax anywhere in the product", () => {
    seed(undefined, undefined, "1000");
    const order = projected();
    // The case the finding this work came from did not measure. Rows Rs 853, TOTAL Rs 850.
    expect(order?.total_paisa).toBe(85_000);
    expect(order?.charge_rounding).toEqual({ magnitude_paisa: 300, direction: "down" });
    // …and no tax block, because there is no tax. The two terms have DIFFERENT presence
    // conditions, which is why they are two fields and not one bag.
    expect(order?.charge_tax).toBeUndefined();
  });

  it("carries the direction as a WORD — 27-F12, never a sign on the figure", () => {
    // Rounded UP: Rs 853 at 10 % is 93_830, which a Rs 10 step lifts to 94_000.
    seed("exclusive", "1000", "1000");
    const order = projected();
    expect(order?.total_paisa).toBe(94_000);
    /*
      ⚠ **THIS ASSERTION READ `magnitude_paisa: 170` AND IT WAS A SECOND INSTANCE OF THE DEFECT
      `cart-breakdown-closes.test.ts` CLOSES — kept here rather than quietly re-typed (`L3`).**

      170 is the LEDGER's adjustment in paisa (Rs 1.70). `27-F23` gives this screen no decimals,
      so `MoneyValue` truncated it to **Rs 1**, and the surface then read
      `Subtotal Rs 853 · Tax Rs 85 · TOTAL Rs 940` with a `Rounded up Rs 1` between them —
      **853 + 85 + 1 = 939**, one rupee short of the total the cashier charges. The missing
      rupee is the Rs 0.30 truncated off a Rs 85.30 tax, which no row mentioned.

      `02-F63` (b) defines the adjustment as `billed_total − (subtotal + tax)`; evaluated over
      the figures this surface actually DISPLAYS that is Rs 2, and 853 + 85 + 2 = 940 closes.
      So the value moved 170 → 200 because the field is now a GLASS quantity in whole rupees
      (the printed receipt keeps the exact paisa — `02-F63` (f) allows paper decimals).

      **The property this test exists for is untouched**: the direction still arrives as a WORD
      and the magnitude is still non-negative under both directions, which is what the mutant
      note below is about. Only the incidental figure moved.
    */
    expect(order?.charge_rounding).toEqual({ magnitude_paisa: 200, direction: "up" });
    // MUTANT THIS KILLS: a signed `rounding_paisa` at the seam. `ipc-money-seam.test.ts`'s
    // closing row states the shape that is blessed — *"a signed field reaches the screen as a
    // MAGNITUDE"* — and `magnitude_paisa` is non-negative under both directions.
    expect(order?.charge_rounding?.magnitude_paisa).toBeGreaterThanOrEqual(0);
  });

  it("OMITS a sub-rupee adjustment — otherwise every taxed order carries a `Rs 0` row", () => {
    // The measurement behind the rule: at `02-F63` (c)'s DEFAULT step of 100 the adjustment is
    // under a rupee by construction, and `27-F23` gives the screen no decimals, so a plain
    // `sign !== 0` test would have put `Rounded down Rs 0` on essentially every exclusive order.
    seed("exclusive", "1600");
    const order = projected();
    expect(order?.charge_rounding).toBeUndefined();
    // …and the adjustment is genuinely non-zero, so this is the sub-rupee case and not a
    // no-rounding one. A fixture where it happened to be zero could not tell the two apart.
    const engine = orderChargeSnapshot(JSON_LINES, { posture: "exclusive", rate_bps: 1600 }, 100);
    expect(engine.rounding_paisa).not.toBe(0);
    expect(Math.abs(engine.rounding_paisa)).toBeLessThan(100);
  });

  it("says nothing when there is genuinely nothing to say", () => {
    seed();
    expect(projected()?.charge_rounding).toBeUndefined();
  });
});
