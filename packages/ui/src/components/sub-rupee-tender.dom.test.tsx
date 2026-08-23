// THE ASSERTION THAT WAS MISSING — **what the glass renders, against what the pad can produce.**
//
// Written alongside the fix under `plans/v0.md`'s R66.
//
// ── WHY THIS FILE EXISTS, AND IT IS A TEST-AUTHORSHIP FINDING BEFORE IT IS A SUITE ────────────
//
// `apps/pos-electron/src/main/__acceptance__/tax-on-the-bill.test.ts` §E already iterated
// `charge_rounding_paisa` over `["1", "100", "1000"]` and asserted, for each, that tendering the
// projected due settles the bill. It passed at step 1 — and the human path was broken there,
// because it compared `alreadySettled(pay_total = due)` against the **raw projected number** and
// never against what a cashier is SHOWN or what she can KEY. **A guard built correctly and aimed
// one case away**, which is this project's most-recorded test defect (AGENTS.md, the round-3 law).
//
// Measured on shipping code, `exclusive` 16 % over one Rs 404 line at `charge_rounding_paisa = 1`:
//
//     due                 46_864 paisa
//     the glass shows     "Rs 468"        <- `MoneyValue` -> `formatPaisa` -> `rupeesFromPaisa`
//     keying 4-6-8 gives  46_800 paisa    <- the pad multiplies a rupee entry by 100
//     covers the bill?    NO
//     the readout says    "REMAINING Rs 0" on a bill 64 paisa short
//
// The cashier keys exactly what she is shown, the bill never settles, and the Pay surface then
// reads a due of zero for ever. `02-F63` (c) blessed that granularity **by name** until this round.
//
// ── THE FRs ───────────────────────────────────────────────────────────────────────────────────
//
//   02-F63 (c)  the granularity is layer-2 configuration — **and, as amended August 2026, it must
//               be a whole number of rupees**, because of exactly what §A measures below.
//   02-F63 (f)  SHOWING paisa and CHARGING paisa are separable: paper may print `Rs 450.70`; the
//               amount taken is rupees. `27-F23` scopes "no decimals" to operational SCREENS.
//   27-F24      the system computes, staff read — the cashier is never asked to derive a figure.
//   00 §5.7     a message that is false about the state it describes is worse than no message.
//   01-F17      a sale is never blocked.
//
// ── WHAT THIS FILE IS NOT ─────────────────────────────────────────────────────────────────────
//
// It is not the refusal. The refusal is `resolveChargeRoundingPaisa` in
// `apps/pos-electron/src/main/tax-posture.ts` and is asserted in `tax-on-the-bill.test.ts` §E.
// **This file is the reason the refusal is correct**, and it must go on being true afterwards:
// if someone later teaches the pad and the display paisa (a `27-F23` act), §A starts failing and
// that is the signal the restriction can be lifted.

import { paisa } from "@restos/domain";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme";
import { TenderPanel } from "./TenderPanel";

afterEach(cleanup);

/**
 * The DUE figure as this surface actually renders it — read off the DOM, never recomputed here.
 *
 * `Readout` stacks the caption above its payload, so `DUE` and the number are separate elements;
 * the money is `formatPaisa`'s output and that is what is matched. Reading it back rather than
 * calling `formatPaisa` in the assertion is what makes this a test of the SCREEN — `K-3`'s
 * dead-oracle defect is an oracle pinning its own copy of the thing it exists to pin.
 */
const shownDue = (): string => {
  // `Readout` stacks the caption and the payload inside one container, so the DUE figure is the
  // element next to the `DUE` caption — NOT "the first `Rs …` on the screen", which would also
  // match the CHANGE/REMAINING readout and silently pass while reading the wrong number.
  const caption = screen.getByText("DUE");
  const money = caption.nextElementSibling;
  return money?.textContent ?? "";
};

/** The digits a cashier can actually put in, given what she is looking at. */
const keyable = (shown: string): string => shown.replace(/[^0-9]/g, "");

const type = (digits: string): void => {
  for (const d of digits) fireEvent.click(screen.getByRole("button", { name: d }));
};

const take = (): void => {
  fireEvent.click(screen.getByRole("button", { name: /TAKE CASH/ }));
};

