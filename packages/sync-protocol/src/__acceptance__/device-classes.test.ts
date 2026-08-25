// Acceptance tests — T-01-02 domain addition (01-F39), authored from the
// kernel-tasks binding contract + specs/01-kernel-sync.md §3 only.
//
// ⚠ **THE FR IS THE AUTHORITY HERE, NOT THE PLAN THIS SUITE WAS AUTHORED FROM.**
// `plans/wave-0/kernel-tasks.md` still binds the original SIX classes, and `plans/`
// is not in the authority order (`L2`). `01-F39` was amended in place in August 2026
// to add `storefront_cloud` for `06-F30` — the spec act was made in the same commit
// as the code — and this suite went on asserting *exactly six* afterwards, failing
// the correct implementation. That is `L3` verbatim: a ruling landed and nobody
// grepped the suite that encoded the old rule. Read `01-F39`, not the header above.

import { DEVICE_CLASSES, HUB_ELIGIBLE_CLASSES } from "@restos/domain";
import { describe, expect, it } from "vitest";

/**
 * `01-F39` states hub eligibility as a CLOSED set — *"Hub-eligible is exactly
 * {`counter_electron`, `counter_rn`, `kitchen`}"* — so its complement is closed too, and
 * it is written out here rather than derived from `DEVICE_CLASSES`. A derived complement
 * (`DEVICE_CLASSES.filter((c) => !HUB_ELIGIBLE_CLASSES.includes(c))`) agrees with whatever
 * it finds: it would have admitted `storefront_cloud` to this list silently on the day the
 * class landed, which is the whole property this test owns.
 *
 * `storefront_cloud` is the member this list exists for. A cloud origin is not on the branch
 * LAN and has no branch to serve a clock to (`01-F39`, `06-F30`; `01-F13` elects among
 * hub-eligible classes only, `01-F43` makes the hub the branch time authority), so it can
 * never be a hub — and it is the one class added after this suite was written.
 */
const NEVER_HUB_ELIGIBLE = ["manager", "waiter", "rider", "storefront_cloud"] as const;

describe("device classes (01-F39)", () => {
  it("01-F39: DEVICE_CLASSES is exactly the seven device classes", () => {
    expect(DEVICE_CLASSES).toEqual([
      "counter_electron",
      "counter_rn",
      "kitchen",
      "manager",
      "waiter",
      "rider",
      // Added August 2026 by the `01-F39` amendment for `06-F30` — the hosted
      // storefront's ORIGIN identity, one per (org, branch).
      "storefront_cloud",
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

  it("01-F39: manager, waiter, rider and storefront_cloud are never hub-eligible", () => {
    for (const deviceClass of NEVER_HUB_ELIGIBLE) {
      expect(HUB_ELIGIBLE_CLASSES, `${deviceClass} must never be hub-eligible`).not.toContain(
        deviceClass,
      );
    }
  });

  it("01-F39: the eligible and never-eligible sets PARTITION DEVICE_CLASSES", () => {
    // ⚠ **STATE WHAT THIS ACTUALLY OWNS, because its kill count against the IMPLEMENTATION is
    // ZERO** (measured: it fails only where the exact-list or hub-eligible assertions already do,
    // so a reader who scores it on implementation mutants alone will delete it as redundant).
    // What it uniquely owns is two TEST-side holes:
    //   (a) the `24-F14` empty-match guard for the loop above — empty the `NEVER_HUB_ELIGIBLE`
    //       list and that `for` body never runs, leaving it vacuously green; only this fails;
    //   (b) the classification forcer — add a class to `DEVICE_CLASSES` *and* to the exact list
    //       above, leave `NEVER_HUB_ELIGIBLE` alone, and only this fails.
    // So a new class cannot enter without this file deciding IN WRITING which side it falls on.
    expect([...HUB_ELIGIBLE_CLASSES, ...NEVER_HUB_ELIGIBLE].sort()).toEqual(
      [...DEVICE_CLASSES].sort(),
    );
  });
});
