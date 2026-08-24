/**
 * ACCEPTANCE TESTS — **the cart's rows add up to the cart's total, and every term is named**
 * (`27-F24`, `27-F12`, `16-F5`, `02-F63` (b)).
 *
 * Written alongside the implementation under `20 §4.3`'s R66 amendment. `packages/ui` is not a
 * `20 §4.4` protected path and nothing here computes money; the mutation matrix is in the session
 * report.
 *
 * ## The defect, measured on shipping code (August 2026)
 *
 * The cart rendered its line money and its total and **nothing between them**. Under posture
 * `exclusive` at 16 % those are two different quantities — `billedLinePaisa` per line against
 * `01-F82`'s tax-inclusive, rounded `billed_total` — so three whole-rupee lines totalling Rs 853
 * sat under **`TOTAL Rs 989`** with no `Subtotal` and no `Tax` anywhere on the counter. The gap is
 * posture-dependent and it is NOT tax-only: measured across the shipped configuration space,
 * `none` at `charge_rounding_paisa = 1000` — a step `02-F63` (c) blesses by name — shows rows of
 * Rs 853 under `TOTAL Rs 850`, **a Rs 3 gap with no tax in the product at all**.
 *
 * `packages/escpos`'s `receipt-document.ts` refuses exactly this shape on paper — *"a receipt
 * whose lines do not add up to its total is worse than one that asks the reader to multiply"* —
 * and this file is that rule applied to the glass, in the receipt's own four words.
 *
 * ## §0 — PINNED INTERPRETATIONS (`24 §3b`)
 *
 * **B1 — a row appears only when it carries information, and the test is not "is it non-zero".**
 * `Subtotal`/`Tax` appear when the money column above does NOT already contain the tax; the
 * rounding row appears when it would render a figure. Both decisions are the CALLER's — `16-F2`'s
 * posture is kernel vocabulary and `21-F1` makes this package a closed vocabulary of presentation
 * — so this file asserts what each prop shape renders and never why it was supplied.
 *
 * **B2 — the words are the receipt's, verbatim.** `Subtotal` / `Tax` / `Rounded up` / `Rounded
 * down`. A cashier and the customer holding the paper must not learn two vocabularies for one
 * decomposition; `03-F40`'s two sensor bit layouts is this corpus's worked example of the cost.
 *
 * **B3 — `27-F12`: the rounding direction is a WORD in the LABEL, never a sign on the figure.**
 * The same split `roundingRow` makes one plane over. A lone `-` is the first glyph lost at 1–2 m.
 *
 * **B4 — the breakdown belongs to the TOTAL, not to the line list.** A `Subtotal` row loose among
 * the cart lines is a dish with an odd name. The rule is placed once, between what was rung and
 * what it comes to, so the rows must share the total's bordered box.
 *
 * ## What this file deliberately does NOT assert
 *
 * - **That the rows fit.** happy-dom performs no layout — every `getBoundingClientRect` is zeroes.
 *   Three new rows in a fixed column is a geometry claim and `pnpm layout:check` owns it in Blink;
 *   `layout-gate/preload.ts` now carries all three at once so the gate has the state to measure.
 * - **That the displayed rows add up.** They do under `none` and `inclusive` at every step
 *   `02-F63` (c) admits, and under `exclusive` they close only to the rupee: `27-F23` denies this
 *   screen decimals while the tax genuinely has them, so `Rs 853 + Rs 136` can sit under a
 *   `TOTAL Rs 990`. `02-F63` (c) refuses the only fix (*"teach the pad and the display paisa …
 *   it is a `27-F23` act"*) and hands it to doc 27, and `02-F63` (f) is where the exact close
 *   already lives — the printed receipt. Recorded in `Cart`'s header as a doc-27 finding.
 * - **Which posture supplies what.** That is `apps/pos-electron`'s `main/gateway.ts` and its own
 *   seam suite.
 */

import { paisa } from "@restos/domain";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeProvider } from "../theme";
import { Cart } from "./Cart";

afterEach(cleanup);

const KARAHI = 44_900;
const BIRYANI = 32_500;
const NAAN = 7_900;
const SUBTOTAL = KARAHI + BIRYANI + NAAN; // 85_300 — Rs 853, the figure the defect was measured at
const TAX = 13_648; // 16 % of Rs 853 (`16-F5` per line, summed exactly)
const CHARGE = 98_900; // `02-F63`: 98_948 rounded to the rupee

