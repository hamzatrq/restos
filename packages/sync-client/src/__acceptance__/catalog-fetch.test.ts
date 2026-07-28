// Acceptance tests — T-C4, the DEVICE half of the catalog transport.
//
// PROVENANCE: driven from `plans/wave-1/catalog-transport.md` §5's contracts (authored by the
// planning session) plus 01-F9/F52..F56. Clauses 3 and 5 live here and nowhere else, because
// both are statements about the DEVICE:
//
//   §5.3 — a dropped `catalog_notice` costs FRESHNESS and never CORRECTNESS.
//   §5.5 — a catalog that cannot sync NEVER blocks a sale (01-F17, 01-F54).
//
// HONESTY NOTE (24 §3 step 2): impl and tests are one session on a protected path. The
// mitigation is that §5 pre-exists and each test names its clause. This wants the oracle pass
// the plan's §4 already schedules.

import { describe, expect, it } from "vitest";
import { createCatalogFetch, type FetchStep, type WireCatalogResponse } from "../catalog-fetch.js";
import { openStore } from "../device-store.js";
import { identity, must } from "./builders.js";

const entry = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  kind: "item",
  id,
  name,
  ...extra,
});

/** Narrow a step to its update. `done: false` carries no `update` field at all, which is the
 *  point — an incomplete fetch has nothing a caller could apply even by mistake. */
const finished = (step: FetchStep) => (step.done ? step.update : null);

const page = (over: Partial<WireCatalogResponse> = {}): WireCatalogResponse => ({
  form: "snapshot",
  version: 1,
  entries: [],
  complete: true,
  next_from: 0,
  ...over,
});

