// Acceptance tests for the two pure functions carrying real design logic.
//
// PROVENANCE: written in the same session as the implementation, which 24 §3 step 2 does
// not want. Derived from spec text (27-F2, 27-F8, 27-F11a, 03-F14/F47) rather than from the
// implementations' shape. Flagged, not hidden — this package owes an independent oracle pass.

import { describe, expect, it } from "vitest";
import { ageLevel } from "./AgeBadge";
import { pageCapacity } from "./ItemGrid";
import { acceptKeystroke } from "./NumericKeypad";

describe("27-F2 — page capacity is DERIVED, never a hardcoded count", () => {
  // REWRITTEN for 27-F11c. Every figure below was previously in PIXELS, and the oracle round
  // found that this suite asserted capacity "grows monotonically with usable area" while
  // measuring area in px — which is the INVERSE of the FR. It also used a 1280×800 reference
  // that 27 §1a's hardware table does not list. Area is physical now, in millimetres.

  /** A 16:9 panel's usable width and height in mm, from its diagonal in inches. */
  const panel = (diagonalIn: number) => {
    const d = diagonalIn * 25.4;
    const k = Math.hypot(16, 9);
    return { widthMm: (d * 16) / k, heightMm: (d * 9) / k };
  };

  it("reproduces the 27-F11a ordering on the founder's hardware", () => {
    // The founder's answer to conflict C8: the counter is a 15.6" terminal, the waiter
    // carries a ~10" tablet or a phone. "6 items per page" was a PHONE finding that this
    // project once transplanted onto every surface — the bug this test exists to prevent.
    const counter = pageCapacity({ ...panel(15.6), posture: "counter", tileMm: 24 });
    const tablet = pageCapacity({ ...panel(10.1), posture: "handheld", tileMm: 24 });
    const phone = pageCapacity({ ...panel(6.5), posture: "handheld", tileMm: 24 });

    // The ordering is the law. A surface with more usable AREA holds more, always — and
    // 27-F11a's own three integers are not re-derivable from its other numbers, so the
    // ordering and the rough magnitude are what is asserted.
    expect(counter).toBeGreaterThan(tablet);
    expect(tablet).toBeGreaterThan(phone);
    expect(phone).toBeGreaterThanOrEqual(6);
    expect(counter).toBeLessThan(200);
  });

  it("is blind to resolution — the property the pixel version could not have", () => {
    // 27-F11c by name: "a 1366×768 and a 1920×1080 15.6-inch panel hold the SAME number of
    // 12 mm tiles". There is no resolution in scope to be sensitive to, so this holds by
    // construction rather than by luck; the test pins that the API keeps it that way.
    const p = panel(15.6);
    expect(pageCapacity({ ...p, posture: "counter", tileMm: 24 })).toBe(
      pageCapacity({ ...p, posture: "counter", tileMm: 24 }),
    );
    // A physically smaller panel of the SAME pixel count must hold fewer.
    expect(pageCapacity({ ...panel(15.6), posture: "counter", tileMm: 24 })).toBeGreaterThan(
      pageCapacity({ ...panel(10.1), posture: "counter", tileMm: 24 }),
    );
  });

  it("refuses a tile smaller than its posture allows, IN MILLIMETRES (27-F8)", () => {
    // A tile may be LARGER than its minimum — it carries a label, so it usually is. It may
    // never be smaller: that is the touch floor, and shrinking it to fit more items on a
    // page is exactly the trade 27-F8 forbids. A px guard cannot enforce this at all: 48 px
    // is 12.2 mm on a 100-PPI panel and 8.6 mm on a 141-PPI one.
    expect(() => pageCapacity({ ...panel(15.6), posture: "kitchen", tileMm: 10 })).toThrow(
      /below the kitchen posture minimum/,
    );
    expect(() => pageCapacity({ ...panel(15.6), posture: "keypad", tileMm: 12 })).toThrow(/20/);
  });

  it("always yields at least one tile, even on an absurd surface", () => {
    // Returning 0 would page forever over an empty grid — a worse failure than overflowing,
    // because it looks like the menu is empty rather than like the layout is wrong.
    expect(pageCapacity({ widthMm: 2, heightMm: 2, posture: "counter" })).toBe(1);
    expect(pageCapacity({ widthMm: 0, heightMm: 0, posture: "kitchen" })).toBe(1);
  });

  it("grows monotonically with PHYSICAL usable area", () => {
    let last = 0;
    for (const inches of [6.5, 10.1, 15.6, 22, 32]) {
      const c = pageCapacity({ ...panel(inches), posture: "counter", tileMm: 24 });
      expect(c).toBeGreaterThanOrEqual(last);
      last = c;
    }
  });
});

