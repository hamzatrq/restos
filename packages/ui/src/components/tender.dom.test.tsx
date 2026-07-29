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

describe("27-F24 — the system computes, staff read", () => {
  it("shows CHANGE, finished, once the tender covers the bill", () => {
    // 1485 due, 2000 tendered → 515 change. The cashier is never asked to do this subtraction:
    // ~60% of this population recognise numbers against 9.5% who can do any arithmetic.
    panel();
    type("2000");
    // The exact rendered string, not a /CHANGE/ match: the word appears on both the label and
    // the value, and a loose matcher would pass on either alone.
    expect(screen.getByText("CHANGE Rs 515")).toBeTruthy();
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
    panel();
    type("1485");
    expect(screen.getByText("CHANGE Rs 0")).toBeTruthy();
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