describe("T-C4 — accumulating catalog pages (§5.4: a snapshot applies WHOLE or not at all)", () => {
  it("applies a single-page snapshot immediately", () => {
    const fetch = createCatalogFetch(0);
    const step = fetch.accept(page({ version: 3, entries: [entry("I1", "Chapli Kebab")] }));
    expect(step.done).toBe(true);
    const update = must(step.done ? step.update : null, "update");
    expect(update.kind).toBe("snapshot");
    expect(update.version).toBe(3);
  });

  it("§5.4 — a PAGED snapshot yields NOTHING until the last page", () => {
    // The property that matters, and the reason this is a pure accumulator: a device that
    // applied each page as it arrived would hold half a menu in the window between them — on a
    // till, mid-service, with the rest arriving only if the link survives. 01-F56's recovery
    // path is exactly when the link is least trustworthy.
    const fetch = createCatalogFetch(0);
    const first = fetch.accept(
      page({ version: 3, entries: [entry("I1", "A")], complete: false, next_from: 1 }),
    );
    expect(first.done, "a partial snapshot was applied").toBe(false);
    // `at_version` joined this shape in the round-2 fix: a continuation must name the version
    // page 1 was serving, or the server is free to answer from a newer one mid-fetch.
    expect(first.done === false && first.fetchMore).toEqual({
      have_version: 0,
      from: 1,
      at_version: 3,
    });

    const second = fetch.accept(page({ version: 3, entries: [entry("I2", "B")] }));
    expect(second.done).toBe(true);
    const update = must(second.done ? second.update : null, "update");
    expect(update.kind).toBe("snapshot");
    // BOTH pages, committed once.
    expect(update.kind === "snapshot" && update.entries.map((e) => e.id)).toEqual(["I1", "I2"]);
  });

  it("§5.4 — an INTERRUPTED snapshot leaves nothing to apply, not a partial one", () => {
    // Stated as the absence it is: the accumulator is discarded with its session, so an
    // interrupted fetch contributes nothing at all rather than a prefix of a menu.
    const fetch = createCatalogFetch(0);
    const step = fetch.accept(
      page({ version: 3, entries: [entry("I1", "A")], complete: false, next_from: 1 }),
    );
    expect(step.done).toBe(false);
    // No `update` field exists on an incomplete step — there is nothing a caller could apply
    // even by mistake, which is stronger than returning one and asking callers not to use it.
    expect("update" in step).toBe(false);
  });

  it("01-F55 — a snapshot's deleted rows TRAVEL as entries and are ALSO named as tombstones", () => {
    // Both, not either. The row is what lets a reprint of an older order render the name; the
    // tombstone is what keeps the item off the sellable grid. The oracle round (A5) found the
    // device destroying tombstones on every snapshot recovery, so a deleted dish became an
    // unrenderable raw id — this is the shape that makes that impossible to reintroduce.
    const fetch = createCatalogFetch(0);
    const step = fetch.accept(
      page({
        version: 2,
        entries: [entry("I1", "Live"), entry("I2", "Deleted", { deleted: true })],
      }),
    );
    const update = must(step.done ? step.update : null, "update");
    if (update.kind !== "snapshot") throw new Error("expected a snapshot");
    expect(update.entries.map((e) => e.id).sort()).toEqual(["I1", "I2"]);
    expect(update.tombstones).toEqual([{ kind: "item", id: "I2" }]);
  });

  it("splits a delta into upserts and deletes", () => {
    const fetch = createCatalogFetch(1);
    const step = fetch.accept(
      page({
        form: "delta",
        version: 3,
        base_version: 1,
        entries: [entry("I1", "Renamed"), entry("I2", "Gone", { deleted: true })],
      }),
    );
    const update = must(step.done ? step.update : null, "update");
    if (update.kind !== "delta") throw new Error("expected a delta");
    expect(update.from_version).toBe(1);
    expect(update.version).toBe(3);
    expect(update.upserts.map((e) => e.id)).toEqual(["I1"]);
    expect(update.deletes).toEqual([{ kind: "item", id: "I2" }]);
  });

  it("refuses a delta with NO base rather than guessing what it applies to", () => {
    // Guessing is how one device's menu diverges from every other's — undetectable at the till
    // and surfacing days later as a mispriced item. Returning nothing is the safe answer: the
    // next reconnect reconciles through hello_ack.
    const fetch = createCatalogFetch(1);
    const step = fetch.accept(page({ form: "delta", version: 3, entries: [entry("I1", "X")] }));
    expect(step.done && step.update).toBeNull();
  });

  it("treats an empty delta at the held version as 'you are current', not an error", () => {
    const fetch = createCatalogFetch(4);
    const step = fetch.accept(page({ form: "delta", version: 4, base_version: 4, entries: [] }));
    expect(step.done && step.update).toBeNull();
  });

  it("ORACLE ROUND 2 / A4 — refuses pages that disagree about which version they are", () => {
    // THE DEFECT: the accumulator took entries from every page and `version` from the LAST one.
    // The server re-read the current version per page, so a publish landing between page 1 and
    // page 2 committed page 1's rows FROM THE OLD MENU under the NEW version number — after
    // which `hello_ack` matched forever and the edit was never re-fetched. Silent, permanent,
    // and 01-F56's named failure: "diverges one device's menu from every other's, undetectable
    // at the till, surfacing days later as a mispriced item".
    const fetch = createCatalogFetch(0);
    const first = fetch.accept(
      page({ version: 5, entries: [entry("I1", "old-menu")], complete: false, next_from: 1 }),
    );
    expect(first.done).toBe(false);
    // The continuation must carry the pin, so the server can serve the SAME version.
    expect(first.done === false && first.fetchMore.at_version).toBe(5);

    // A page from a different version: refused outright rather than spliced.
    const second = fetch.accept(page({ version: 6, entries: [entry("I2", "new-menu")] }));
    expect(second.done).toBe(true);
    expect(
      second.done ? second.update : "not done",
      "pages from two versions were combined into one commit",
    ).toBeNull();
  });

  it("A4 — a form or base change is refused too, not only a version change", () => {
    const fetch = createCatalogFetch(3);
    fetch.accept(
      page({
        form: "delta",
        version: 9,
        base_version: 3,
        entries: [],
        complete: false,
        next_from: 1,
      }),
    );
    // Same version, different base — page 1 applied to base 3 and this one claims base 7.
    const step = fetch.accept(page({ form: "delta", version: 9, base_version: 7, entries: [] }));
    expect(step.done && step.update).toBeNull();
  });

  it("A4 — a consistent multi-page fetch still completes, so the guard is not a blanket refusal", () => {
    // The guard must reject disagreement WITHOUT rejecting ordinary paging — otherwise it would
    // "fix" the splice by making every large menu unfetchable.
    const fetch = createCatalogFetch(0);
    fetch.accept(page({ version: 5, entries: [entry("I1", "A")], complete: false, next_from: 1 }));
    const done = fetch.accept(page({ version: 5, entries: [entry("I2", "B")] }));
    const update = must(finished(done), "update");
    if (update.kind !== "snapshot") throw new Error("expected a snapshot");
    expect(update.version).toBe(5);
    expect(update.entries.map((e) => e.id)).toEqual(["I1", "I2"]);
  });
});

