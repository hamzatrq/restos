// **DO THE THREE NUMBERS ON THE GLASS ADD UP?** — `02-F63` (b) evaluated at `27-F23`'s precision.
//
// `cart-breakdown-seam.test.ts` beside this file asks whether the gateway CARRIES `16-F5`'s two
// figures and `02-F63` (b)'s adjustment. This file asks the question that survived it: given that
// they arrive, **do the rows the cashier reads sum to the total she charges?**
//
// ## The defect, measured on shipping code at the SHIPPED DEFAULT (August 2026)
//
// Two whole-rupee lines totalling Rs 510, `exclusive` 1600 bps, `charge_rounding_paisa` 100:
//
//     subtotal 51_000   tax 8_160   charge 59_200   rounding_paisa +40
//     glass:  Subtotal Rs 510  ·  Tax Rs 81  ·  TOTAL Rs 592        510 + 81 = 591
//
// Rs 1 is missing and **neither half of it is visible on its own**: Rs 0.60 is lost truncating a
// Rs 81.60 tax through `rupeesFromPaisa` (`27-F23` gives an operational screen no decimals), and
// Rs 0.40 is lost because the rounding row was suppressed whenever it would not RENDER a figure —
// which at `02-F63` (c)'s default step is every sub-rupee adjustment, i.e. all of them.
//
// **Why the existing oracle could not see it, which is the transferable part.**
// `cart-breakdown-seam.test.ts` §B carries an assertion titled *"OMITS a sub-rupee adjustment"*
// whose fixture is three lines totalling Rs 853 at the same rate and step. There
// `shown(subtotal) + shown(tax)` is 853 + 136 = 989 and `shown(total)` is 989 — **the two
// truncations cancel**, so omitting the row is correct there and the assertion is right about its
// own fixture. It is the round-3 shape exactly: the guard is built correctly and pointed at a case
// where the thing it guards cannot go wrong. That assertion is untouched and still passes; this
// file adds the fixture where the truncations do NOT cancel.
//
// ## The rule this pins, and it is `02-F63` (b)'s own sentence
//
// (b): *"the adjustment is exactly `billed_total − (subtotal + tax)`"*. The old code computed that
// in PAISA and then asked whether the answer would render; every other row on the surface is
// truncated to whole rupees first. Two precisions for one identity do not close. Evaluating (b)'s
// subtraction over the DISPLAYED figures closes the surface by construction, and the presence rule
// falls out of it: the row appears exactly when the rows above fail to reach the total, so
// `Rounded up Rs 0` is still never emitted (a zero difference IS the case where they already
// close). `02-F63` (f) keeps the printed receipt on exact paisa — the two media close at different
// precisions on purpose, and only paper is allowed decimals.
//
// PROVENANCE: written alongside the fix (`20 §4.3` as amended by R66). `main/gateway.ts` is not a
// `20 §4.4` protected path and computes no money of its own — every figure here comes from
// `packages/sync-client`'s `orderChargeSnapshot`, which is untouched by this change.

import { resolveAging } from "@restos/device-config";
import { paisa, rupeesFromPaisa } from "@restos/domain";
import { type DeviceStore, orderChargeSnapshot } from "@restos/sync-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGateway, type GatewayDeps } from "../gateway";
import { CHARGE_ROUNDING_ENV, TAX_POSTURE_ENV, TAX_RATE_BPS_ENV } from "../tax-posture";

/**
 * **Rs 450 + Rs 60 = Rs 510 — the fixture the reported defect was measured on**, and its value is
 * that at 1600 bps its tax is `8_160`: a sub-rupee part of Rs 0.60 that does NOT cancel against
 * the Rs 0.40 the charge rounding adds. `14-F29` prices in whole rupees and `01-F53` freezes them,
 * so both lines are whole rupees and the subtotal carries no paisa of its own — the residue is
 * entirely the tax's and the rounding's, which is what makes the arithmetic attributable.
 */
const REPORTED_LINES = JSON.stringify({
  "line-a": { item_id: "i-karahi", qty: 1, unit_price_paisa: 45_000, states: ["confirmed"] },
  "line-b": { item_id: "i-naan", qty: 1, unit_price_paisa: 6_000, states: ["confirmed"] },
});

/** Three lines totalling Rs 853 — `cart-breakdown-seam.test.ts`'s fixture, where they DO cancel. */
const CANCELLING_LINES = JSON.stringify({
  "line-a": { item_id: "i-karahi", qty: 1, unit_price_paisa: 44_900, states: ["confirmed"] },
  "line-b": { item_id: "i-biryani", qty: 1, unit_price_paisa: 32_500, states: ["confirmed"] },
  "line-c": { item_id: "i-naan", qty: 1, unit_price_paisa: 7_900, states: ["confirmed"] },
});

const rowOf = (json_lines: string) => ({
  order_id: "order-1234abcd",
  channel: "counter",
  order_type: "dine_in",
  confirmed_at: null,
  settled: 0,
  json_lines,
  pay_total: 0,
});

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

