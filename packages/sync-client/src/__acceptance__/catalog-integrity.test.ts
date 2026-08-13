// Acceptance tests — device catalog INTEGRITY (01-F17, 01-F54, 01-F55, 01-F56).
//
// Authored by the independent oracle session for the catalog fix round (24 §3 step 2 —
// the implementer does not write their own acceptance tests). These encode five defects
// the oracle pass demonstrated against the landed `catalog.ts`; every test in this file is
// RED-AWAITING-IMPLEMENTATION by construction. `catalog.test.ts` is left untouched.
//
// Spec text these are authored from — never from the implementation:
//   • 01-F17  a sale is never blocked.
//   • 01-F54  an unknown or not-yet-synced item degrades to its identifier and NEVER
//             blocks. "A screen that refuses to render because one item was renamed
//             upstream is a stopped till."
//   • 01-F55  "Deletion is a tombstone, never a row removal. An open order, an unsettled
//             bill or a reprint may reference an item the owner deleted minutes ago, and
//             that document must still render its name. Removed catalog entries are marked
//             deleted and retained: they stop appearing in the grid but stay resolvable
//             by id."
//   • 01-F56  "Versions apply monotonically, and a delta whose base does not match is
//             REFUSED... An OLDER snapshot or delta than the device already holds is
//             ignored, never applied backwards." — note the word is *older*, not
//             *older-or-equal*. "Applying an out-of-order delta silently diverges one
//             device's menu from every other's, which is undetectable at the till."
//   • 26 §8   plain convergence testing is insufficient; the suite must construct the
//             counterexample, not merely observe agreement on a happy path.
//
// The five behaviours, and the demonstrated defect each one closes:
//   F1  a snapshot must carry tombstones forward. `applySnapshot` does DELETE-then-reinsert
//       with `deleted = 0`, and `CatalogSnapshot` has no field able to express a deletion,
//       so every snapshot destroys every tombstone — and a snapshot is the designated
//       recovery from any refused delta. Fix: `CatalogSnapshot.tombstones`.
//   F3  a SNAPSHOT at the held version must APPLY (it is a full replacement, idempotent by
//       construction, and the only self-heal); a DELTA at the held version stays refused.
//   F4  `apply` must never throw. Malformed wire input currently escapes as TypeError or
//       SqliteError straight up the till's call stack. Fix: a `malformed` refusal.
//   F5  one corrupt row must not empty the grid. `decode`'s unguarded JSON.parse throws out
//       of `list()`, taking every healthy sibling with it.
//   F2  two different updates claiming one version must not leave two devices holding
//       different menus while both report that version. Mechanism deliberately unspecified.

import Database from "better-sqlite3";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CATALOG_SCHEMA,
  type CatalogEntry,
  type CatalogStore,
  createCatalogStore,
} from "../catalog.js";
import { openStore } from "../store.js";

const identity = { org_id: "org1", branch_id: "br1", device_id: "dev1" };

/**
 * The catalog store over a handle the test can also reach directly — needed to corrupt a
 * row for the F5 degradation cases. `device-store.ts` constructs the store from its own
 * handle in exactly this shape, so this is the same object the device runs.
 */
const harness = (): { db: Database.Database; catalog: CatalogStore } => {
  const db = new Database(":memory:");
  db.exec(CATALOG_SCHEMA);
  return { db, catalog: createCatalogStore(db as never) };
};

const item = (id: string, name: string, sort = 0): CatalogEntry => ({
  kind: "item",
  id,
  name,
  parent_id: "cat-mains",
  sort,
});

/** Everything a screen can observe: the sellable grid, and what each id resolves to. */
const observable = (c: CatalogStore, ids: readonly string[]) => ({
  grid: c.list("item").map((e) => `${e.id}=${e.name}`),
  resolved: ids.map((id) => `${id}=${c.lookup("item", id)?.name ?? "<unresolved>"}`),
});

// ───────────────────────────────────────────────────────────────────────────────
// F1 — 01-F55: a tombstone survives a SNAPSHOT
// ───────────────────────────────────────────────────────────────────────────────