describe("T-C4 — applying to the real store (§5.3, §5.5)", () => {
  const freshStore = () => openStore({ path: ":memory:", identity: identity() });

  it("§5.1 — version 0 to parity in one exchange, against the real store", () => {
    const store = freshStore();
    const fetch = createCatalogFetch(store.catalog.version());
    const step = fetch.accept(
      page({ version: 1, entries: [entry("I1", "Chapli Kebab"), entry("I2", "Daal")] }),
    );
    const update = must(step.done ? step.update : null, "update");
    expect(store.catalog.apply(update)).toEqual({ applied: true, version: 1 });
    expect(
      store.catalog
        .list("item")
        .map((e) => e.name)
        .sort(),
    ).toEqual(["Chapli Kebab", "Daal"]);
    store.close?.();
  });

  it("§5.3 — dropping EVERY notice costs freshness and never correctness", () => {
    // Modelled exactly as the clause states it: no notice is ever delivered, and the device
    // still converges — because reconciliation is driven by comparing versions at hello, not by
    // receiving an announcement. This is the property that makes a notice safe to lose, which a
    // lossy link will do.
    const store = freshStore();
    // Publish-side moves to version 3 while the device hears nothing at all.
    const serverVersion = 3;
    expect(store.catalog.version()).toBe(0);

    // A reconnect: the device compares and fetches on its own initiative.
    const behind = store.catalog.version() < serverVersion;
    expect(behind, "the device could not tell it was behind without a notice").toBe(true);

    const fetch = createCatalogFetch(store.catalog.version());
    const step = fetch.accept(
      page({ version: serverVersion, entries: [entry("I1", "Chapli Kebab")] }),
    );
    const update = must(step.done ? step.update : null, "update");
    expect(store.catalog.apply(update)).toEqual({ applied: true, version: 3 });
    expect(store.catalog.version()).toBe(serverVersion);
    store.close?.();
  });

  it("§5.5 + 01-F54 — a catalog that never syncs does not block anything", () => {
    // With the fetch failing on every attempt the store holds nothing, and the property that
    // matters is that resolution DEGRADES rather than throwing: 01-F53 captures the price into
    // the event at add time, so a stale catalog costs a word and never a rupee.
    const store = freshStore();
    expect(store.catalog.version()).toBe(0);
    expect(store.catalog.lookup("item", "I-never-synced")).toBeNull();
    expect(store.catalog.list("item")).toEqual([]);
    // The till's own read models are entirely unaffected — no catalog, no fold dependency.
    expect(() => store.openOrders()).not.toThrow();
    expect(() => store.kitchenQueue()).not.toThrow();
    store.close?.();
  });

  it("§5.8 — the catalog is still not an input to any fold (01-F52)", () => {
    // The structural guarantee, re-stated at the transport boundary: applying a catalog update
    // does ZERO fold work. If a projection ever started reading a name, this counter would move
    // and the fold would depend on catalog sync state at fold time — the 01-F34 break law 1
    // exists to prevent.
    const store = freshStore();
    const before = store.foldStats().events_folded;
    const fetch = createCatalogFetch(0);
    const step = fetch.accept(page({ version: 1, entries: [entry("I1", "Chapli Kebab")] }));
    store.catalog.apply(must(step.done ? step.update : null, "update"));
    expect(store.foldStats().events_folded, "a catalog update did fold work").toBe(before);
    store.close?.();
  });

  it("§5.2 — a delta on a base the device does not hold is REFUSED with needs_snapshot", () => {
    // 01-F56, and the belt to the server's braces. Applying it would diverge this one device's
    // menu from every other's, which is undetectable at the till.
    const store = freshStore();
    const first = createCatalogFetch(0).accept(page({ version: 1, entries: [entry("I1", "A")] }));
    store.catalog.apply(must(first.done ? first.update : null, "update"));

    const stale = createCatalogFetch(1).accept(
      page({ form: "delta", version: 9, base_version: 7, entries: [entry("I2", "B")] }),
    );
    const result = store.catalog.apply(must(stale.done ? stale.update : null, "update"));
    expect(result).toEqual({ applied: false, reason: "needs_snapshot", version: 1 });
    store.close?.();
  });

  it("§5.9 — two devices from different starting versions converge byte-identically", () => {
    // One device snapshots from scratch; the other deltas up from version 1. Same menu, and the
    // comparison is on the full projected list rather than on a version number, because a
    // version number matching while the contents differ is exactly defect A12.
    const scratch = freshStore();
    const incremental = freshStore();

    const v1 = page({ version: 1, entries: [entry("I1", "A"), entry("I2", "B")] });
    incremental.catalog.apply(must(finished(createCatalogFetch(0).accept(v1)), "v1 update"));
    incremental.catalog.apply(
      must(
        finished(
          createCatalogFetch(1).accept(
            page({
              form: "delta",
              version: 2,
              base_version: 1,
              entries: [entry("I2", "B2"), entry("I3", "C")],
            }),
          ),
        ),
        "delta update",
      ),
    );

    scratch.catalog.apply(
      must(
        finished(
          createCatalogFetch(0).accept(
            page({
              version: 2,
              entries: [entry("I1", "A"), entry("I2", "B2"), entry("I3", "C")],
            }),
          ),
        ),
        "snapshot update",
      ),
    );

    expect(incremental.catalog.version()).toBe(scratch.catalog.version());
    expect(incremental.catalog.list("item")).toEqual(scratch.catalog.list("item"));
    scratch.close?.();
    incremental.close?.();
  });
});

