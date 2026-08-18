// Acceptance tests — 01-F75's two version clauses, applied to the resource its vocabulary was
// COPIED FROM. FRs: 01-F75, 01-F77, 01-F52, 01-F55, 01-F56.
//
// AUTHORED FROM SPEC TEXT ONLY, by a session that wrote no implementation.
//
// 01-F75 states both clauses as UNIFORM ACROSS RESOURCES and then says, in terms, that the code is
// not: "⚠ AND IT IS NOT UNIFORM IN THE CODE YET — measured, and closing it is scheduled rather than
// assumed … it clamps `at_version` forward-only on a **first** page, it replays intermediate delta
// rows, and it answers `version: 0` over a **populated** key. Each is the shape this FR forbids,
// surviving in the resource this FR's vocabulary was copied FROM … *the roster's two credential
// leaks were this code, copied.*" It is closed "in the change that generalises the frames (founder
// ruling, August 2026), because that change rewrites the catalog's serve path anyway and a rule
// stated as uniform while one resource visibly disobeys it is a rule the next author reads as
// advisory."
//
// ── WHY THESE ARE ASSERTED HERE AND WHAT THEY ARE NOT ──────────────────────────────────────────
//
// The catalog's cost is FRESHNESS and redundancy, not a credential — a menu carries no hash and
// 01-F53 freezes a line's price into the event at line-add. So nothing below claims a leak. What is
// asserted is the UNIFORMITY 01-F75 requires, on the resource where a divergence is read as
// precedent: `staffPage` is a copy of this function, and both of the roster's credential defects
// arrived that way.
//
// ⚠ THE CALL SITES, NOT THE CLAIMS, ARE WHAT MOVE IF THE SERVE PATH IS GENERALISED. These tests
// drive `catalogPage(db, org, have_version, from, at_version?)` because that is the function the FR
// names as diverging. If the frame generalisation renames or re-signatures it, re-point the calls —
// the three claims are the FR's and do not move with the function.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type CatalogEntry, catalogPage, catalogVersion, publishCatalog } from "../catalog.js";
import { closeDb, type Db, freshIdentity, openDb } from "./helpers.js";

// 01-F60's enabled grid is a REQUIRED input to a publish (founder ruling, July 2026), so the
// smallest REAL grid is declared and every sellable fixture prices its one cell — the completeness
// check therefore RUNS on every publish here rather than being skipped.
const BRANCH = "br-uniformity";
const ENABLED = { branches: [BRANCH], channels: ["counter"] };
const PRICED = [{ branch_id: BRANCH, channel: "counter", price_paisa: 45_000 }];

const item = (id: string, name: string, extra: Record<string, unknown> = {}): CatalogEntry =>
  ({ kind: "item", id, name, prices: PRICED, ...extra }) as CatalogEntry;

const ID_A = "019fa8c4-0000-7000-8000-0000000000a0";
const ID_B = "019fa8c4-0000-7000-8000-0000000000b0";
const ID_C = "019fa8c4-0000-7000-8000-0000000000c0";

/**
 * Three published versions over three ids, arranged so the two readings of a delta DIFFER:
 *
 *   v1  A@v1, B@v1, C@v1
 *   v2  A@v2                      ← the INTERMEDIATE row: superseded before the target
 *   v3  A@v3, B tombstoned        ← C is never touched again
 *
 * A delta from base 1 toward 3 is therefore **two** entries under 01-F75's fold (A at v3, B's
 * tombstone) and **three** under the row-replay reading it overrules. C separates "the fold" from
 * "a snapshot": a correct delta carries only the ids that CHANGED.
 *
 * The shape is deliberate — 01-F75 records that the roster's suite could not see its own leak
 * because "the leak needs a publication strictly between the claimed base and the target" and the
 * fixture had none.
 */
const seed = async (db: Db, org: string): Promise<void> => {
  expect(
    await publishCatalog(db, org, [item(ID_A, "A@v1"), item(ID_B, "B@v1"), item(ID_C, "C@v1")], {
      now: 1,
      enabled: ENABLED,
    }),
  ).toBe(1);
  expect(await publishCatalog(db, org, [item(ID_A, "A@v2")], { now: 2, enabled: ENABLED })).toBe(2);
  expect(
    await publishCatalog(db, org, [item(ID_A, "A@v3"), item(ID_B, "B@v1", { deleted: true })], {
      now: 3,
      enabled: ENABLED,
    }),
  ).toBe(3);
  expect(await catalogVersion(db, org)).toBe(3);
};

const idsOf = (entries: readonly CatalogEntry[]): string[] => entries.map((e) => e.id).sort();