/**
 * Render the Pay surface at `dueP`, read the due off the glass, key exactly those digits, press
 * `TAKE CASH`, and report what the surface did — the whole human path, end to end, in the real
 * component with the real keypad.
 */
const keyWhatIsShown = (dueP: number) => {
  const onTender = vi.fn();
  render(
    <ThemeProvider>
      <TenderPanel dueP={paisa(dueP)} onTender={onTender} />
    </ThemeProvider>,
  );
  const shown = shownDue();
  type(keyable(shown));
  const caption = screen.getByText(/^(CHANGE|REMAINING|NOTHING)/);
  const readout = caption.textContent ?? "";
  const readoutMoney = caption.nextElementSibling?.textContent ?? "";
  take();
  const call = onTender.mock.calls[0]?.[0] as { amountP: number } | undefined;
  cleanup();
  return {
    shown,
    tendered: call?.amountP ?? null,
    readout,
    readoutMoney,
    covers: (call?.amountP ?? -1) >= dueP,
  };
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE PROPERTY. Keying what the glass shows must settle the bill.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 27-F24/01-F17 — the cashier keys what she is shown, and it covers", () => {
  it("holds at every WHOLE-RUPEE due — which is every due a legal granularity can produce", () => {
    // The charge is always a multiple of the org's step (`02-F63`), so a step that is a multiple
    // of 100 paisa can only ever produce these. This is the property the amended `02-F63` (c)
    // exists to guarantee, asserted against the surface rather than against the projection.
    // MUTANT THIS KILLS: `formatPaisa` rounding instead of truncating (Rs 469 shown for 46,864
    // would over-tender rather than strand — a different defect, and this catches it too);
    // and a pad that dropped the ×100 unit conversion.
    for (const due of [40_000, 40_400, 46_900, 47_000, 100, 1_000, 224_000, 1_234_500]) {
      const r = keyWhatIsShown(due);
      expect(r.shown, `${due}: the glass showed a sub-rupee figure`).not.toMatch(/[.,]\d\d$/);
      expect(r.tendered, `${due}: keying "${r.shown}" tendered nothing`).not.toBeNull();
      expect(r.covers, `${due}: the glass showed "${r.shown}" and the pad could not cover it`).toBe(
        true,
      );
    }
  });

  it("and the amount recorded is the DUE itself, never the rounded-off digits", () => {
    // `02-F13`: a tender that covers records the remainder, so the ledger gets the exact bill and
    // the change is the cashier's problem, not the ledger's. MUTANT THIS KILLS: `tenderP` set to
    // `enteredP` on the covering arm, which would write the keyed rupees into an append-only log.
    expect(keyWhatIsShown(46_900).tendered).toBe(46_900);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE REPRODUCTION, PINNED. A sub-rupee due strands the cashier on this surface.
//
// This is a FINDING BLOCK: green assertions describing behaviour that is correct for the surface
// and unusable for the product. It is what makes `02-F63` (c)'s amendment checkable — the day the
// restriction is lifted, these assertions are what must be inverted, in the open, deliberately.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F63 (c) — why a sub-rupee granularity is refused upstream", () => {
  it("Rs 404 at 16 % exclusive with NO rounding: the glass says Rs 468 and the bill does not close", () => {
    // ⚠ The measured reproduction, in the component. `46_864` is `billedTotalPaisa` over one
    // Rs 404 line at 1600 bps with a step of 1 paisa — a configuration `02-F63` (c) used to bless.
    const r = keyWhatIsShown(46_864);
    expect(r.shown, "the truncation").toBe("Rs 468");
    expect(r.tendered, "the pad cannot express 64 paisa").toBe(46_800);
    expect(r.covers, "keying exactly what the till printed settled the bill").toBe(false);
  });

  it("and the shortfall it leaves renders as `Rs 0` — a false statement on the glass (00 §5.7)", () => {
    // The half that turns a stranded tender into an unrecoverable one: `REMAINING` is 64 paisa
    // and `27-F23` truncates it to nothing, so the surface tells the cashier she is done. There
    // is no message she can act on and no key she can press.
    const r = keyWhatIsShown(46_864);
    expect(r.readout, "the surface did not even say something was outstanding").toBe("REMAINING");
    expect(r.readoutMoney, "64 paisa outstanding, rendered as nothing").toBe("Rs 0");
  });
});