describe("01-F55 — a tombstone survives a snapshot (F1)", () => {
  it("the reprint path still renders the name after the recovery snapshot lands", () => {
    // The FR's own scenario, end to end, on the real device store. An order is open with a
    // line for i1; the owner deletes i1; a delta is then lost, so the device is sent the
    // snapshot that `01-F56` designates as the recovery — and that snapshot must not cost
    // the device the name the open bill still has to print.
    const s = openStore({ path: ":memory:", identity });

    s.catalog.apply({
      kind: "snapshot",
      version: 1,
      entries: [item("i1", "Chicken Karahi"), item("i2", "Naan", 1)],
      tombstones: [],
    });
    s.catalog.apply({
      kind: "delta",
      from_version: 1,
      version: 2,
      upserts: [],
      deletes: [{ kind: "item", id: "i1" }],
    });
    expect(s.catalog.lookup("item", "i1")?.name).toBe("Chicken Karahi"); // holds before

    // A delta is lost; the device refuses the next one and is sent a full snapshot.
    expect(
      s.catalog.apply({
        kind: "delta",
        from_version: 3,
        version: 4,
        upserts: [],
        deletes: [],
      }),
    ).toEqual({ applied: false, reason: "needs_snapshot", version: 2 });

    s.catalog.apply({
      kind: "snapshot",
      version: 4,
      entries: [item("i1", "Chicken Karahi"), item("i2", "Naan", 1)],
      tombstones: [{ kind: "item", id: "i1" }],
    });

    // Both halves, or the scenario is not closed: the bill can still print the name, AND
    // the deleted dish has not walked back onto the cashier's grid.
    expect(s.catalog.lookup("item", "i1")?.name).toBe("Chicken Karahi"); // and after
    expect(s.catalog.list("item").map((e) => e.id)).toEqual(["i2"]);
    expect(s.catalog.version()).toBe(4);
    s.close();
  });

  it("does NOT resurrect a tombstoned entry into the grid, even shipped in `entries`", () => {
    // The inverse trap. The entry must travel in `entries` for its NAME to survive on a
    // device that resynced from scratch — so `tombstones` naming the same id has to win,
    // or preserving the name silently puts a deleted dish back on the cashier's grid.
    const { catalog } = harness();
    catalog.apply({
      kind: "snapshot",
      version: 4,
      entries: [item("i1", "Chicken Karahi"), item("i2", "Naan", 1)],
      tombstones: [{ kind: "item", id: "i1" }],
    });

    expect(catalog.list("item").map((e) => e.id)).toEqual(["i2"]);
    expect(catalog.lookup("item", "i1")?.name).toBe("Chicken Karahi");
  });

  it("keeps the tombstone across a SECOND snapshot — carrying it forward is idempotent", () => {
    const { catalog } = harness();
    const snap = (version: number) => ({
      kind: "snapshot" as const,
      version,
      entries: [item("i1", "Chicken Karahi"), item("i2", "Naan", 1)],
      tombstones: [{ kind: "item" as const, id: "i1" }],
    });
    catalog.apply(snap(4));
    catalog.apply(snap(5));

    expect(catalog.list("item").map((e) => e.id)).toEqual(["i2"]);
    expect(catalog.lookup("item", "i1")?.name).toBe("Chicken Karahi");
  });

  // NOTE (oracle): the converse guard — "an entry dropped from `entries` and NOT named in
  // `tombstones` is gone entirely", i.e. `tombstones` must not turn the snapshot into a
  // merge — is deliberately NOT an `it` here, because it already holds against the landed
  // implementation and this file admits only red tests. It is covered by the exact-state
  // equality in the cross-device convergence property at the bottom of this file.
});

// ───────────────────────────────────────────────────────────────────────────────
// F3 — 01-F56: monotonicity splits per kind
// ───────────────────────────────────────────────────────────────────────────────

