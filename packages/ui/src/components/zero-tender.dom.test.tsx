// `02-F48`'s `27-F5` HALF — the surface says why a press was worth nothing, and the control does
// not go inert.
//
// **PROVENANCE, stated because it changes how these assertions should be weighed.** The two
// behavioural suites for `02-F48` and `01-F63` were authored by a separate session from spec text
// (`24 §3`); this file was NOT. It was written by the implementing session, alongside the change,
// and it owes the same independent oracle pass every implementer-authored suite in this repo owes.
// It exists because the ruling's `27-F5` clause is an obligation on the SCREEN and the main-process
// guard cannot discharge it: `apps/pos-electron/src/main/__acceptance__/zero-tender.test.ts` proves
// the ledger is protected and would stay green against a till where pressing `TAKE CASH` on an
// empty pad does nothing visible at all — which is the dead primary control `27-F5` names by name.
//
// ── THE RULING ────────────────────────────────────────────────────────────────────────────────
//
//   02-F48  A `payment.recorded` of zero moves no money, discharges no part of the bill and
//           changes no total. **`27-F5` IS HONOURED BY CONSTRUCTION: THE CONTROL IS NEVER
//           DISABLED, GREYED, MOVED OR HIDDEN.** `TAKE <METHOD>` stays present, labelled,
//           full-size and pressable in every state; what changes is only that an empty entry
//           produces no event. The surface owes the cashier the reason in `27-F12`'s shape — a
//           **word and a number** — where she is already looking, and it must never be a modal.
//   02-F13  A partial is a POSITIVE amount that does not cover, recorded as itself. Untouched.
//   01-F17  A sale is never blocked.
//   27-F4   Controls do not move. (Which is why the reason lands in an EXISTING slot and not in a
//           sentence inserted above the button — an inserted line pushes the primary action down
//           by its own height at the moment the cashier is reaching for it.)
//
// ── THE NEGATIVE CONTROL IS §B AND IT IS THE POINT ────────────────────────────────────────────
//
// An implementation that simply stopped calling `onTender` — or that greyed the button, or that
// refused anything small — passes §A. §B is what separates a guard aimed at a TENDER OF NOTHING
// from a guard aimed at the pad, at the number 0, or at "not enough".

import { paisa } from "@restos/domain";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme";
import { TenderPanel } from "./TenderPanel";

afterEach(cleanup);

const BILL = 224_000;

const panel = (props: Partial<Parameters<typeof TenderPanel>[0]> = {}) =>
  render(
    <ThemeProvider>
      <TenderPanel dueP={paisa(BILL)} onTender={() => {}} {...props} />
    </ThemeProvider>,
  );

const type = (rupees: string): void => {
  for (const d of rupees) fireEvent.click(screen.getByRole("button", { name: d }));
};

