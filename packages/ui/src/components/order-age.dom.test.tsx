// AUTHORED FROM SPEC TEXT ONLY (`24 §3` step 2). The session that wrote the plan for this task
// is disqualified as its own test author; this file was written without reading that plan, from
// `03-F25`, `03-F14`, `03-F47`, `02-F10`, `02-F31`, `27-F12` and `27-F16` and from the two
// components that already exist (`AgeBadge`, `OrderList`).
//
// ───────────────────────────────────────────────────────────────────────────────────────────────
// `03-F25` ON THE COUNTER'S ROW — `OrderList` renders a row's AGE.
// ───────────────────────────────────────────────────────────────────────────────────────────────
//
// > 03-F25 **Stage 1 — aging timers, day one:** timers from `order.confirmed` on every queue
// > surface (pass, KDS, **POS T1 panel**, manager console).
//
// > 02-F31 … the POS shows a compact order-queue panel with aging timers (doc 03 thresholds)
//
// > 02-F10 Order queue and recall … **Aging colors follow doc 03 thresholds.**
//
// Four surfaces are named and the counter is one of them. `TicketCard` already carries an
// `AgeBadge` for the pass; the counter's row does not, and `OrderRow` carries no age field at
// all. This file is the counter half of `03-F25` at the vocabulary layer.
//
// ## THE CONTRACT THIS SUITE FIXES, and why it is shaped this way
//
//   OrderRow.age?: { minutes: number; amberAt: number; redAt: number } | null | undefined
//
// **One object, never three loose fields.** `03-F47` makes the colour a function of *fixed
// configured minutes*, and `AgeBadge` already takes exactly `(minutes, amberAt, redAt)` — so a
// shape that can express "minutes without thresholds" is a shape in which a row can silently
// fall back to somebody's default. `03-F14` makes X/Y **org-configurable per order type**, so a
// default is a wrong number rather than a missing one.
//
// **`null` is a first-class value and is NOT `{ minutes: 0 }`.** `03-F14`: *"timer basis is
// `order.confirmed`"*. An order with no confirm anchor has no age, and `00 §5.7` forbids the
// device presenting a number it does not have. `0 min` on an order that arrived forty minutes
// ago is the dishonest render, and it is the one an `?? 0` reaches for.
//
// **Optional, and the cost is stated.** `order-list.dom.test.tsx` is an existing acceptance file
// this session may not edit and it builds `OrderRow` fixtures by hand, so a REQUIRED key is a
// compile error in an oracle rather than a feature. The price is the wave's named defect in
// miniature — an absent value renders as "no age" and looks healthy — which is why the seam is
// then held by hand at `apps/pos-electron/src/main/__acceptance__/orders-aging.test.ts` and
// `apps/pos-electron/src/renderer/orders-aging.dom.test.tsx`.
//
// ## THE MUTANT EVERY ASSERTION HERE IS AIMED AT
//
// `03-F47` puts the thresholds **per order type**, and one counter list holds mixed types all
// day. So the dangerous implementation is not "no badge" — it is a badge wired to ONE row of the
// threshold table: `<AgeBadge minutes={row.age.minutes} amberAt={10} redAt={20} />`. That renders
// perfectly, passes any single-row fixture, and tells a cashier a 22-minute delivery is overdue
// when the org's own policy says it has three minutes left. §B is a 2×2 grid — two threshold
// pairs × two minute values, four different verdicts — so hardcoding either pair, reading row
// zero's pair for every row, or swapping amber for red each fails at least one cell.
//
// ## WHAT THIS FILE CANNOT SEE, said out loud
//
// **happy-dom performs no layout.** Every `getBoundingClientRect` is zeroes, so nothing here can
// assert the badge is ON THE SCREEN — only that it is in the document. A row that already
// carries a reference, a channel, an item count, a money value and (in the inbox) an Accept tile
// is being asked to carry a sixth element, and whether it fits at `27 §1a`'s tightest panels is
// `pnpm -C apps/pos-electron layout:check`'s question and no suite's. See the layout-gate
// tripwire in the seam file: if the gate's fixture serves no aged order, the only rail that can
// see this is blind to it.
//
// It also asserts nothing about colour, contrast or the `27-F15` ladder — `AgeBadge` owns those
// and `packages/ui/src/tokens/`'s oracles measure them. What it does assert about `27-F12` is
// the structural half: the state reaches the operator as a NUMBER and a WORD, never as a fill.

import { paisa } from "@restos/domain";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeProvider } from "../theme";
import { OrderList, type OrderRow } from "./OrderList";

afterEach(cleanup);

const row = (over: Partial<OrderRow> & { order_id: string }): OrderRow => ({
  reference: over.order_id,
  channel: "counter",
  orderType: "dine_in",
  totalPaisa: paisa(10_000),
  lineCount: 1,
  ...over,
});

