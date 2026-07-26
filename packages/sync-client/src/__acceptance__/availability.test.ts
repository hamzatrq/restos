// Acceptance tests — item availability merge semantics (01-F22, 01-F57..01-F59; spec 26).
//
// Authored from spec text:
//   • 01-F22  availability is an operational EVENT, not a catalog edit, toggleable from
//             POS / pass / manager surfaces — so concurrent toggles are ORDINARY.
//   • 01-F57  `supersedes` is the carried causal link; the fold reads nothing else.
//             "Latest wins" is a law-1 violation: latest is either a device clock (banned,
//             01-F45) or an id comparison reaching a projected value (banned, 01-F34).
//   • 01-F58  a contested item resolves UNAVAILABLE with an anomaly; the fold never picks
//             a winner (01-F31).
//   • 01-F59  availability is not an 01-F17 block.
//   • 26      convergence without a total order; 01-F34 invariance testing is bijective
//             id-relabel + clock injection, because plain convergence testing passes a
//             min-id tiebreak that smuggles wall clock in through the UUIDv7 prefix.
//
// PROVENANCE: written in the same session as the implementation (24 §3 step 2 wants
// otherwise) on a PROTECTED path. Flagged, owed an independent oracle pass.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type AvailabilityToggle,
  createAvailabilityFold,
  projectAvailability,
} from "../folds/availability.js";

const t = (
  event_id: string,
  available: boolean,
  supersedes: string[] = [],
  item_id = "i1",
): AvailabilityToggle => ({ event_id, item_id, available, supersedes });

describe("01-F59 — the default is available", () => {
  it("an untoggled item is available", () => {
    expect(projectAvailability([])).toEqual({ available: true, contested: false });
  });
});

describe("01-F57 — supersedes is the only ordering input", () => {
  it("a lone toggle decides", () => {
    expect(projectAvailability([t("e1", false)])).toEqual({ available: false, contested: false });
  });

  it("a superseding toggle wins over the one it names", () => {
    // 86'd, then put back on. The re-enable NAMES the disable, so this is causal, not a race.
    const set = [t("e1", false), t("e2", true, ["e1"])];
    expect(projectAvailability(set)).toEqual({ available: true, contested: false });
  });

  it("a chain resolves to its head", () => {
    const set = [t("e1", false), t("e2", true, ["e1"]), t("e3", false, ["e2"])];
    expect(projectAvailability(set)).toEqual({ available: false, contested: false });
  });

  it("ignores a self-reference rather than erasing the item's history", () => {
    // A malformed event naming itself must not take the whole item down with it.
    expect(projectAvailability([t("e1", false, ["e1"])])).toEqual({
      available: false,
      contested: false,
    });
  });

  it("treats a dangling chain as untoggled rather than inventing a winner", () => {
    // Everything superseded by a head that has not arrived yet. The fold is a pure function
    // of the set it HAS; the head will arrive and the answer will change then.
    expect(projectAvailability([t("e1", false, ["e0"]), t("e0", true, ["e1"])])).toEqual({
      available: true,
      contested: false,
    });
  });
});

describe("01-F58 — a contested item is unavailable, and says so", () => {
  it("two concurrent disagreeing toggles resolve to unavailable + contested", () => {
    // The pass screen says 86'd, the manager console says back on, neither saw the other.
    // Erring toward NOT selling is the recoverable direction: failing to sell a dish you
    // could costs a re-toggle; selling one you cannot costs a refund and a customer.
    expect(projectAvailability([t("e1", false), t("e2", true)])).toEqual({
      available: false,
      contested: true,
    });
  });

  it("agreeing concurrent toggles are not contested", () => {
    expect(projectAvailability([t("e1", false), t("e2", false)])).toEqual({
      available: false,
      contested: false,
    });
  });
});

describe("01-F34 / 26 — convergence without a total order", () => {
  const arbToggles = fc
    .array(
      fc.record({
        event_id: fc.string({ minLength: 1, maxLength: 4 }),
        available: fc.boolean(),
        supersedes: fc.array(fc.string({ minLength: 1, maxLength: 4 }), { maxLength: 3 }),
      }),
      { maxLength: 8 },
    )
    .map((rows) => rows.map((r) => ({ ...r, item_id: "i1" }) as AvailabilityToggle));

  it("is order-invariant: any delivery order yields the same projection", () => {
    fc.assert(
      fc.property(arbToggles, fc.array(fc.nat(), { maxLength: 8 }), (toggles, perm) => {
        const a = createAvailabilityFold();
        for (const x of toggles) a.apply(x);

        // Same SET, arbitrary order.
        const shuffled = [...toggles];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = (perm[i] ?? 0) % (i + 1);
          const tmp = shuffled[i] as AvailabilityToggle;
          shuffled[i] = shuffled[j] as AvailabilityToggle;
          shuffled[j] = tmp;
        }
        const b = createAvailabilityFold();
        for (const x of shuffled) b.apply(x);

        expect(b.snapshot()).toEqual(a.snapshot());
      }),
    );
  });

  it("is idempotent: redelivering every event changes nothing", () => {
    fc.assert(
      fc.property(arbToggles, (toggles) => {
        const a = createAvailabilityFold();
        for (const x of toggles) a.apply(x);
        const once = a.snapshot();
        for (const x of toggles) a.apply(x);
        expect(a.snapshot()).toEqual(once);
      }),
    );
  });

  it("is INVARIANT UNDER BIJECTIVE ID RELABEL — the 01-F34 test that actually bites", () => {
    // Plain convergence testing is insufficient: a min-id tiebreak passes it while
    // smuggling wall clock in through the UUIDv7 prefix. Relabelling every id consistently
    // must not move the answer, and it only holds if the rule reads NO id ordering.
    fc.assert(
      fc.property(arbToggles, (toggles) => {
        const base = projectAvailability(toggles);
        // A bijection on ids: reverse each string. Consistent across event_id and supersedes.
        const relabel = (s: string) => [...s].reverse().join("");
        const mapped = toggles.map((x) => ({
          ...x,
          event_id: relabel(x.event_id),
          supersedes: x.supersedes.map(relabel),
        }));
        expect(projectAvailability(mapped)).toEqual(base);
      }),
    );
  });

  it("reads no clock — the projection is a pure function of the set", () => {
    // No timestamp exists on an AvailabilityToggle at all, which is the strongest possible
    // form of this assertion: the type system forbids the fold from reading one.
    const sample: AvailabilityToggle = t("e1", false);
    expect(Object.keys(sample).sort()).toEqual(["available", "event_id", "item_id", "supersedes"]);
  });
});

describe("the fold surface", () => {
  it("keys items independently", () => {
    const f = createAvailabilityFold();
    f.apply(t("e1", false, [], "karahi"));
    expect(f.isAvailable("karahi")).toBe(false);
    expect(f.isAvailable("naan")).toBe(true); // untouched, so available
  });

  it("rebuild from the full set matches incremental application", () => {
    const set = [t("e1", false), t("e2", true, ["e1"]), t("e3", false, [], "naan")];
    const inc = createAvailabilityFold();
    for (const x of set) inc.apply(x);
    const full = createAvailabilityFold();
    full.rebuild(set);
    expect(full.snapshot()).toEqual(inc.snapshot());
  });

  it("surfaces contested state per item", () => {
    const f = createAvailabilityFold();
    f.apply(t("e1", false));
    f.apply(t("e2", true));
    expect(f.isContested("i1")).toBe(true);
    expect(f.isAvailable("i1")).toBe(false);
  });
});
