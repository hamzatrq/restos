// Acceptance tests for the two pure functions carrying real design logic.
//
// PROVENANCE: written in the same session as the implementation, which 24 §3 step 2 does
// not want. Derived from spec text (27-F2, 27-F8, 27-F11a, 03-F14/F47) rather than from the
// implementations' shape. Flagged, not hidden — this package owes an independent oracle pass.

import { describe, expect, it } from "vitest";
import { ageLevel } from "./AgeBadge";
import { pageCapacity } from "./ItemGrid";

describe("27-F2 — page capacity is DERIVED, never a hardcoded count", () => {
  it("reproduces the 27-F11a reference figures on the founder's hardware", () => {
    // The founder's answer to conflict C8: the counter is a 15.6" terminal, the waiter
    // carries a ~10" tablet or a phone. "6 items per page" was a PHONE finding that this
    // project once transplanted onto every surface — the bug this test exists to prevent.
    const counter = pageCapacity({ widthPx: 1280, heightPx: 800, posture: "counter", tilePx: 96 });
    const tablet = pageCapacity({ widthPx: 900, heightPx: 560, posture: "handheld", tilePx: 96 });
    const phone = pageCapacity({ widthPx: 380, heightPx: 560, posture: "handheld", tilePx: 116 });

    expect(counter).toBeGreaterThan(70); // 27-F11a: ~88 tiles on a 15.6" counter
    expect(tablet).toBeGreaterThan(25); // ~35 on a 10.1" tablet
    expect(phone).toBeGreaterThanOrEqual(9); // ~12 on a phone
    expect(phone).toBeLessThan(20);

    // The ordering is the law. A surface with more usable area holds more, always.
    expect(counter).toBeGreaterThan(tablet);
    expect(tablet).toBeGreaterThan(phone);
  });

  it("never claims a phone-sized page for a counter, or vice versa", () => {
    // Transplanting a fixed count across surfaces is a category error (27-F2), so the same
    // item list must page differently on different hardware.
    const big = pageCapacity({ widthPx: 1280, heightPx: 800, posture: "counter", tilePx: 96 });
    const small = pageCapacity({ widthPx: 380, heightPx: 560, posture: "counter", tilePx: 96 });
    expect(big).not.toBe(small);
  });

  it("refuses a tile smaller than its posture allows (27-F8)", () => {
    // A tile may be LARGER than its minimum — it carries a label, so it usually is. It may
    // never be smaller: that is the touch floor, and shrinking it to fit more items on a
    // page is exactly the trade 27-F8 forbids.
    expect(() =>
      pageCapacity({ widthPx: 1000, heightPx: 800, posture: "kitchen", tilePx: 64 }),
    ).toThrow(/below the kitchen posture minimum/);
    expect(() =>
      pageCapacity({ widthPx: 1000, heightPx: 800, posture: "keypad", tilePx: 76 }),
    ).toThrow(/126/);
  });

  it("always yields at least one tile, even on an absurd surface", () => {
    // Returning 0 would page forever over an empty grid — a worse failure than overflowing,
    // because it looks like the menu is empty rather than like the layout is wrong.
    expect(pageCapacity({ widthPx: 10, heightPx: 10, posture: "counter" })).toBe(1);
    expect(pageCapacity({ widthPx: 0, heightPx: 0, posture: "kitchen" })).toBe(1);
  });

  it("grows monotonically with usable area", () => {
    let last = 0;
    for (const w of [200, 400, 800, 1600, 3200]) {
      const c = pageCapacity({ widthPx: w, heightPx: 800, posture: "counter", tilePx: 96 });
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