/**
 * `03-F14`/`03-F47`'s two stated defaults, transcribed — *"dine-in 10/20, delivery 15/25"*.
 * Named here so the grid below reads as the FR and not as arbitrary numbers.
 */
const DINE_IN = { amberAt: 10, redAt: 20 } as const;
const DELIVERY = { amberAt: 15, redAt: 25 } as const;

const list = (over: Partial<Parameters<typeof OrderList>[0]> = {}) =>
  render(
    <ThemeProvider>
      <OrderList
        orders={[]}
        heightMm={400}
        page={0}
        onPageChange={() => {}}
        empty="Nothing here."
        {...over}
      />
    </ThemeProvider>,
  );

/** Every age on the surface, in DOM order, read the way an assistive technology reads it. */
const agesOnScreen = (): string[] =>
  screen.queryAllByRole("status").map((el) => el.getAttribute("aria-label") ?? "");

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §A — `03-F25`/`02-F10`: the counter's row carries an age at all.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 03-F25 — a POS queue row shows the order's age", () => {
  it("renders the minutes the caller supplied, on the row that owns them", () => {
    list({ orders: [row({ order_id: "A-014", age: { minutes: 12, ...DINE_IN } })] });
    // The NUMBER, not merely "a badge appeared": `27-F12` makes the number part of the status,
    // and an implementation that rendered a coloured chip with no figure would pass a presence
    // check and fail a deuteranope (`27-F17` — 1 in 20 male staff, ~80% unaware).
    expect(agesOnScreen()).toEqual(["12 minutes, due soon"]);
  });

  it("ages every row, not just the first — one badge per aged row", () => {
    // The mutant: rendering the age in a header, or only for `shown[0]`. Three rows, three ages.
    list({
      orders: [
        row({ order_id: "A-014", age: { minutes: 3, ...DINE_IN } }),
        row({ order_id: "A-015", age: { minutes: 4, ...DINE_IN } }),
        row({ order_id: "A-016", age: { minutes: 5, ...DINE_IN } }),
      ],
    });
    expect(agesOnScreen()).toEqual([
      "3 minutes, on time",
      "4 minutes, on time",
      "5 minutes, on time",
    ]);
  });

  it("keeps the rest of the row — the age is added, never substituted for the payload", () => {
    // `27-F25` puts the identifier and the money at the top of the size ladder; an age that
    // displaced either would be a regression dressed as a feature.
    list({
      orders: [
        row({ order_id: "A-014", totalPaisa: paisa(48_750), age: { minutes: 12, ...DINE_IN } }),
      ],
    });
    expect(screen.getByText("A-014")).toBeTruthy();
    expect(screen.getByText(/487\.50|487/)).toBeTruthy();
    expect(agesOnScreen()).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §B — `03-F47`: THE THRESHOLDS ARE PER ORDER TYPE. This is the section that carries the file.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 03-F47/03-F14 — each row is judged against ITS OWN thresholds", () => {
  /**
   * A 2×2 grid: two threshold pairs × two ages, four different verdicts.
   *
   *                       12 min          22 min
   *   dine-in 10/20       due soon        OVERDUE
   *   delivery 15/25      on time         due soon
   *
   * Every cell disagrees with at least one other, so:
   *   - hardcoding 10/20  → "22 due soon" becomes overdue, and "12 on time" becomes due soon;
   *   - hardcoding 15/25  → "12 due soon" becomes on time, and "22 overdue" becomes due soon;
   *   - reading row 0's pair for every row → the delivery rows take dine-in's verdicts;
   *   - swapping amber and red → 12/10/20 reads `12 >= 10` as fault and calls it OVERDUE.
   * None of those survives this one assertion.
   */
  it("gives the same minutes different verdicts under different thresholds", () => {
    list({
      orders: [
        row({ order_id: "dine-22", orderType: "dine_in", age: { minutes: 22, ...DINE_IN } }),
        row({ order_id: "deliv-22", orderType: "delivery", age: { minutes: 22, ...DELIVERY } }),
        row({ order_id: "dine-12", orderType: "dine_in", age: { minutes: 12, ...DINE_IN } }),
        row({ order_id: "deliv-12", orderType: "delivery", age: { minutes: 12, ...DELIVERY } }),
      ],
    });
    expect(agesOnScreen()).toEqual([
      "22 minutes, overdue",
      "22 minutes, due soon",
      "12 minutes, due soon",
      "12 minutes, on time",
    ]);
  });

  it("moves the boundary with the configured value, not with a shipped constant", () => {
    // `03-F14` makes X/Y **org-configurable**, so an org running 8/16 must see amber at 8. An
    // implementation that ships 10/20 as a floor renders this row `on time` at 9 minutes.
    list({ orders: [row({ order_id: "A-014", age: { minutes: 9, amberAt: 8, redAt: 16 } })] });
    expect(agesOnScreen()).toEqual(["9 minutes, due soon"]);
  });

  it("crosses to red at the configured red, inclusive of the minute itself", () => {
    // The ladder is neutral → amber → red (`03-F14`) and `ageLevel` is `>=` on both steps.
    // Asserted at the boundary because an off-by-one here means a ticket that is late by the
    // org's own definition still renders amber, which is `03-F25`'s whole purpose inverted.
    list({
      orders: [
        row({ order_id: "at-red", age: { minutes: 20, ...DINE_IN } }),
        row({ order_id: "under", age: { minutes: 19, ...DINE_IN } }),
        row({ order_id: "at-amber", age: { minutes: 10, ...DINE_IN } }),
        row({ order_id: "under-amber", age: { minutes: 9, ...DINE_IN } }),
      ],
    });
    expect(agesOnScreen()).toEqual([
      "20 minutes, overdue",
      "19 minutes, due soon",
      "10 minutes, due soon",
      "9 minutes, on time",
    ]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §C — `03-F14`'s basis: NO CONFIRM ANCHOR, NO AGE. Never a zero.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 03-F14/00 §5.7 — an order with no age shows none, and never a lie", () => {
  it("draws no badge for a row whose age is null", () => {
    // `02-F9`'s whole inbox is unconfirmed by definition, so this is not an edge case — it is
    // the resting state of one of the counter's two lists.
    list({ orders: [row({ order_id: "W-207", age: null })] });
    expect(agesOnScreen()).toEqual([]);
    // And specifically not the two wrong answers an `??` reaches for: `0 min` (`?? now`) or a
    // fifty-six-year age (`?? 0`). Asserting the absence of the unit catches a badge rendered
    // with any number at all, whatever the arithmetic behind it.
    expect(screen.queryByText("min")).toBeNull();
  });

  it("draws no badge for a row that carries no age field at all", () => {
    // `01-F54` — a host that did not supply the field is not a host that said null, and both
    // degrade to the same honest render: the order is still findable (`C31`), without an age.
    list({ orders: [row({ order_id: "A-014" })] });
    expect(screen.getByText("A-014")).toBeTruthy();
    expect(agesOnScreen()).toEqual([]);
  });

  it("ages the rows that have an anchor while leaving the rest alone, in one list", () => {
    // The mixed list is the real one: `02-F10`'s recall panel holds confirmed orders beside an
    // order the fold has no anchor for. An implementation that bails out of the whole list on
    // the first null, or that back-fills the missing one from its neighbour, fails here.
    list({
      orders: [
        row({ order_id: "A-014", age: { minutes: 7, ...DINE_IN } }),
        row({ order_id: "A-015", age: null }),
        row({ order_id: "A-016", age: { minutes: 21, ...DINE_IN } }),
      ],
    });
    expect(agesOnScreen()).toEqual(["7 minutes, on time", "21 minutes, overdue"]);
    expect(screen.getByText("A-015")).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §D — `27-F12` and commandment 6: the closed vocabulary renders this, not a local chip.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 27-F12 — colour never carries the state alone", () => {
  it("announces the state in words as well as in the number", () => {
    // `27-F12`: *"every status is colour + shape + position + a number"*, machine-enforced as
    // "a status component that accepts a colour prop without a shape prop fails typecheck".
    // A hand-rolled `<span style={{background: red}}>` in `OrderList` would satisfy every other
    // assertion in this file and satisfy neither that FR nor commandment 6. What separates the
    // two is that the shipped `AgeBadge` is an announced `role="status"` carrying a WORD.
    list({
      orders: [
        row({ order_id: "hot", age: { minutes: 30, ...DINE_IN } }),
        row({ order_id: "warm", age: { minutes: 12, ...DINE_IN } }),
        row({ order_id: "cool", age: { minutes: 2, ...DINE_IN } }),
      ],
    });
    const names = agesOnScreen();
    // Three distinct verdicts, each legible with no colour perception whatsoever (`27-F13`:
    // if a screen is unreadable in greyscale it is broken).
    expect(new Set(names.map((n) => n.split(", ")[1]))).toEqual(
      new Set(["overdue", "due soon", "on time"]),
    );
  });

  it("puts the age in the SAME position in every row (27-F4/27-F12)", () => {
    // Position is one of `27-F12`'s four channels and `27-F4` makes a learned position a
    // contract. This cannot measure pixels — happy-dom lays nothing out — but it can measure
    // that the badge occupies the same slot in every row's structure, which is the half a
    // conditional render is most likely to break (e.g. inserting the badge only when abnormal,
    // so the money column shifts as an order ages).
    list({
      orders: [
        row({ order_id: "A-014", age: { minutes: 2, ...DINE_IN } }),
        row({ order_id: "A-015", age: { minutes: 30, ...DINE_IN } }),
      ],
    });
    const indices = screen.queryAllByRole("status").map((badge) => {
      const parent = badge.parentElement;
      return parent === null ? -1 : [...parent.children].indexOf(badge);
    });
    expect(indices).toHaveLength(2);
    expect(new Set(indices).size).toBe(1);
  });
});