describe("01-F56 — monotonicity is per kind (F3)", () => {
  it("a re-sent authoritative snapshot at the HELD version repairs a wrong device", () => {
    // `01-F56` refuses what is OLDER. A snapshot at the version the device already claims
    // is not older — it is the authoritative full state of that version, and refusing it
    // leaves a device that is wrong at version N wrong until the org next edits the menu,
    // while `version()` keeps reporting a number that looks correct.
    const { db, catalog } = harness();
    catalog.apply({ kind: "snapshot", version: 7, entries: [item("i1", "Chicken Karahi")] });

    // The device's copy goes wrong at v7 (this stands in for the tombstone loss of F1, a
    // torn write, or any local corruption — the store cannot tell which).
    db.prepare("UPDATE catalog SET json = ? WHERE kind = 'item' AND id = 'i1'").run(
      JSON.stringify(item("i1", "WRONG NAME")),
    );
    expect(catalog.lookup("item", "i1")?.name).toBe("WRONG NAME");

    const r = catalog.apply({
      kind: "snapshot",
      version: 7,
      entries: [item("i1", "Chicken Karahi")],
    });

    expect(r).toEqual({ applied: true, version: 7 });
    expect(catalog.lookup("item", "i1")?.name).toBe("Chicken Karahi");
    expect(catalog.version()).toBe(7);
  });

  it("a snapshot at the held version is a full replacement, not a merge", () => {
    const { catalog } = harness();
    catalog.apply({
      kind: "snapshot",
      version: 3,
      entries: [item("i1", "Karahi"), item("i2", "Naan", 1)],
    });
    const r = catalog.apply({ kind: "snapshot", version: 3, entries: [item("i1", "Karahi")] });

    expect(r).toEqual({ applied: true, version: 3 });
    expect(catalog.list("item").map((e) => e.id)).toEqual(["i1"]);
  });

  it("re-applying the IDENTICAL snapshot at the held version changes nothing", () => {
    // The obligation the old `catalog.test.ts` replay test used to carry, restated for the
    // rule that replaces it. "Applies" must not be allowed to mean "does something": the
    // common case is a healthy device being re-sent the state it already holds, and a
    // self-heal that churns the grid — or empties it — on every redundant snapshot is worse
    // than the refusal it replaces. Idempotence has to be a pinned behaviour, not a hope.
    const { catalog } = harness();
    const snap = {
      kind: "snapshot" as const,
      version: 3,
      entries: [item("i1", "Chicken Karahi"), item("i2", "Naan", 1)],
      tombstones: [{ kind: "item" as const, id: "i9" }],
    };
    catalog.apply({ ...snap, entries: [...snap.entries, item("i9", "Retired Dish", 2)] });
    const before = observable(catalog, ["i1", "i2", "i9"]);

    const r = catalog.apply({ ...snap, entries: [...snap.entries, item("i9", "Retired Dish", 2)] });

    expect(r).toEqual({ applied: true, version: 3 });
    expect(observable(catalog, ["i1", "i2", "i9"])).toEqual(before);
    // Named explicitly, because emptying is the specific way this goes wrong.
    expect(catalog.list("item").map((e) => e.id)).toEqual(["i1", "i2"]);
    expect(catalog.lookup("item", "i9")?.name).toBe("Retired Dish");
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// F4 — 01-F17 / 01-F54: `apply` never throws
// ───────────────────────────────────────────────────────────────────────────────

describe("01-F17 — apply refuses malformed input, never throws (F4)", () => {
  // Each of these is data that reaches `apply` from the sync channel. `01-F17` makes a
  // stopped till the one unacceptable outcome, so a shape the device cannot understand is
  // a REFUSAL — the same first-class outcome an out-of-order delta already gets — never an
  // exception unwinding through the caller. There is no schema validation on this path
  // today; the ledger's own ingest seam runs every envelope through `parseEvent` first.
  const malformed: readonly [string, unknown][] = [
    ["snapshot with `entries` missing", { kind: "snapshot", version: 9 }],
    ["snapshot with `entries` not an array", { kind: "snapshot", version: 9, entries: {} }],
    ["delta with `upserts` missing", { kind: "delta", from_version: 3, version: 9, deletes: [] }],
    ["delta with `deletes` missing", { kind: "delta", from_version: 3, version: 9, upserts: [] }],
    ["non-integer version", { kind: "snapshot", version: 9.5, entries: [] }],
    ["NaN version", { kind: "snapshot", version: Number.NaN, entries: [] }],
    ["Infinity version", { kind: "snapshot", version: Number.POSITIVE_INFINITY, entries: [] }],
    ["string version", { kind: "snapshot", version: "9", entries: [] }],
    [
      "entry with a null id",
      { kind: "snapshot", version: 9, entries: [{ kind: "item", id: null, name: "x" }] },
    ],
    [
      "entry with a non-integer sort",
      { kind: "snapshot", version: 9, entries: [{ kind: "item", id: "i9", name: "x", sort: 1.5 }] },
    ],
  ];

  for (const [label, update] of malformed) {
    it(`refuses ${label} without throwing and without changing anything`, () => {
      const { catalog } = harness();
      catalog.apply({ kind: "snapshot", version: 3, entries: [item("i1", "Karahi")] });

      expect(() => catalog.apply(update as never)).not.toThrow();
      expect(catalog.apply(update as never)).toEqual({
        applied: false,
        reason: "malformed",
        version: 3,
      });
      // The refusal is inert: the menu the device was serving is exactly the menu it serves.
      expect(catalog.version()).toBe(3);
      expect(catalog.list("item").map((e) => e.id)).toEqual(["i1"]);
      expect(catalog.lookup("item", "i1")?.name).toBe("Karahi");
    });
  }

  it("reports the store's own version, never the caller's unvalidated input", () => {
    // A refusal that echoed `update.version` back would hand the caller a number the device
    // never reached — and a string one it cannot even compare. The version in the result is
    // read from the store.
    const { catalog } = harness();
    catalog.apply({ kind: "snapshot", version: 3, entries: [item("i1", "Karahi")] });

    const r = catalog.apply({ kind: "snapshot", version: "9", entries: [] } as never);

    expect(typeof r.version).toBe("number");
    expect(r.version).toBe(3);
    expect(r.version).toBe(catalog.version());
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// F5 — 01-F17 / 01-F54: a corrupt row degrades, never throws
// ───────────────────────────────────────────────────────────────────────────────

describe("01-F54 — a corrupt row degrades to unresolvable, never throws (F5)", () => {
  const poisoned = () => {
    const h = harness();
    h.catalog.apply({
      kind: "snapshot",
      version: 1,
      entries: [item("i1", "Karahi"), item("i2", "Naan", 1), item("i3", "Kheer", 2)],
    });
    h.db.prepare("UPDATE catalog SET json = '{not json' WHERE kind = 'item' AND id = 'i2'").run();
    return h;
  };

  it("lookup on a corrupt row returns null rather than throwing", () => {
    const { catalog } = poisoned();
    expect(() => catalog.lookup("item", "i2")).not.toThrow();
    expect(catalog.lookup("item", "i2")).toBeNull();
  });

  it("ONE poisoned row must not empty the grid", () => {
    // The blast radius is the finding. `list` decodes every row of the kind, so a single
    // bad value takes every healthy sibling with it — and the POS shell resolves names
    // through this store on every openOrders()/kitchenQueue() call, so the throw lands on
    // the till. A skipped row costs one word; a thrown one costs the shift.
    const { catalog } = poisoned();
    expect(() => catalog.list("item")).not.toThrow();
    expect(catalog.list("item").map((e) => e.id)).toEqual(["i1", "i3"]);
  });

  it("a TRUNCATED value degrades the same way — STRICT constrains types, not JSON", () => {
    const { db, catalog } = harness();
    catalog.apply({ kind: "snapshot", version: 1, entries: [item("i1", "Karahi")] });
    db.prepare("UPDATE catalog SET json = substr(json, 1, 12)").run();

    expect(() => catalog.list("item")).not.toThrow();
    expect(catalog.list("item")).toEqual([]);
    expect(catalog.lookup("item", "i1")).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// F2 — 01-F56: two updates claiming one version must not diverge silently
// ───────────────────────────────────────────────────────────────────────────────

describe("01-F56 — one version cannot mean two menus (F2)", () => {
  const seed = () => {
    const h = harness();
    h.catalog.apply({ kind: "snapshot", version: 1, entries: [item("i1", "Karahi")] });
    return h.catalog;
  };
  const alpha = {
    kind: "delta" as const,
    from_version: 1,
    version: 2,
    upserts: [item("i1", "Alpha")],
    deletes: [],
  };
  const bravo = {
    kind: "delta" as const,
    from_version: 1,
    version: 2,
    upserts: [item("i1", "Bravo")],
    deletes: [],
  };

  it("two devices given the competing deltas in opposite orders do not silently disagree", () => {
    // The requirement is stated as the OUTCOME, not a mechanism: whether the store detects
    // this by content hash or by refusing to hold a version it cannot prove is open. What
    // `01-F56` forbids is the undetectable state — two tills, one version number, two
    // menus, and nothing on either screen to say so.
    const a = seed();
    const b = seed();

    a.apply(alpha);
    a.apply(bravo);
    b.apply(bravo);
    b.apply(alpha);

    if (a.version() === b.version()) {
      expect({ version: a.version(), ...observable(a, ["i1"]) }).toEqual({
        version: b.version(),
        ...observable(b, ["i1"]),
      });
    } else {
      // Versions that differ are an acceptable outcome — the disagreement is at least
      // visible to the sync layer, which can then resolve it.
      expect(a.version()).not.toBe(b.version());
    }
  });

  it("a divergent update at a held version is not reported as an idempotent replay", () => {
    // `stale` is the answer for "I already applied this exact update". A DIFFERENT update
    // claiming the same version is not that, and collapsing the two makes the divergence
    // indistinguishable from the ordinary at-least-once duplicate the link produces all day.
    const c = seed();
    c.apply(alpha);

    const r = c.apply(bravo);

    expect(r.applied).toBe(false);
    expect((r as { reason: string }).reason).not.toBe("stale");
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Cross-device convergence property (26 §8 — construct the counterexample)
// ───────────────────────────────────────────────────────────────────────────────

type Edit = { id: string; name: string } | { id: string; deleted: true };

type ServerState = { live: Map<string, string>; dead: Map<string, string> };

const POOL = ["i1", "i2", "i3", "i4"] as const;

/**
 * The authoritative server: a menu edited one version at a time. For every version it emits
 * BOTH forms the device may receive — the delta from the previous version and the full
 * snapshot at this one — because `01-F21` distributes "snapshots + deltas" and a device
 * cannot control which it gets.
 */
const history = (edits: readonly Edit[]) => {
  const live = new Map<string, string>();
  const dead = new Map<string, string>();
  const updates: { version: number; update: unknown }[] = [];
  const states: ServerState[] = [];

  edits.forEach((edit, i) => {
    const version = i + 1;
    if ("deleted" in edit) {
      const name = live.get(edit.id);
      if (name !== undefined) dead.set(edit.id, name);
      live.delete(edit.id);
      updates.push({
        version,
        update: {
          kind: "delta",
          from_version: version - 1,
          version,
          upserts: [],
          deletes: [{ kind: "item", id: edit.id }],
        },
      });
    } else {
      live.set(edit.id, edit.name);
      dead.delete(edit.id);
      updates.push({
        version,
        update: {
          kind: "delta",
          from_version: version - 1,
          version,
          upserts: [item(edit.id, edit.name)],
          deletes: [],
        },
      });
    }
    updates.push({
      version,
      update: {
        kind: "snapshot",
        version,
        // Every id the org knows about travels, so a device that resynced from scratch can
        // still resolve a deleted item; `tombstones` says which of them are off the grid.
        entries: [...live, ...dead].map(([id, name]) => item(id, name)),
        tombstones: [...dead.keys()].map((id) => ({ kind: "item", id })),
      },
    });
    states.push({ live: new Map(live), dead: new Map(dead) });
  });

  return { updates, states };
};

const expectedObservable = (s: ServerState) => ({
  grid: [...s.live.keys()].sort().map((id) => `${id}=${s.live.get(id)}`),
  resolved: POOL.map((id) => `${id}=${s.live.get(id) ?? s.dead.get(id) ?? "<unresolved>"}`),
});

describe("01-F56 — reaching version N means holding the menu of version N", () => {
  it("no delivery order or lossy subset produces a device that is at N but not AT N", () => {
    // The law `01-F56` is defending, as a property rather than one hand-built sequence:
    // the version a device reports is a claim about its CONTENT, so any two devices
    // reporting N hold the same menu, and it is the org's menu at N. Delivery order and
    // loss are the adversary — both are ordinary on a branch link (01-F9).
    const editArb: fc.Arbitrary<Edit> = fc.oneof(
      fc.record({ id: fc.constantFrom(...POOL), name: fc.constantFrom("A", "B", "C") }),
      fc.record({ id: fc.constantFrom(...POOL), deleted: fc.constant(true as const) }),
    );

    fc.assert(
      fc.property(
        fc.array(editArb, { minLength: 2, maxLength: 6 }).chain((edits) =>
          fc.record({
            edits: fc.constant(edits),
            plans: fc.array(
              fc.shuffledSubarray([...history(edits).updates.keys()], { minLength: 1 }),
              { minLength: 1, maxLength: 3 },
            ),
          }),
        ),
        ({ edits, plans }) => {
          const { updates, states } = history(edits);

          // Device 0 always receives everything in order, so the property is never vacuous.
          const deliveries = [[...updates.keys()], ...plans];

          for (const plan of deliveries) {
            const { catalog } = harness();
            for (const i of plan) {
              const step = updates[i];
              if (step) catalog.apply(step.update as never);
            }

            const at = catalog.version();
            if (at === 0) {
              expect(catalog.list("item")).toEqual([]);
              continue;
            }
            // Reporting a version the org never issued is itself a failure of the claim.
            const expected = states[at - 1];
            expect(expected).toBeDefined();
            if (!expected) continue;
            expect(observable(catalog, POOL)).toEqual(expectedObservable(expected));
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});
