// ACCEPTANCE — `02-F50`: the exact amount is ONE press, and the system supplies the number.
//
// PROVENANCE: **authored from spec text only** (`24 §3`), by a session that has written no
// production code on this branch. `02-F50` landed in `specs/02-pos-app.md` in the commit before
// this one, and every assertion below names the clause it owns.
//
// ── THE DEFECT, COUNTED ─────────────────────────────────────────────────────────────────────
//
// `21 §4` makes **settlement ≤ 4 taps** a merge criterion, not an aspiration. The commonest
// settlement at a counter is the customer paying what is owed, ~60 acts a shift, and today it
// costs: Pay tab, then one press per digit, then `TAKE CASH` — six for `Rs 1,010`. The panel
// already computes the figure (`tenderP = coversBill ? remainingP : enteredP`, so it tenders the
// REMAINDER whenever the entry covers the bill) and then asks the cashier to key that same number
// back in. `27-F24` exists because ~60% of this population recognise numbers against **9.5% who
// can do any arithmetic**; making her re-enter a number the system is holding is that FR read
// backwards.
//
// ── HOW THE TEST FINDS THE CONTROL, AND WHY THAT IS THE CONTRACT RATHER THAN A CONVENIENCE ──
//
// `02-F50` requires the target to **state the amount as a numeral on the control itself**
// (`27-F24`, `27-F23`'s `Rs`-first format), so a cashier reads what she is about to record
// instead of pressing a word and trusting it — and so an operator who reads no English can find
// it at all (`21 §5`, `00 §5.6`). That is what makes `byName(/Rs 1,010/)` a spec assertion rather
// than a coupling to a label: **the number on the control IS the requirement.** No English word is
// pinned anywhere in this file, so an implementation may call it whatever it likes.
//
// ── WHAT THIS FILE DELIBERATELY DOES NOT ASSERT ─────────────────────────────────────────────
//
// **Denomination tiles (500 / 1000 / 2000).** `02-F50` names them and rules on them explicitly:
// *"NOT ruled here … nothing in this FR requires or forbids them."* A suite that required them
// would be inventing a `27-F4` addition to the highest-consequence row on the counter; a suite
// that forbade them would pre-empt a founder call. So: silence, on purpose.

import { paisa } from "@restos/domain";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme";
import { formatPaisa } from "./MoneyValue";
import { TenderPanel } from "./TenderPanel";

afterEach(cleanup);

/** Rs 1,010 — `restaurant-os.md`'s own four-tile counter run, and four digits to key by hand. */
const BILL = 101_000;

const panel = (props: Partial<Parameters<typeof TenderPanel>[0]> = {}) =>
  render(
    <ThemeProvider>
      <TenderPanel dueP={paisa(BILL)} onTender={() => {}} {...props} />
    </ThemeProvider>,
  );

const type = (rupees: string): void => {
  for (const d of rupees) fireEvent.click(screen.getByRole("button", { name: d }));
};

/**
 * The one control on the panel that carries a given money figure in its own accessible name.
 *
 * A keypad key is `1`, `0`, `C`; `TAKE CASH` names a method; the readouts are not controls. So a
 * BUTTON whose name contains `Rs 1,010` is unambiguous, and it is unambiguous *because* `02-F50`
 * requires the amount to be on the control.
 */
const controlsNaming = (amountP: number): HTMLElement[] => {
  const money = formatPaisa(paisa(amountP));
  return screen
    .getAllByRole("button")
    .filter((el) => (el.getAttribute("aria-label") ?? el.textContent ?? "").includes(money));
};

