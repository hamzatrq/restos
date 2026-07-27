// Acceptance tests — device catalog distribution (01-F21, 01-F52..01-F56).
//
// Authored from spec text:
//   • 01-F21  catalog entities; edited only via back office; VERSIONED; distributed to
//             devices as reference-data snapshots + deltas over the same sync channel.
//   • 01-F52  reference data, not ledger; org-scoped; NEVER an input to a fold, because a
//             projected value reading a name would depend on catalog sync state at fold
//             time — the 01-F34 break.
//   • 01-F53  money never depends on catalog sync: unit_price_paisa is captured INTO the
//             event when the line is added and never re-read from the catalog.
//   • 01-F54  an unknown or not-yet-synced item degrades to its identifier and NEVER
//             blocks (01-F17).
//   • 01-F55  deletion is a TOMBSTONE, never a row removal — an open order or a reprint
//             may reference an item deleted minutes ago.
//   • 01-F56  versions apply monotonically; a delta whose base does not match is REFUSED
//             and the device asks for a snapshot.
//
// PROVENANCE: written in the same session as the implementation, which 24 §3 step 2 does
// not want, and sync-client is a PROTECTED path. Flagged, not hidden — owed an independent
// oracle pass with the rest of Wave 1.

import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../catalog.js";
import { openStore } from "../device-store.js";

const identity = { org_id: "org1", branch_id: "br1", device_id: "dev1" };
const store = () => openStore({ path: ":memory:", identity });

const item = (id: string, name: string, sort = 0): CatalogEntry => ({
  kind: "item",
  id,
  name,
  parent_id: "cat-mains",
  sort,
});

describe("01-F21 / 01-F56 — versioned snapshots and deltas", () => {
  it("starts empty at version 0 rather than refusing to open", () => {
    const s = store();
    expect(s.catalog.version()).toBe(0);
    expect(s.catalog.list("item")).toEqual([]);
  });

  it("applies a snapshot and reports the new version", () => {
    const s = store();
    const r = s.catalog.apply({
      kind: "snapshot",
      version: 7,
      entries: [item("i1", "Chicken Karahi"), item("i2", "Naan", 1)],
    });
    expect(r).toEqual({ applied: true, version: 7 });
    expect(s.catalog.list("item").map((e) => e.name)).toEqual(["Chicken Karahi", "Naan"]);
  });

  it("applies a delta whose base matches", () => {
    const s = store();
    s.catalog.apply({ kind: "snapshot", version: 1, entries: [item("i1", "Karahi")] });
    const r = s.catalog.apply({
      kind: "delta",
      from_version: 1,
      version: 2,
      upserts: [item("i1", "Chicken Karahi")],
      deletes: [],
    });
    expect(r).toEqual({ applied: true, version: 2 });
    expect(s.catalog.lookup("item", "i1")?.name).toBe("Chicken Karahi");
  });

  it("REFUSES a delta whose base does not match, and asks for a snapshot", () => {
    // The failure this prevents: applying an out-of-order delta silently diverges ONE
    // device's menu from every other device's. That is undetectable at the till and shows
    // up days later as a mispriced or misnamed item — so refusing loudly is the cheap path.
    const s = store();
    s.catalog.apply({ kind: "snapshot", version: 1, entries: [item("i1", "Karahi")] });
    const r = s.catalog.apply({
      kind: "delta",
      from_version: 5, // we are at 1 — a delta was lost
      version: 6,
      upserts: [item("i2", "Naan")],
      deletes: [],
    });
    expect(r).toEqual({ applied: false, reason: "needs_snapshot", version: 1 });
    expect(s.catalog.lookup("item", "i2")).toBeNull();
    expect(s.catalog.version()).toBe(1);
  });

  it("never applies backwards", () => {
    // Merging an older update would resurrect entries the org has already removed.
    const s = store();
    s.catalog.apply({ kind: "snapshot", version: 5, entries: [item("i1", "Karahi")] });
    const r = s.catalog.apply({ kind: "snapshot", version: 4, entries: [item("i9", "Old")] });
    expect(r).toEqual({ applied: false, reason: "stale", version: 5 });
    expect(s.catalog.lookup("item", "i9")).toBeNull();
  });

  it("ignores a replay of the version it already holds", () => {
    // The replay is the SAME delta arriving twice — an at-least-once link produces it all
    // day (DEC-SYNC-008). Re-delivered byte-identical, so it stays a replay however version
    // identity is later strengthened, rather than a second update contending for one version.
    // A SNAPSHOT at the held version is NOT this case: 01-F56 refuses what is *older*, and a
    // full replacement is idempotent by construction, so it is the device's only self-heal.
    // That half is pinned in catalog-integrity.test.ts.
    const s = store();
    s.catalog.apply({ kind: "snapshot", version: 2, entries: [item("i1", "Karahi")] });
    const delta = {
      kind: "delta" as const,
      from_version: 2,
      version: 3,
      upserts: [item("i1", "Chicken Karahi")],
      deletes: [],
    };
    expect(s.catalog.apply(delta)).toEqual({ applied: true, version: 3 });
    expect(s.catalog.apply(delta)).toEqual({ applied: false, reason: "stale", version: 3 });
    expect(s.catalog.lookup("item", "i1")?.name).toBe("Chicken Karahi");
  });

  it("a snapshot REPLACES rather than merges", () => {
    // A snapshot is the recovery path from the refusal above, so it must not leave behind
    // entries the org deleted while this device was out of contact.
    const s = store();
    s.catalog.apply({
      kind: "snapshot",
      version: 1,
      entries: [item("i1", "Karahi"), item("i2", "Naan")],
    });
    s.catalog.apply({ kind: "snapshot", version: 2, entries: [item("i1", "Karahi")] });
    expect(s.catalog.list("item").map((e) => e.id)).toEqual(["i1"]);
  });
});

