// Acceptance tests — T-01-02 domain addition (01-F39), authored from the
// kernel-tasks binding contract + specs/01-kernel-sync.md §3 only.

import { DEVICE_CLASSES, HUB_ELIGIBLE_CLASSES } from "@restos/domain";
import { describe, expect, it } from "vitest";

describe("device classes (01-F39)", () => {
  it("01-F39: DEVICE_CLASSES is exactly the six device classes", () => {
    expect(DEVICE_CLASSES).toEqual([
      "counter_electron",
      "counter_rn",
      "kitchen",
      "manager",
      "waiter",
      "rider",
    ]);
  });

  it("01-F39: HUB_ELIGIBLE_CLASSES is counter_electron, counter_rn, kitchen in hub-priority order", () => {
    expect(HUB_ELIGIBLE_CLASSES).toEqual(["counter_electron", "counter_rn", "kitchen"]);
  });

  it("01-F39: HUB_ELIGIBLE_CLASSES is a strict subset of DEVICE_CLASSES", () => {
    for (const hubClass of HUB_ELIGIBLE_CLASSES) {
      expect(DEVICE_CLASSES).toContain(hubClass);
    }
    expect(HUB_ELIGIBLE_CLASSES.length).toBeLessThan(DEVICE_CLASSES.length);
  });

  it("01-F39: manager, waiter, and rider are never hub-eligible", () => {
    expect(HUB_ELIGIBLE_CLASSES).not.toContain("manager");
    expect(HUB_ELIGIBLE_CLASSES).not.toContain("waiter");
    expect(HUB_ELIGIBLE_CLASSES).not.toContain("rider");
  });
});
