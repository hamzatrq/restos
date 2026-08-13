/**
 * Commandment 3 / `27-F22` / `27-F23` — **the one conversion in this app that a bug makes
 * permanent.** `01-F53` freezes a published price into every order line read against it, so a
 * factor-of-100 slip here is not a display defect; it is a menu sold at one hundredth of its price
 * until somebody notices.
 *
 * Every assertion below is aimed at a specific way the conversion can be wrong, and the mutation
 * run in `plans/` records which mutant each one kills. The property tests are the ones that matter:
 * a hardcoded table passes the examples and fails the round trip.
 */

import { describe, expect, it } from "vitest";
import { formatPaisa, isWholeRupees, paisaFromRupees, rupeeTextFromPaisa } from "../lib/money";

const ok = (input: string): number => {
  const parsed = paisaFromRupees(input);
  if (!parsed.ok) throw new Error(`expected ${input} to parse, got: ${parsed.reason}`);
  return parsed.price_paisa;
};

describe("00 §6 — rupees in, integer paisa out", () => {
  it("multiplies by exactly one hundred", () => {
    // THE factor test. A mutant appending one zero gives 10; appending three gives 10000; a
    // `Number(text)` with no append gives 1. All three die here, and only here at this precision.
    expect(ok("1")).toBe(100);
    expect(ok("450")).toBe(45000);
    expect(ok("1234567")).toBe(123456700);
  });

  it("prices a free item at exactly zero, not at nothing", () => {
    // `01-F60`'s free modifier. `Number("000")` is 0 and an implementation that special-cased
    // falsy input would return a refusal here, which is the whole defect.
    expect(ok("0")).toBe(0);
  });

  it("round-trips every whole-rupee value", () => {
    for (const rupees of ["0", "1", "9", "10", "99", "450", "1000", "99999", "1234567"]) {
      expect(rupeeTextFromPaisa(ok(rupees))).toBe(rupees);
    }
  });

  it("round-trips a swept range, so a lookup table cannot pass", () => {
    for (let n = 0; n < 2500; n += 7) {
      const text = String(n);
      expect(rupeeTextFromPaisa(ok(text))).toBe(text);
    }
  });
});

describe("27-F23 — what the input refuses, and why", () => {
  it("refuses an empty cell rather than reading it as zero", () => {
    // The mirror of the free-modifier case, and the reason both are asserted: if `""` parsed to 0,
    // "somebody forgot foodpanda" and "this costs nothing" would be the same fact (`01-F60`).
    expect(paisaFromRupees("").ok).toBe(false);
    expect(paisaFromRupees("   ").ok).toBe(false);
  });

  it("refuses a decimal point", () => {
    // Pinned interpretation, recorded in `money.ts`: no sub-rupee unit circulates and the decimal
    // point is the highest-consequence keystroke there is, so `450.50` is a refusal, never 45050.
    const parsed = paisaFromRupees("450.50");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain("whole rupees");
  });

  it("refuses a grouping separator, so 4,50 cannot become 45000", () => {
    expect(paisaFromRupees("4,50").ok).toBe(false);
  });

  it("refuses a negative price", () => {
    // Money has no sign in this kernel — a direction is a word, not a minus (`27-F12`).
    expect(paisaFromRupees("-5").ok).toBe(false);
  });

  it("refuses a value the wire cannot hold exactly", () => {
    // `CatalogEntryWire` caps `price_paisa` at 2^53 - 1 because the column is `bigint` and a larger
    // value round-trips lossily through `Number()` — a silently wrong bill, not a cosmetic error.
    expect(paisaFromRupees("999999999999999999").ok).toBe(false);
  });

  it("refuses non-digits, including Eastern digits", () => {
    // `27-F22` — Western digits U+0030–0039 everywhere, never U+0660–0669.
    expect(paisaFromRupees("٤٥٠").ok).toBe(false);
    expect(paisaFromRupees("45O").ok).toBe(false);
  });
});

describe("a stored price that whole rupees cannot express", () => {
  it("reports 45050 paisa as not expressible", () => {
    // The editor leaves such a cell EMPTY rather than showing `450`, because showing 450 and
    // saving it back is a five-rupee cut nobody typed.
    expect(isWholeRupees(45050)).toBe(false);
    expect(isWholeRupees(1)).toBe(false);
    expect(isWholeRupees(99)).toBe(false);
  });

  it("reports zero and whole rupees as expressible", () => {
    // `0` is the trap: its digit string is one character, so an unpadded implementation reads its
    // last two digits as `"0"` and calls a free item inexpressible.
    expect(isWholeRupees(0)).toBe(true);
    expect(isWholeRupees(100)).toBe(true);
    expect(isWholeRupees(45000)).toBe(true);
  });
});

describe("27-F23 — the display format", () => {
  it("is Rs, symbol-first, with no decimals", () => {
    expect(formatPaisa(45000)).toBe("Rs 450");
    expect(formatPaisa(0)).toBe("Rs 0");
  });

  it("groups in threes — Pakistan does not inherit lakh grouping", () => {
    // CLDR gives `ur`/`en-PK` the `#,##0.###` pattern. A lakh grouping would read `12,34,567`.
    expect(formatPaisa(123456700)).toBe("Rs 1,234,567");
  });

  it("is never ₨ and never PKR in staff UI", () => {
    const rendered = formatPaisa(45000);
    expect(rendered).not.toContain("₨");
    expect(rendered).not.toContain("PKR");
  });

  it("emits only Western digits (27-F22)", () => {
    expect(formatPaisa(123456700)).not.toMatch(/[٠-٩۰-۹]/);
  });
});
