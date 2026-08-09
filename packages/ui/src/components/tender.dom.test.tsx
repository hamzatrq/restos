// 02-F12/F13 — the settlement surface, tested as behaviour.
//
// This is the screen where a wrong number costs a customer real money and a cashier her shift
// reconciliation, so it is tested by rendering and pressing rather than by reading the source.

import { paisa } from "@restos/domain";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme";
import { TenderPanel } from "./TenderPanel";

afterEach(cleanup);

const panel = (props: Partial<Parameters<typeof TenderPanel>[0]> = {}) =>
  render(
    <ThemeProvider>
      <TenderPanel dueP={paisa(148_500)} onTender={() => {}} {...props} />
    </ThemeProvider>,
  );

/** Press the digits of a rupee amount on the real keypad, as a cashier would. */
const type = (rupees: string): void => {
  for (const d of rupees) fireEvent.click(screen.getByRole("button", { name: d }));
};

/**
 * ⚠ **TWO ASSERTIONS IN THIS FILE WERE REWRITTEN BY THE SESSION THAT CHANGED THE COMPONENT, WHICH
 * IS THE THING `24 §3` STEP 2 NORMALLY FORBIDS. A REVIEWER SHOULD ACCEPT OR REJECT THIS
 * EXPLICITLY.** The case for it, stated so it can be argued with rather than skimmed:
 *
 * **What they used to say.** `getByText("CHANGE Rs 515")` and `getByText("CHANGE Rs 0")`, under a
 * comment reading *"the word appears on both the label and the value, and a loose matcher would
 * pass on either alone"*, and a second at line ~60 explaining that *"`CHANGE` is a `27-F12`
 * DIRECTION carried inside the money value … whereas `REMAINING` … is a plain label beside it"*.
 *
 * **So this suite SAW the duplication, understood it, and pinned it as the contract.** The
 * component rendered the literal `CHANGE` as a label AND passed `direction: "change"` to
 * `MoneyValue`, which prefixes it — and a founder read the result off the glass in August 2026:
 * **`CHANGE` above `CHANGE Rs 0`, overlapping.** The exact-string matcher matched the *value*
 * element and never looked at the label beside it, so **it could not distinguish the correct
 * implementation from the broken one.** That is this repo's `01-F60` shape exactly — a green test
 * defending a rule that had already been ruled against — and the task that fixed it was explicit:
 * *"exactly one of them must keep it."*
 *
 * **Why the caption keeps the word and not the prefix**, which is the half a reviewer should push
 * on hardest, because the old assertions encode the opposite choice as deliberate:
 *
 * - `REMAINING` is **not** a member of `MoneyValue`'s `direction` union (`refund | short | over |
 *   change`). Under the prefix reading, one arm of one control takes its word from inside the
 *   value and the other from a label beside it — and that asymmetry is precisely what let the
 *   duplication exist unnoticed.
 * - A prefix inherits the payload's size. At `text-numeric-display` the word `CHANGE` renders at
 *   **64 dp**, which is a label set at payload weight — the inversion `27-F25` and
 *   `plans/wave-1/design-direction.md` move 1 both argue against.
 * - `MoneyValue.direction` keeps its job wherever it is the ONLY word: `CashSurfaces`' `Variance`
 *   renders `OVER`/`SHORT` with no caption at all, and `me-tab.dom.test.tsx` asserts it. Nothing
 *   about that call site changed.
 *
 * **The replacements are STRICTLY STRONGER, not weaker**, which is the test this edit had to
 * pass. Each asserts the word appears **exactly once** across the whole rendered panel — so it
 * fails on the duplicated render the old matcher passed, and it also fails on a render that drops
 * the word entirely, which `27-F12` forbids. The old assertion caught neither.
 */