const take = (): void => {
  fireEvent.click(screen.getByRole("button", { name: /TAKE CASH/ }));
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE REFUSAL IS VISIBLE, AND THE CONTROL IS NOT.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F48 — a press worth nothing produces a reason, not an event", () => {
  it("an EMPTY pad tenders nothing and says NOTHING ENTERED", () => {
    // THE DEFECT: the empty pad is zero, and this press wrote a permanent `payment.recorded`
    // worth nothing (`01-F1`). MUTATION THIS CATCHES: no guard at all — the shipped behaviour
    // before `02-F48`.
    const onTender = vi.fn();
    panel({ onTender });
    take();

    expect(onTender, "a Rs 0 tender was originated").not.toHaveBeenCalled();
    expect(screen.getByText("NOTHING ENTERED")).toBeTruthy();
  });

  it("says NOTHING DUE — not NOTHING ENTERED — when digits are typed against a Rs 0 bill", () => {
    // The OTHER arm, and the assertion a single message cannot pass. An order with no billable
    // lines has `remainingP === 0`, so `coversBill` is `0 >= 0` and the panel tenders the
    // REMAINDER, also 0 — with real digits on the pad. "The entry is empty" would be a FALSE
    // statement on this screen (`00 §5.7`), and it is what a first draft ships.
    const onTender = vi.fn();
    panel({ onTender, dueP: paisa(0) });
    type("500");
    take();

    expect(onTender).not.toHaveBeenCalled();
    expect(screen.getByText("NOTHING DUE")).toBeTruthy();
    expect(screen.queryByText("NOTHING ENTERED"), "the wrong reason was given").toBeNull();
  });

  it("27-F5 — TAKE CASH is still there, still enabled, before and after the refusal", () => {
    // An inert primary control is `27-F5`'s own failure mode, and `DEC-MONEY-009` already refused
    // the greyed-button shape on this exact surface in favour of a sentence.
    //
    // MUTATION THIS CATCHES: `disabled={tenderP === 0}` — the obvious first draft, which reads as
    // caution and is the thing the FR forbids by name.
    panel();
    const before = screen.getByRole("button", { name: /TAKE CASH/ }) as HTMLButtonElement;
    expect(before.disabled).toBe(false);
    take();
    const after = screen.getByRole("button", { name: /TAKE CASH/ }) as HTMLButtonElement;
    expect(after.disabled, "the primary control went inert").toBe(false);
  });

  it("27-F12/02-F37 — the reason is a WORD and a NUMBER in place, never a modal", () => {
    // `02-F37`'s standing rule for this surface: nothing goes between the cashier and the
    // customer. And `27-F4`: the control does not move, so the reason takes a slot that was
    // already on the screen rather than an inserted line.
    const { container } = panel();
    const controlsBefore = container.querySelectorAll("button").length;
    take();

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText("NOTHING ENTERED")).toBeTruthy();
    // The NUMBER half: the tender that would have been recorded, stated as what it is.
    expect(screen.getAllByText("Rs 0").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("button").length, "a control appeared or vanished").toBe(
      controlsBefore,
    );
  });

  it("a keystroke clears the reason — it is about the entry as it was when pressed", () => {
    // `00 §5.7`: `NOTHING ENTERED` standing over a pad she has started typing into is a false
    // statement one keystroke old, and the readout has to be back to REMAINING before the next
    // press. MUTATION THIS CATCHES: a latched flag, which also survives §B1 by accident.
    panel();
    take();
    expect(screen.getByText("NOTHING ENTERED")).toBeTruthy();
    type("5");

    expect(screen.queryByText("NOTHING ENTERED")).toBeNull();
    expect(screen.getByText("REMAINING")).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE NEGATIVE CONTROL. `01-F17` lives here.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F17 / 02-F13 — everything that IS a tender still lands", () => {
  it("ONE RUPEE against a Rs 2,240 bill is a partial and it settles", () => {
    // The sharpest line. MUTATION THIS CATCHES: `!coversBill`, `amount < 100`, or any "that
    // cannot be right" guard — each turns the ruling into the `01-F17` break it avoids.
    const onTender = vi.fn();
    panel({ onTender });
    type("1");
    take();

    expect(onTender).toHaveBeenCalledWith({ amountP: 100, method: "cash" });
    expect(screen.queryByText("NOTHING ENTERED")).toBeNull();
  });

  it("a full tender lands and the pad clears, exactly as before", () => {
    const onTender = vi.fn();
    panel({ onTender });
    type("2240");
    take();

    expect(onTender).toHaveBeenCalledWith({ amountP: BILL, method: "cash" });
    // The pad is reset for the next order — the shipped behaviour, asserted so the new branch
    // cannot have skipped it.
    expect(screen.getByText("REMAINING")).toBeTruthy();
  });

  it("a second press after a refused one still settles — nothing latches", () => {
    // `01-F17` one level up: whatever the refusal did to the screen, the till must keep working.
    const onTender = vi.fn();
    panel({ onTender });
    take();
    type("2240");
    take();

    expect(onTender).toHaveBeenCalledTimes(1);
    expect(onTender).toHaveBeenCalledWith({ amountP: BILL, method: "cash" });
  });

  it("02-F13 — a remainder of ZERO after an earlier tender is NOT a fresh Rs 0 settlement", () => {
    // The split's end state, and the case that makes `tenderP` the right thing to test rather
    // than the pad: the first tender covered the bill, so `remainingP` is 0 and a further press
    // would record nothing. It is refused for being nothing — which is what the host surface
    // (`Counter.tsx`) also says one branch up, off the same two numbers.
    const onTender = vi.fn();
    panel({ onTender, takenP: paisa(BILL) });
    take();

    expect(onTender).not.toHaveBeenCalled();
    expect(screen.getByText("NOTHING DUE")).toBeTruthy();
  });
});