const deps = (json_lines: string): GatewayDeps =>
  ({
    store: {
      identity: { org_id: "org1", branch_id: "br1", device_id: "dev1" },
      openOrders: () => [rowOf(json_lines)],
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

const projected = (json_lines: string) => createGateway(deps(json_lines)).openOrders()[0];

/**
 * **What the cashier reads**, through the SAME function `MoneyValue` formats with. Every assertion
 * below compares these and never the paisa, because the paisa always closed — the defect only
 * exists at the precision `27-F23` renders in, and an assertion in paisa cannot see it.
 */
const shown = (p: number): number => rupeesFromPaisa(paisa(p)).rupees;

/** `Subtotal + Tax` when the tax block is present; otherwise the cart's own line rows. */
const shownAboveOf = (order: ReturnType<typeof projected>): number => {
  const t = order?.charge_tax;
  if (t !== undefined) return shown(t.subtotal_paisa) + shown(t.tax_total_paisa);
  return (order?.lines ?? []).reduce((acc, l) => acc + shown(l.billed_paisa), 0);
};

/** The rounding row as a signed number of whole rupees — `27-F12`'s word turned back into sign. */
const shownDeltaOf = (order: ReturnType<typeof projected>): number => {
  const r = order?.charge_rounding;
  if (r === undefined) return 0;
  const magnitude = shown(r.magnitude_paisa);
  return r.direction === "up" ? magnitude : 0 - magnitude;
};

describe("§A 02-F63 (b) / 27-F23 — the rows a cashier reads sum to the total she charges", () => {
  it("THE REPORTED DEFECT: Rs 510 at exclusive 1600 bps, the shipped default step", () => {
    seed("exclusive", "1600");
    const order = projected(REPORTED_LINES);

    // The paisa were never wrong, and stating that is what makes this a DISPLAY finding: the
    // ledger charges 59_200 and `payment.recorded` matches it to the paisa.
    const engine = orderChargeSnapshot(
      REPORTED_LINES,
      { posture: "exclusive", rate_bps: 1600 },
      100,
    );
    expect(engine.tax.subtotal_paisa).toBe(51_000);
    expect(engine.tax.tax_total_paisa).toBe(8_160);
    expect(engine.charge_total_paisa).toBe(59_200);
    expect(order?.total_paisa).toBe(59_200);

    // The glass, before the fix: Rs 510 · Rs 81 · TOTAL Rs 592, and 510 + 81 = 591.
    expect(shown(order?.charge_tax?.subtotal_paisa ?? 0)).toBe(510);
    expect(shown(order?.charge_tax?.tax_total_paisa ?? 0)).toBe(81);
    expect(shown(order?.total_paisa ?? 0)).toBe(592);

    // MUTANT THIS KILLS: the pre-fix presence rule — omit the row unless the LEDGER's paisa
    // adjustment renders non-zero. Here it is 40 paisa, renders `Rs 0`, and was omitted; the
    // surface then reads three numbers that do not add up. The row must be Rs 1 UP.
    expect(order?.charge_rounding).toEqual({ magnitude_paisa: 100, direction: "up" });
    expect(Number(shownAboveOf(order)) + Number(shownDeltaOf(order))).toBe(592);
  });

  it("the sub-rupee adjustment is still SILENT when the rows already close (Rs 853)", () => {
    // `cart-breakdown-seam.test.ts` §B's fixture, kept here as the CONTROL for the row above:
    // the two truncations cancel (853 + 136 = 989 = TOTAL), so there is nothing to say and the
    // row must stay absent. Without this, "always emit a row" would pass the assertion above and
    // put `Rounded up Rs 0` on every order — the noise the old rule existed to prevent.
    seed("exclusive", "1600");
    const order = projected(CANCELLING_LINES);
    const engine = orderChargeSnapshot(
      CANCELLING_LINES,
      { posture: "exclusive", rate_bps: 1600 },
      100,
    );
    expect(engine.rounding_paisa).not.toBe(0);
    expect(Math.abs(engine.rounding_paisa)).toBeLessThan(100);
    expect(order?.charge_rounding).toBeUndefined();
    expect(Number(shownAboveOf(order)) + Number(shownDeltaOf(order))).toBe(989);
  });
});

describe("§B — it closes in EVERY posture at EVERY step 02-F63 (c) admits", () => {
  // `02-F63` (c) as amended admits only whole-rupee steps, so 100 and 1000 are the whole domain.
  // Both fixtures are swept against both, because a rule that closes on one fixture and one step
  // is a rule with one data point.
  for (const [label, lines] of [
    ["Rs 510 (the truncations do not cancel)", REPORTED_LINES],
    ["Rs 853 (the truncations cancel)", CANCELLING_LINES],
  ] as const) {
    for (const posture of ["none", "inclusive", "exclusive"] as const) {
      for (const step of ["100", "1000"] as const) {
        it(`${label} · ${posture} · step ${step}`, () => {
          seed(posture, "1600", step);
          const order = projected(lines);
          const above = shownAboveOf(order);
          const delta = shownDeltaOf(order);
          const total = shown(order?.total_paisa ?? 0);
          expect(
            Number(above) + Number(delta),
            `rows ${above} ${delta >= 0 ? "+" : "-"} ${Math.abs(delta)} must reach TOTAL ${total}`,
          ).toBe(total);
          // …and the row is never a figure that renders as nothing (`roundingRow`'s precedent:
          // `Rounded up Rs 0` is not a sentence anyone says).
          if (order?.charge_rounding !== undefined) {
            expect(shown(order.charge_rounding.magnitude_paisa)).not.toBe(0);
          }
        });
      }
    }
  }
});