const exactTarget = (amountP: number): HTMLElement => {
  const found = controlsNaming(amountP);
  const [first] = found;
  if (first === undefined) {
    throw new Error(
      `02-F50 BROKEN: no control on the Pay surface carries ${formatPaisa(paisa(amountP))}. ` +
        "21 §4 budgets settlement at <= 4 taps and settling exactly costs six; 02-F50 requires a " +
        "single target that tenders the remaining balance and STATES the amount as a numeral on " +
        "itself, so the cashier reads what she is about to record (27-F24, 27-F23).",
    );
  }
  if (found.length > 1) {
    throw new Error(
      `02-F50: ${found.length} controls carry ${formatPaisa(paisa(amountP))}. The exact-amount ` +
        "target must be ONE target — 27-F4 makes the highest-consequence row on the counter " +
        "positional memory, and two controls that record the same money are two habits.",
    );
  }
  return first;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — ONE PRESS, AND IT RECORDS THE EXACT AMOUNT.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F50 — settling exactly is a single press (21 §4)", () => {
  it("tenders the whole bill from an untouched pad, in one press and no confirm", () => {
    // Aimed at: the shipped panel, where the only route to `Rs 1,010` is `1` `0` `1` `0` `TAKE
    // CASH` — five presses inside the panel and six from the Order surface, against `21 §4`'s
    // budget of four for the whole settlement.
    //
    // `toHaveBeenCalledTimes(1)` after ONE click is the tap-budget assertion: a target that only
    // filled the pad and left `TAKE CASH` to be pressed would look like a fix, read like a fix,
    // and cost two presses — halving the saving on ~60 acts a shift.
    const onTender = vi.fn();
    panel({ onTender });

    fireEvent.click(exactTarget(BILL));

    expect(onTender).toHaveBeenCalledTimes(1);
    expect(onTender).toHaveBeenCalledWith({ amountP: BILL, method: "cash" });
  });

  it("carries the SELECTED method, from `domain`'s closed set (02-F12)", () => {
    // `02-F50` adds a route to the primary act; it does not add a method or bypass the choice of
    // one. A target hard-wired to cash would silently mis-bucket every card settlement in
    // `02-F23`'s reconciliation, which is the report a cashier is measured against at close.
    const onTender = vi.fn();
    panel({ onTender });

    fireEvent.click(screen.getByRole("button", { name: "RAAST" }));
    fireEvent.click(exactTarget(BILL));

    expect(onTender).toHaveBeenCalledWith({ amountP: BILL, method: "raast" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE `02-F13` REMAINDER, NEVER THE GROSS BILL.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F50 — a part-paid bill settles for what is LEFT", () => {
  it("tenders the remainder after an earlier tender, not the total", () => {
    /**
     * Rs 1,010 billed, Rs 400 already taken by card → the exact amount is **Rs 610**.
     *
     * Aimed at the mutant a first draft ships: wiring the target to `dueP`. It is invisible on
     * every un-split order, it over-records by the earlier tender on every split one, and
     * `01-F30`'s conservation would then read the order as overpaid for the rest of time in a
     * ledger `01-F1` forbids correcting in place. `02-F13` calls a split *"what happens when the
     * first tender does not cover the bill"* — the ordinary case, not a mode.
     */
    const onTender = vi.fn();
    panel({ onTender, takenP: paisa(40_000) });

    fireEvent.click(exactTarget(61_000));
    expect(onTender).toHaveBeenCalledWith({ amountP: 61_000, method: "cash" });
  });

  it("names the REMAINDER on the control, so the number she reads is the number recorded", () => {
    // The other half of the same mutant: a control that records 610 while reading `Rs 1,010` is
    // worse than either error alone, because `27-F24` makes the printed figure the cashier's only
    // check on the machine. `00 §5.7` — a surface reports what is true.
    panel({ takenP: paisa(40_000) });

    expect(
      controlsNaming(BILL),
      "02-F50 BROKEN: a control still reads the GROSS bill on a part-paid order. The exact " +
        "amount is the 02-F13 remainder and the control states the amount it will record.",
    ).toEqual([]);
    expect(controlsNaming(61_000)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — `02-F48` IS NOT BYPASSED. A second route to the act must not be a route around the guard.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 02-F50 / 02-F48 — a tender of nothing is still not a sale", () => {
  it("records NOTHING when the bill is already covered", () => {
    /**
     * The whole bill is already taken, so the remainder is zero — `paySurface` normally shows the
     * `DEC-MONEY-009` branch here, but `TenderPanel` is reachable in this state through
     * `02-F13`'s split path and through a projection that is a moment stale, and `02-F48` was
     * ruled for exactly that reachability.
     *
     * Aimed at the obvious implementation: a button wired straight to `onTender(remainingP)`.
     * It passes every assertion in §A and §B and writes a **permanent** `payment.recorded` worth
     * `amount_paisa: 0` into an append-only ledger on one accidental press — the defect `02-F48`
     * closed, re-opened one control over. A second route to the primary act must never be a route
     * around the guard.
     */
    const onTender = vi.fn();
    panel({ onTender, takenP: paisa(BILL) });

    // ⚠ **PRESENCE IN THIS STATE IS DELIBERATELY NOT ASSERTED**, and the omission is stated so a
    // reviewer can reject it: with nothing owed the host renders a different branch entirely
    // (`Counter.tsx`'s `DEC-MONEY-009` sentence), so requiring an exact target here would be
    // pinning a state the product may never route to. `02-F48`'s presence obligation on the
    // PRIMARY control is owned by `zero-tender.dom.test.tsx` and is untouched.
    for (const el of controlsNaming(0)) fireEvent.click(el);
    // `TAKE CASH` is always on the panel, so this half can never pass vacuously: if the exact
    // target is absent, the guard is still exercised through the route that is always there.
    fireEvent.click(screen.getByRole("button", { name: /TAKE CASH/ }));
    expect(
      onTender,
      "02-F48 BROKEN: a Rs 0 payment was recorded. 01-F1 makes it permanent and 02-F23's " +
        "reconciliation carries it for ever.",
    ).not.toHaveBeenCalled();
  });

  it("still records a REAL amount on the same bill — the guard is on nothing, not on the route", () => {
    // The negative control for §C: an implementation that made the exact target inert whenever
    // anything had been taken would pass the test above and break §B. This is the branch that
    // separates "refuses a tender of nothing" from "refuses a part-paid order".
    const onTender = vi.fn();
    panel({ onTender, takenP: paisa(100) });

    fireEvent.click(exactTarget(BILL - 100));
    expect(onTender).toHaveBeenCalledWith({ amountP: BILL - 100, method: "cash" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — THE PAD SURVIVES. `02-F50` adds a route; it removes nothing.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 02-F50 — the keypad path is untouched (02-F12, 02-F13, 27-F4, 27-F5)", () => {
  it("still records a PARTIAL tender typed on the pad (01-F17)", () => {
    // `01-F17` — a sale is never blocked, and a short tender is a real payment recorded as
    // itself. An "exact only" panel would refuse the case `02-F13` exists for.
    const onTender = vi.fn();
    panel({ onTender });
    type("400");
    fireEvent.click(screen.getByRole("button", { name: /TAKE CASH/ }));

    expect(onTender).toHaveBeenCalledWith({ amountP: 40_000, method: "cash" });
  });

  it("still computes CHANGE on an over-tender (02-F12, 27-F24)", () => {
    // Rs 2,000 handed over against Rs 1,010 → Rs 990 back, and the cashier is never asked to
    // derive it. This is the reason the pad cannot be replaced by an exact-amount target.
    panel();
    type("2000");
    expect(screen.getByText("Rs 990")).toBeTruthy();
    expect(screen.getByText("CHANGE")).toBeTruthy();
  });

  it("keeps `TAKE <METHOD>` present, pressable and labelled (27-F5, 27-F4)", () => {
    // `02-F50` says in terms that it *"does not move, disable or re-rank `TAKE <METHOD>` or the
    // method row"*. An inert primary control is `27-F5`'s own failure mode, and `02-F48`'s
    // ruling on this very button is that it stays pressable in every state.
    panel();
    const take = screen.getByRole("button", { name: /TAKE CASH/ });
    expect(take.hasAttribute("disabled")).toBe(false);
    for (const method of ["CASH", "CARD", "RAAST", "KHATA", "AGGREGATOR"]) {
      expect(
        screen.getAllByRole("button", { name: method }).length,
        `27-F4: the ${method} method button left the row`,
      ).toBe(1);
    }
  });
});