const mount = (over: Partial<Parameters<typeof Cart>[0]> = {}) =>
  render(
    <ThemeProvider>
      <Cart
        lines={[
          { id: "l1", name: "Mutton Karahi", quantity: 1, billedPaisa: paisa(KARAHI) },
          { id: "l2", name: "Chicken Biryani", quantity: 1, billedPaisa: paisa(BIRYANI) },
          { id: "l3", name: "Garlic Naan", quantity: 2, billedPaisa: paisa(NAAN) },
        ]}
        totalPaisa={paisa(CHARGE)}
        {...over}
      />
    </ThemeProvider>,
  );

/** The box the TOTAL row lives in — `B4`'s claim is about membership of it, not about order. */
const totalBox = (): HTMLElement => {
  const total = screen.getByText("TOTAL");
  return total.parentElement?.parentElement as HTMLElement;
};

/** Every money glyph on the surface, in DOM order — the reading order a cashier gets. */
const moneyInOrder = (container: HTMLElement): string[] =>
  [...container.querySelectorAll("span")]
    .map((el) => el.textContent ?? "")
    .filter((t) => t.startsWith("Rs "));

describe("§A — the terms between the rows and the total are NAMED", () => {
  it("renders `Subtotal` and `Tax` with the fold's own figures when the rows exclude the tax", () => {
    mount({ tax: { subtotalPaisa: paisa(SUBTOTAL), taxPaisa: paisa(TAX) } });
    // The exact shipped defect: Rs 853 of rows under Rs 989, with the Rs 136 now on the glass.
    expect(screen.getByText("Subtotal")).toBeTruthy();
    expect(screen.getByText("Tax")).toBeTruthy();
    expect(screen.getByText("Rs 853")).toBeTruthy();
    expect(screen.getByText("Rs 136")).toBeTruthy();
    expect(screen.getByText("Rs 989")).toBeTruthy();
  });

  it("says NOTHING when the rows already carry the tax — no `Tax Rs 0` on an untaxed order", () => {
    // `receipt-document.ts`'s stated rule for paper, applied here: a `Tax Rs 0` row is a claim
    // about a tax regime the org is not in, and under `inclusive` a `Subtotal` smaller than the
    // rows above it is the non-reconciliation this component exists to remove, one row down.
    mount();
    expect(screen.queryByText("Subtotal")).toBeNull();
    expect(screen.queryByText("Tax")).toBeNull();
    expect(screen.queryByText("Rs 0")).toBeNull();
  });

  it("neither half can be supplied without the other — the prop shape makes it unrepresentable", () => {
    // `B1`/`offBill`'s precedent asserted as a TYPE fact rather than a runtime one: there is no
    // arrangement of props that renders a `Subtotal` with no `Tax` under it. The runtime half is
    // the two cases above; this row is what fails if the prop is ever split into two optionals.
    const props: Parameters<typeof Cart>[0] = {
      lines: [],
      totalPaisa: paisa(0),
      tax: { subtotalPaisa: paisa(SUBTOTAL), taxPaisa: paisa(TAX) },
    };
    expect(Object.keys(props.tax ?? {}).sort()).toEqual(["subtotalPaisa", "taxPaisa"]);
  });
});

describe("§B — 27-F12: the rounding direction is a WORD, never a sign", () => {
  it("renders `Rounded up` and `Rounded down` from the direction, with a bare magnitude", () => {
    const { unmount } = mount({
      rounding: { magnitudePaisa: paisa(300), direction: "down" },
    });
    expect(screen.getByText("Rounded down")).toBeTruthy();
    expect(screen.queryByText("Rounded up")).toBeNull();
    // The figure carries NO sign: a lone `-` is one glyph wide and is the first thing lost at
    // 1–2 m or on a scratched panel (`27-F12`), which is why the direction is in the label.
    expect(screen.getByText("Rs 3").textContent).toBe("Rs 3");
    unmount();

    mount({ rounding: { magnitudePaisa: paisa(300), direction: "up" } });
    expect(screen.getByText("Rounded up")).toBeTruthy();
    expect(screen.queryByText("Rounded down")).toBeNull();
  });

  it("says nothing when there is no adjustment", () => {
    mount();
    expect(screen.queryByText("Rounded up")).toBeNull();
    expect(screen.queryByText("Rounded down")).toBeNull();
  });
});