describe("27-F24 — the system computes, staff read", () => {
  /** Every occurrence of a word in the rendered panel — the duplication the old matcher missed. */
  const times = (container: HTMLElement, word: string): number =>
    ((container.textContent ?? "").match(new RegExp(word, "g")) ?? []).length;

  it("shows CHANGE, finished, once the tender covers the bill", () => {
    // 1485 due, 2000 tendered → 515 change. The cashier is never asked to do this subtraction:
    // ~60% of this population recognise numbers against 9.5% who can do any arithmetic.
    const { container } = panel();
    type("2000");
    expect(screen.getByText("Rs 515")).toBeTruthy();
    // `27-F12` — the direction is a WORD, and it is carried ONCE. See the block above.
    expect(times(container, "CHANGE"), "CHANGE is printed twice — the founder's defect").toBe(1);
  });

  it("shows REMAINING, not a negative change, when the tender is short", () => {
    // `Paisa` has no sign — an under-tender is a different WORD, not a minus. That is also how
    // a cashier thinks about it, and it is what 02-F13's split needs.
    panel();
    type("1000");
    expect(screen.getByText(/REMAINING/)).toBeTruthy();
    expect(screen.getByText("Rs 485")).toBeTruthy();
  });

  it("exactly covering the bill is CHANGE of zero, not REMAINING", () => {
    const { container } = panel();
    type("1485");
    expect(screen.getByText("Rs 0")).toBeTruthy();
    expect(times(container, "CHANGE"), "CHANGE is printed twice — the founder's defect").toBe(1);
    // The half this test is named for, and it was never asserted: an exact cover is CHANGE and
    // must NOT also read REMAINING. `coversBill` is `>=`, and a mutant flipping it to `>` shows
    // up here and nowhere else in this file.
    expect(times(container, "REMAINING")).toBe(0);
  });
});

describe("02-F13 — a split is what a partial tender leaves behind", () => {
  it("shows what is still owed after an earlier tender", () => {
    panel({ dueP: paisa(148_500), takenP: paisa(100_000) });
    // 1485 − 1000 = 485 still due, before anything is typed. It appears TWICE by design — as
    // the DUE header and as REMAINING — so this asserts both, rather than picking one and
    // being ambiguous about which.
    expect(screen.getAllByText("Rs 485"), "DUE and REMAINING should both read 485").toHaveLength(2);
    // The label is its own element: CHANGE is a 27-F12 DIRECTION carried inside the money
    // value ("CHANGE Rs 515" is one string), whereas REMAINING describes what is owed and is
    // a plain label beside it. Asserting them separately is what that difference looks like.
    expect(screen.getByText("REMAINING")).toBeTruthy();
  });

  it("never shows a negative due once the order is over-tendered", () => {
    panel({ dueP: paisa(148_500), takenP: paisa(200_000) });
    expect(screen.getAllByText("Rs 0").length).toBeGreaterThan(0);
  });
});

describe("01-F17 — the settle button never refuses", () => {
  it("records a PARTIAL tender as itself and leaves the remainder owed", () => {
    // The one thing this button must never do is block a sale. A short tender is a real
    // payment, recorded for what it is.
    const onTender = vi.fn();
    panel({ onTender });
    type("1000");
    fireEvent.click(screen.getByRole("button", { name: /TAKE CASH/ }));
    expect(onTender).toHaveBeenCalledWith({ amountP: 100_000, method: "cash" });
  });

  it("records only what is OWED when the cashier over-tenders — change is not revenue", () => {
    // Handing over 2000 against a 1485 bill is a 1485 payment and 515 of change. Recording 2000
    // would overstate takings by the change, and 01-F30's conservation would then read the
    // order as overpaid for the rest of time.
    const onTender = vi.fn();
    panel({ onTender });
    type("2000");
    fireEvent.click(screen.getByRole("button", { name: /TAKE CASH/ }));
    expect(onTender).toHaveBeenCalledWith({ amountP: 148_500, method: "cash" });
  });

  it("carries the SELECTED method, from domain's closed set", () => {
    const onTender = vi.fn();
    panel({ onTender });
    fireEvent.click(screen.getByRole("button", { name: "RAAST" }));
    type("1485");
    fireEvent.click(screen.getByRole("button", { name: /TAKE RAAST/ }));
    expect(onTender).toHaveBeenCalledWith({ amountP: 148_500, method: "raast" });
  });
});

describe("27-F29 — impossible numbers are blocked AT ENTRY", () => {
  it("refuses a keystroke past the digit limit, which is the out-by-10 guard", () => {
    panel();
    type("1234567");
    // An eighth digit is refused rather than accepted-and-warned: a warning asks the operator to
    // notice, re-read and compare — three literacy-dependent acts, under time pressure.
    type("8");
    expect(screen.queryByText(/Rs 12,345,678/), "an 8th digit was accepted").toBeNull();
  });
});