describe("§K — 01-F75's version clauses are UNIFORM, and the catalog obeys them", () => {
  let db: Db;
  beforeAll(() => {
    db = openDb();
  });
  afterAll(async () => {
    await closeDb(db);
  });

  it("K1 01-F75: a first page (`from: 0`) asking `at_version: 1` is served the CURRENT version", async () => {
    // "The rule: `at_version` is honoured only on a CONTINUATION (`from > 0`), and a first page is
    // served the CURRENT version whatever it asks for." The FR's ground is that "a paged fetch
    // states the version it is toward *so that its own remaining pages are consistent*; it does not
    // entitle a caller to name any version it likes", and it is stated as uniform across resources
    // precisely so nobody reproduces it incorrectly the next time the set grows.
    const org = freshIdentity().org_id;
    await seed(db, org);

    const page = await catalogPage(db, org, 0, 0, 1);
    expect(page.version).toBe(3);
    // …and the BYTES are version 3's, not version 1's. A `version` field alone would pass against a
    // server that served the old rows under the new number, which is 01-F56's named failure.
    expect(page.entries.find((e) => e.id === ID_A)?.name).toBe("A@v3");
  });

  it("K2 01-F75: a CONTINUATION (`from > 0`) IS served the version it names — not 'ignore at_version'", async () => {
    // The control that stops K1 being satisfied by dropping the field. The clause narrows WHEN
    // `at_version` is honoured; it does not retire it, and retiring it would reopen the defect it
    // was introduced for: a publish landing mid-fetch changes both the version and the ordering the
    // offset indexes into, and the device commits a mixture of two menus under one number.
    const org = freshIdentity().org_id;
    await seed(db, org);

    const page = await catalogPage(db, org, 0, 1, 1);
    expect(page.version).toBe(1);
  });

  it("K3 01-F77/01-F52: a POPULATED key can never answer `version: 0`", async () => {
    // `0` has exactly one meaning on this wire — "the org has published nothing" (01-F52), "omitted,
    // never sent as `0`" (01-F77) — so a request naming version 0 over a key at version 3 must not
    // be answered with an empty snapshot at 0. A value naming no version leaves nothing to honour.
    //
    // Wire-reachable, which is what makes it a defect rather than an argument: `at_version` is a
    // non-negative integer on the frame, so every negative value is unreachable and **0 is legal**.
    const org = freshIdentity().org_id;
    await seed(db, org);

    for (const [have, from] of [
      [0, 1],
      [1, 1],
      [0, 0],
      [1, 0],
    ] as const) {
      const page = await catalogPage(db, org, have, from, 0);
      expect(page.version, `have=${have} from=${from}`).not.toBe(0);
      expect(page.version, `have=${have} from=${from}`).toBe(3);
    }
  });

  it("K4 01-F75: a DELTA carries ONE entry per changed id — the greatest version ≤ the target", async () => {
    // "A delta from A to B was implemented — and described in the catalog's inherited vocabulary —
    // as *every published row with `A < version <= B`* … So the rule: a delta carries ONE entry per
    // changed id, the greatest version ≤ the target — the same fold a snapshot at that version is,
    // restricted to the ids that changed. A device reaches the identical state either way, so
    // nothing is lost; the intermediate rows were never information the device needed."
    const org = freshIdentity().org_id;
    await seed(db, org);

    const page = await catalogPage(db, org, 1, 0);
    expect(page.form).toBe("delta");
    expect(page.base_version).toBe(1);
    expect(page.version).toBe(3);
    expect(page.complete).toBe(true);

    // Two ids changed after v1; A changed TWICE and appears once, at its greatest version.
    expect(idsOf(page.entries)).toEqual([ID_A, ID_B].sort());
    expect(page.entries).toHaveLength(2);
    const a = page.entries.filter((e) => e.id === ID_A);
    expect(a).toHaveLength(1);
    expect(a[0]?.name).toBe("A@v3");
    // The intermediate row is the thing that must not be there. Naming it explicitly, because the
    // count above passes against an implementation that keeps A@v2 and drops A@v3.
    expect(page.entries.some((e) => e.name === "A@v2")).toBe(false);
  });

  it("K5 01-F75: the delta IS the snapshot's fold, restricted to the changed ids", async () => {
    // "…the same fold a snapshot at that version is, restricted to the ids that changed." Asserted
    // as equality against the snapshot rather than against hand-written expectations, so the delta
    // and the snapshot cannot become two interpretations of one log — the divergence 03-F40's two
    // sensor bit layouts is this corpus's own record of.
    const org = freshIdentity().org_id;
    await seed(db, org);

    const snapshot = await catalogPage(db, org, 0, 0);
    expect(snapshot.form).toBe("snapshot");
    expect(snapshot.version).toBe(3);
    const delta = await catalogPage(db, org, 1, 0);

    for (const entry of delta.entries) {
      expect(
        snapshot.entries.find((e) => e.id === entry.id),
        entry.id,
      ).toEqual(entry);
    }
  });

  it("K6 01-F75: an id that did NOT change is absent from the delta (it is not a snapshot in disguise)", async () => {
    // The other control. A delta that answered with the whole fold would satisfy K4's "one entry per
    // id" and K5's equality while sending every device the entire menu on every reconnect.
    const org = freshIdentity().org_id;
    await seed(db, org);

    const delta = await catalogPage(db, org, 1, 0);
    expect(delta.entries.some((e) => e.id === ID_C)).toBe(false);
    const snapshot = await catalogPage(db, org, 0, 0);
    expect(snapshot.entries.some((e) => e.id === ID_C)).toBe(true);
  });

  it("K7 01-F55: the fold keeps the TOMBSTONE, exactly once", async () => {
    // A delete travels as a MARKED ENTRY, never as an absence, so a reprint of an order placed
    // before the deletion still renders the name. The fold must not drop it and must not double it.
    const org = freshIdentity().org_id;
    await seed(db, org);

    const delta = await catalogPage(db, org, 1, 0);
    const tombstones = delta.entries.filter((e) => e.id === ID_B);
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0]?.deleted).toBe(true);
    expect(tombstones[0]?.name).toBe("B@v1");
  });

  it("K8 01-F52: the fixture itself is real — three versions, three ids, one folded snapshot", async () => {
    // Anti-vacuity for every assertion above: if the publishes silently did nothing, an empty delta
    // would satisfy K4's "no A@v2" and K6's "no C" for the wrong reason.
    const org = freshIdentity().org_id;
    await seed(db, org);

    const snapshot = await catalogPage(db, org, 0, 0);
    expect(idsOf(snapshot.entries)).toEqual([ID_A, ID_B, ID_C].sort());
    expect(snapshot.entries.find((e) => e.id === ID_A)?.name).toBe("A@v3");
    expect(snapshot.entries.find((e) => e.id === ID_C)?.name).toBe("C@v1");
  });
});