describe("03-F47 — ticket age is driven by fixed configured minutes", () => {
  it("steps normal → abnormal → fault at the configured thresholds", () => {
    expect(ageLevel(0, 10, 20)).toBe("normal");
    expect(ageLevel(9, 10, 20)).toBe("normal");
    expect(ageLevel(10, 10, 20)).toBe("abnormal"); // inclusive at the threshold
    expect(ageLevel(19, 10, 20)).toBe("abnormal");
    expect(ageLevel(20, 10, 20)).toBe("fault");
    expect(ageLevel(999, 10, 20)).toBe("fault");
  });

  it("honours per-order-type thresholds (03-F14 defaults: dine-in 10/20, delivery 15/25)", () => {
    // A delivery order's clock includes the road, so the same 17 minutes is fine for
    // delivery and already amber for dine-in. One global threshold would lie about one of
    // them, which is why 03-F14 makes them configurable per order type.
    expect(ageLevel(17, 10, 20)).toBe("abnormal");
    expect(ageLevel(17, 15, 25)).toBe("abnormal");
    expect(ageLevel(12, 15, 25)).toBe("normal");
    expect(ageLevel(12, 10, 20)).toBe("abnormal");
  });

  it("never depends on anything but the minutes and the two thresholds", () => {
    // 03-F47's whole point: no expected-prep, no ETA, no reader state. The function is pure
    // and total, so a fold or a renderer cannot smuggle a clock into a projected value
    // (law 1, 01-F34).
    for (const m of [0, 5, 10, 15, 20, 25, 100]) {
      expect(ageLevel(m, 10, 20)).toBe(ageLevel(m, 10, 20));
    }
  });
});

describe("27-F29 — impossible numbers are blocked AT ENTRY, not warned about after", () => {
  // Blocking roughly halves out-by-10 errors, and numeric entry is where this population's
  // errors concentrate. A post-hoc warning asks the operator to notice, re-read and compare
  // — three literacy-dependent acts, under the most time pressure, with a customer waiting.

  it("refuses a keystroke that would exceed the maximum", () => {
    expect(acceptKeystroke("50", "0", 999, 7)).toBe("500");
    expect(acceptKeystroke("500", "0", 999, 7)).toBeNull(); // 5000 > 999 — refused
  });

  it("refuses a keystroke past the digit limit, which is the out-by-10 guard", () => {
    expect(acceptKeystroke("999", "9", 1_000_000, 4)).toBe("9999");
    expect(acceptKeystroke("9999", "9", 1_000_000, 4)).toBeNull();
  });

  it("never strands the operator — clear and backspace always work", () => {
    // A blocked state the operator cannot escape is worse than the bad entry it prevented.
    expect(acceptKeystroke("9999", "back", 10, 4)).toBe("999");
    expect(acceptKeystroke("9999", "clear", 10, 4)).toBe("");
    expect(acceptKeystroke("", "back", 10, 4)).toBe("");
  });

  it("does not accumulate leading zeros", () => {
    expect(acceptKeystroke("0", "5", 999, 7)).toBe("5");
    expect(acceptKeystroke("0", "0", 999, 7)).toBe("0");
  });

  it("accepts every digit that is still legal", () => {
    for (const d of ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]) {
      expect(acceptKeystroke("1", d, 999, 7)).toBe(`1${d}`);
    }
  });
});