describe("01-F55 — deletion is a tombstone, never a row removal", () => {
  it("hides a deleted item from the grid but keeps it resolvable by id", () => {
    // An open order, an unsettled bill or a reprint may reference an item the owner deleted
    // minutes ago, and that document must still render its NAME rather than an id.
    const s = store();
    s.catalog.apply({ kind: "snapshot", version: 1, entries: [item("i1", "Chicken Karahi")] });
    s.catalog.apply({
      kind: "delta",
      from_version: 1,
      version: 2,
      upserts: [],
      deletes: [{ kind: "item", id: "i1" }],
    });

    expect(s.catalog.list("item")).toEqual([]); // gone from the sellable grid
    expect(s.catalog.lookup("item", "i1")?.name).toBe("Chicken Karahi"); // still printable
  });

  it("un-deletes on a later upsert, because owners change their minds", () => {
    const s = store();
    s.catalog.apply({ kind: "snapshot", version: 1, entries: [item("i1", "Karahi")] });
    s.catalog.apply({
      kind: "delta",
      from_version: 1,
      version: 2,
      upserts: [],
      deletes: [{ kind: "item", id: "i1" }],
    });
    s.catalog.apply({
      kind: "delta",
      from_version: 2,
      version: 3,
      upserts: [item("i1", "Karahi")],
      deletes: [],
    });
    expect(s.catalog.list("item").map((e) => e.id)).toEqual(["i1"]);
  });
});

describe("01-F54 — an unknown item degrades, never blocks", () => {
  it("returns null for an unsynced id instead of throwing", () => {
    // 01-F17: a sale is never blocked. A screen that refuses to render because one item was
    // renamed upstream is a stopped till, and the caller renders the id instead.
    const s = store();
    expect(s.catalog.lookup("item", "never-seen")).toBeNull();
    expect(() => s.catalog.lookup("item", "never-seen")).not.toThrow();
  });

  it("keeps serving the catalog it already has after a refused delta", () => {
    // 01-F17 again: a device that lost a delta is stale, not broken. It must keep selling.
    const s = store();
    s.catalog.apply({ kind: "snapshot", version: 1, entries: [item("i1", "Karahi")] });
    s.catalog.apply({ kind: "delta", from_version: 99, version: 100, upserts: [], deletes: [] });
    expect(s.catalog.lookup("item", "i1")?.name).toBe("Karahi");
  });
});

describe("01-F52 — catalog is not ledger, and not a fold input", () => {
  it("does not touch the event log or the fold projections", () => {
    // The separation IS the requirement: catalog state must never be able to change a
    // projected value, or convergence would depend on which devices had synced their menu.
    const s = store();
    const before = s.status();
    s.catalog.apply({ kind: "snapshot", version: 1, entries: [item("i1", "Karahi")] });
    expect(s.status()).toEqual(before);
    expect(s.openOrders()).toEqual([]);
    expect(s.readAllEvents()).toEqual([]);
  });

  it("survives a refold — it is not rebuilt from events", () => {
    const s = store();
    s.catalog.apply({ kind: "snapshot", version: 4, entries: [item("i1", "Karahi")] });
    s.refold();
    expect(s.catalog.version()).toBe(4);
    expect(s.catalog.lookup("item", "i1")?.name).toBe("Karahi");
  });
});

describe("03-F38 — the kitchen short name lives in the catalog", () => {
  it("carries kitchen_name so a long item name is not a KOT layout problem", () => {
    const s = store();
    s.catalog.apply({
      kind: "snapshot",
      version: 1,
      entries: [{ ...item("i1", "Chicken Karahi Special (Family)"), kitchen_name: "CHK KARAHI" }],
    });
    expect(s.catalog.lookup("item", "i1")?.kitchen_name).toBe("CHK KARAHI");
  });
});

describe("display order", () => {
  it("lists in the org's configured order, not by id", () => {
    // 27-F3/27-F4: the grid is positional memory, so its order is the org's decision and
    // must be stable across devices — never whatever the id sort happened to produce.
    const s = store();
    s.catalog.apply({
      kind: "snapshot",
      version: 1,
      entries: [item("zzz", "First", 0), item("aaa", "Second", 1)],
    });
    expect(s.catalog.list("item").map((e) => e.name)).toEqual(["First", "Second"]);
  });

  it("filters by parent for a category page", () => {
    const s = store();
    s.catalog.apply({
      kind: "snapshot",
      version: 1,
      entries: [
        item("i1", "Karahi"),
        { kind: "item", id: "i2", name: "Kheer", parent_id: "cat-sweets", sort: 0 },
      ],
    });
    expect(s.catalog.list("item", "cat-sweets").map((e) => e.name)).toEqual(["Kheer"]);
    expect(s.catalog.list("item", "cat-mains").map((e) => e.name)).toEqual(["Karahi"]);
  });
});