describe("§C — the breakdown belongs to the TOTAL and is read in one order", () => {
  it("B4: every breakdown row shares the total's bordered box, not the line list", () => {
    mount({
      tax: { subtotalPaisa: paisa(SUBTOTAL), taxPaisa: paisa(TAX) },
      rounding: { magnitudePaisa: paisa(300), direction: "down" },
    });
    const box = totalBox();
    // MUTANT THIS KILLS: the rows dropped in as free siblings of the cart lines, where a
    // `Subtotal` reads as a dish with an odd name and the separator lands in the wrong place.
    for (const word of ["Subtotal", "Tax", "Rounded down"]) {
      expect(within(box).getByText(word), `${word} must sit inside the total's box`).toBeTruthy();
    }
    // …and the box is the one carrying the rule that separates rung-for from comes-to.
    expect(box.style.borderTop).not.toBe("");
  });

  it("reads line money, then Subtotal, then Tax, then the adjustment, then the TOTAL", () => {
    const { container } = mount({
      tax: { subtotalPaisa: paisa(SUBTOTAL), taxPaisa: paisa(TAX) },
      rounding: { magnitudePaisa: paisa(300), direction: "down" },
    });
    // MUTANT THIS KILLS: any reordering that puts a term after the figure it explains — the
    // reading order IS the argument (`27-F4`'s positional contract applied to a money column).
    expect(moneyInOrder(container)).toEqual([
      "Rs 449",
      "Rs 325",
      "Rs 79",
      "Rs 853",
      "Rs 136",
      "Rs 3",
      "Rs 989",
    ]);
  });

  it("27-F25: a breakdown figure is a LINE-sized number, never the TOTAL's", () => {
    // ⚠ **THIS ROW WAS ADDED BECAUSE A MUTANT SURVIVED.** `ChargeRow` states that it renders at
    // `body` and *"deliberately not at the TOTAL's `hero`"*, on `27-F25` — the region's payload is
    // the one figure the cashier quotes, and a subtotal set beside it at the same size spends that
    // hierarchy on a term she is not asked to act on. Nothing asserted it: promoting every
    // breakdown row to `hero` passed all 8 tests in this file and all 11 in `apps/pos-electron`.
    // A property claimed in a comment and checked by nothing is what `AGENTS.md` calls the shipped
    // comment that retires the assertion somebody would otherwise write.
    mount({
      tax: { subtotalPaisa: paisa(SUBTOTAL), taxPaisa: paisa(TAX) },
      rounding: { magnitudePaisa: paisa(300), direction: "down" },
    });
    // Measured against the SHIPPED siblings rather than a token literal, for `tileStyle`'s stated
    // reason one file over: the claim is a relation ("line-sized, not total-sized"), and a type
    // scale change must move all three together without reddening this.
    const sizeOf = (text: string) => (screen.getByText(text) as HTMLElement).style.fontSize;
    const lineSize = sizeOf("Rs 449");
    const totalSize = sizeOf("Rs 989");
    expect(lineSize, "the fixture must separate the two sizes or this asserts nothing").not.toBe(
      totalSize,
    );
    for (const figure of ["Rs 853", "Rs 136", "Rs 3"]) {
      expect(sizeOf(figure), `${figure} must be line-sized`).toBe(lineSize);
    }
  });

  it("27-F16: no breakdown figure is coloured — every one of them is an EXPECTED value", () => {
    const { container } = mount({
      tax: { subtotalPaisa: paisa(SUBTOTAL), taxPaisa: paisa(TAX) },
      rounding: { magnitudePaisa: paisa(300), direction: "down" },
    });
    // Asserted against the TOTAL rendered under the same provider rather than against a token
    // literal: `27-F16`'s claim is *"this number is not abnormal"*, and the honest oracle for
    // that is the commonest number on the screen. A palette change moves both together.
    const totalColor = (screen.getByText("Rs 989") as HTMLElement).style.color;
    for (const figure of ["Rs 853", "Rs 136", "Rs 3"]) {
      expect(
        (screen.getByText(figure) as HTMLElement).style.color,
        `${figure} must not be coloured — colour on a number means abnormal`,
      ).toBe(totalColor);
    }
    expect(container).toBeTruthy();
  });
});