describe("A16 — a paged DELTA is accumulated exactly like a snapshot", () => {
  // An earlier comment claimed deltas were applied per page. The code never did, and no test
  // distinguished the two forms — every paging test used `form: "snapshot"`, so the comment
  // could have been true or false and the suite would not have known. This is the test that
  // makes the rule observable.
  //
  // The code is the right behaviour: a prefix of a delta is only a consistent step forward if
  // the device records how far it got, and it does not — it would commit the delta's FINAL
  // version while holding a prefix of its rows, which is the same "reports parity while holding
  // a partial menu" failure a spliced snapshot causes.
  it("yields nothing until the delta's last page", () => {
    const fetch = createCatalogFetch(2);
    const first = fetch.accept(
      page({
        form: "delta",
        version: 5,
        base_version: 2,
        entries: [entry("I1", "A")],
        complete: false,
        next_from: 1,
      }),
    );
    expect(first.done, "a partial delta was applied").toBe(false);

    const second = fetch.accept(
      page({ form: "delta", version: 5, base_version: 2, entries: [entry("I2", "B")] }),
    );
    const update = must(finished(second), "update");
    if (update.kind !== "delta") throw new Error("expected a delta");
    expect(update.from_version).toBe(2);
    expect(update.version).toBe(5);
    expect(
      update.upserts.map((e) => e.id),
      "both pages must commit together",
    ).toEqual(["I1", "I2"]);
  });
});
