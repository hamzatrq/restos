// Acceptance tests — T-01-05 stage (b): electHub pure-function laws (01-F13;
// HUB-ELECTION.md), authored from the kernel-tasks binding contract + HUB-ELECTION.md
// only (24 §3 step 2: read-only to the implementing session). Election is a pure
// function of the visible peer set — rank by HUB_ELIGIBLE_CLASSES index, tie →
// lexicographically lowest device_id, non-eligible classes never win, null when no
// eligible peer, permutation-invariant so every device computes the same winner
// with no consensus rounds.

import { DEVICE_CLASSES, HUB_ELIGIBLE_CLASSES } from "@restos/domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { electHub } from "../index.js";
import { peer, referenceWinner, shuffled } from "./mesh-builders.js";

describe("electHub directed cases (01-F13; HUB-ELECTION.md)", () => {
  it("01-F13: rank = HUB_ELIGIBLE_CLASSES index — counter_electron > counter_rn > kitchen", () => {
    // Anchor the priority order the rank law keys on (01-F39; domain is declare-once).
    expect(HUB_ELIGIBLE_CLASSES).toEqual(["counter_electron", "counter_rn", "kitchen"]);
    expect(electHub([peer("dev-b", "counter_rn"), peer("dev-a", "kitchen")])).toBe("dev-b");
    expect(
      electHub([
        peer("dev-c", "counter_electron"),
        peer("dev-b", "counter_rn"),
        peer("dev-a", "kitchen"),
      ]),
    ).toBe("dev-c");
    expect(electHub([peer("dev-z", "kitchen")])).toBe("dev-z"); // kitchen is hub-eligible
  });

  it("01-F13: tie on class rank → lexicographically lowest device_id wins", () => {
    expect(electHub([peer("dev-b"), peer("dev-a"), peer("dev-c")])).toBe("dev-a");
    expect(electHub([peer("kds-2", "kitchen"), peer("kds-1", "kitchen")])).toBe("kds-1");
  });

  it("01-F13/01-F39: classes outside HUB_ELIGIBLE_CLASSES never win — even with a lower device_id", () => {
    expect(electHub([peer("aaa", "manager"), peer("zzz", "kitchen")])).toBe("zzz");
    expect(electHub([peer("aaa", "waiter"), peer("aab", "rider"), peer("zzz", "counter_rn")])).toBe(
      "zzz",
    );
  });

  it("01-F13: null when no hub-eligible peer is visible", () => {
    expect(electHub([])).toBeNull();
    expect(electHub([peer("dev-a", "manager")])).toBeNull();
    expect(
      electHub([peer("dev-a", "waiter"), peer("dev-b", "rider"), peer("dev-c", "manager")]),
    ).toBeNull();
  });
});

// Padded numeric ids keep lexicographic order unambiguous and make rank/id ties
// common; a small pool forces tie-breaks to actually exercise.
const peerArb = fc
  .record({
    n: fc.integer({ min: 0, max: 30 }),
    device_class: fc.constantFrom(...DEVICE_CLASSES),
  })
  .map(({ n, device_class }) => peer(`dev-${String(n).padStart(2, "0")}`, device_class));

const peersArb = fc.array(peerArb, { maxLength: 12 });

const scopedArb = fc
  .record({
    n: fc.integer({ min: 0, max: 30 }),
    device_class: fc.constantFrom("manager" as const, "waiter" as const, "rider" as const),
  })
  .map(({ n, device_class }) => peer(`scoped-${String(n).padStart(2, "0")}`, device_class));

describe("electHub properties (01-F13; HUB-ELECTION.md: pure function of the peer set)", () => {
  it("01-F13 property: permutation-invariant — electHub(shuffle(p)) === electHub(p) for any peer set", () => {
    fc.assert(
      fc.property(peersArb, fc.integer({ min: 0, max: 2 ** 31 - 1 }), (peers, seed) => {
        expect(electHub(shuffled(peers, seed))).toBe(electHub(peers));
      }),
      { numRuns: 50 },
    );
  });

  it("01-F13 property: the winner is exactly the (class-rank, device_id)-minimal eligible peer — null iff none eligible", () => {
    fc.assert(
      fc.property(peersArb, (peers) => {
        expect(electHub(peers)).toBe(referenceWinner(peers));
      }),
      { numRuns: 50 },
    );
  });

  it("01-F13/01-F39 property: scoped-class peers are inert — adding them never changes the winner", () => {
    fc.assert(
      fc.property(peersArb, fc.array(scopedArb, { maxLength: 6 }), (peers, scoped) => {
        expect(electHub([...peers, ...scoped])).toBe(electHub(peers));
      }),
      { numRuns: 50 },
    );
  });
});
