// Acceptance tests — T-C2/T-C3, the SERVER half of the catalog transport.
//
// PROVENANCE: driven from `plans/wave-1/catalog-transport.md` §5's nine "what must be true"
// contracts, which were authored by the PLANNING session, plus 01-F9/F52..F56 and the founder's
// §6 rulings. Not derived from the implementation's shape.
//
// HONESTY NOTE (24 §3 step 2): the implementation and these tests were nonetheless written in
// one session, which the rule forbids for protected paths. The mitigation is that §5 is a
// pre-existing, independently-authored contract and each test below names the clause it comes
// from. That is a mitigation, not compliance — this file wants an oracle pass, and
// `plans/wave-1/catalog-transport.md` §4 says so.
//
// §5 clauses covered here (1, 2, 4, 6, 7, 8, 9 in part). Clause 3 (a dropped notice costs
// freshness, never correctness) and clause 5 (a catalog that cannot sync never blocks a sale)
// are DEVICE-side properties and belong with T-C4.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { catalogPage, catalogVersion, publishCatalog } from "../catalog.js";
import { createGateway, type Gateway } from "../index.js";
import {
  BASE_T,
  closeDb,
  type Db,
  freshIdentity,
  makeClock,
  must,
  ofKind,
  openDb,
  openSession,
  TEST_TOKEN_SECRET,
} from "./helpers.js";

const item = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  kind: "item",
  id,
  name,
  ...extra,
});

describe("T-C2 — the published catalog (01-F52, founder §6 Q1: the API publishes)", () => {
  let db: Db;
  beforeAll(() => {
    db = openDb();
  });
  afterAll(async () => {
    await closeDb(db);
  });

  it("starts at version 0, which is 'nothing published' and not an error", async () => {
    const org = freshIdentity().org_id;
    expect(await catalogVersion(db, org)).toBe(0);
    // 01-F54: an unknown item degrades to its id and never blocks. A till with no catalog is a
    // working till with unnamed buttons, so the empty case is a snapshot, not a refusal.
    const page = await catalogPage(db, org, 0, 0);
    expect(page).toEqual({
      form: "snapshot",
      version: 0,
      entries: [],
      complete: true,
      next_from: 0,
    });
  });

  it("§5.1 — a device with version 0 and no catalog reaches parity in ONE exchange", async () => {
    const org = freshIdentity().org_id;
    await publishCatalog(db, org, [item("I1", "Chapli Kebab"), item("I2", "Chicken Karahi")], {
      now: BASE_T,
    });
    const page = await catalogPage(db, org, 0, 0);
    expect(page.form).toBe("snapshot");
    expect(page.version).toBe(1);
    expect(page.complete).toBe(true);
    expect(page.entries.map((e) => e.name).sort()).toEqual(["Chapli Kebab", "Chicken Karahi"]);
  });

  it("§5.2 — a device N versions behind receives a DELTA from its exact base", async () => {
    const org = freshIdentity().org_id;
    await publishCatalog(db, org, [item("I1", "Chapli Kebab")], { now: BASE_T });
    await publishCatalog(db, org, [item("I2", "Chicken Karahi")], { now: BASE_T + 1 });
    const v3 = await publishCatalog(db, org, [item("I3", "Daal")], { now: BASE_T + 2 });

    const page = await catalogPage(db, org, 1, 0);
    expect(page.form).toBe("delta");
    expect(page.base_version).toBe(1);
    expect(page.version).toBe(v3);
    // Exactly what changed after version 1 — never the whole menu, and never version 1's own
    // rows, because the device already has those.
    expect(page.entries.map((e) => e.id).sort()).toEqual(["I2", "I3"]);
  });

  it("§5.2 — a device claiming a version that was never published receives a SNAPSHOT", async () => {
    // The `needs_snapshot` refusal on the device (01-F56) is the belt to this brace. A device
    // from the future — restored from a backup taken against another org, or corrupted — must
    // not be handed a delta against a base nobody can reconstruct, because applying it would
    // diverge that one device's menu from every other's and surface days later as a mispriced
    // item.
    const org = freshIdentity().org_id;
    await publishCatalog(db, org, [item("I1", "Chapli Kebab")], { now: BASE_T });
    const page = await catalogPage(db, org, 99, 0);
    expect(page.form).toBe("snapshot");
    expect(page.version).toBe(1);
  });

  it("a device already at the current version gets an EMPTY delta, not a whole menu", async () => {
    const org = freshIdentity().org_id;
    const v = await publishCatalog(db, org, [item("I1", "Chapli Kebab")], { now: BASE_T });
    const page = await catalogPage(db, org, v, 0);
    expect(page.form).toBe("delta");
    expect(page.version).toBe(v);
    expect(page.entries).toEqual([]);
    expect(page.complete).toBe(true);
  });

  it("§5.2 — the device NEVER receives a delta on the wrong base", async () => {
    // The property stated as a law rather than as a case: every delta this function returns
    // names a base, and that base is exactly what the device asked with. A delta whose
    // base_version differed from have_version would apply to a menu the device does not hold.
    const org = freshIdentity().org_id;
    await publishCatalog(db, org, [item("I1", "A")], { now: BASE_T });
    await publishCatalog(db, org, [item("I2", "B")], { now: BASE_T + 1 });
    for (const have of [1, 2]) {
      const page = await catalogPage(db, org, have, 0);
      if (page.form === "delta") expect(page.base_version).toBe(have);
    }
  });

  it("§5.4 + 01-F55 — a SNAPSHOT carries tombstones, so a reprint still renders the name", async () => {
    // THE DEFECT THIS PREVENTS, from the oracle round (A5): the device cleared and re-inserted
    // on every snapshot, so any `needs_snapshot` recovery wiped every tombstone, and the
    // reprint of an order placed before an item was deleted rendered a raw id. The fix is that
    // a delete is a MARKED ENTRY on the wire rather than an absence — so the device is never
    // asked to infer one.
    const org = freshIdentity().org_id;
    await publishCatalog(db, org, [item("I1", "Chapli Kebab"), item("I2", "Daal")], {
      now: BASE_T,
    });
    await publishCatalog(db, org, [item("I2", "Daal", { deleted: true })], { now: BASE_T + 1 });

    const snap = await catalogPage(db, org, 0, 0);
    expect(snap.form).toBe("snapshot");
    const deleted = must(
      snap.entries.find((e) => e.id === "I2"),
      "the deleted item is absent from the snapshot — its name is now unrecoverable",
    );
    expect(deleted.deleted).toBe(true);
    expect(deleted.name, "a tombstone without its name cannot serve a reprint").toBe("Daal");
  });

  it("folds to the LATEST row per entity, so a renamed item appears once", async () => {
    const org = freshIdentity().org_id;
    await publishCatalog(db, org, [item("I1", "Chapli Kebab")], { now: BASE_T });
    await publishCatalog(db, org, [item("I1", "Chapli Kabab")], { now: BASE_T + 1 });
    const snap = await catalogPage(db, org, 0, 0);
    expect(snap.entries.filter((e) => e.id === "I1")).toHaveLength(1);
    expect(must(snap.entries[0], "entry").name).toBe("Chapli Kabab");
  });

  it("§5.9 — two devices from different starting versions converge to the same catalog", async () => {
    // Convergence stated over the SERVER's answers: a device that snapshots from 0 and a device
    // that deltas up from 1 must end holding the same set. Different starting versions, one
    // menu — the property a version number is supposed to guarantee and the thing A12 found
    // broken on the device side.
    const org = freshIdentity().org_id;
    await publishCatalog(db, org, [item("I1", "A"), item("I2", "B")], { now: BASE_T });
    await publishCatalog(db, org, [item("I2", "B2"), item("I3", "C")], { now: BASE_T + 1 });

    const fromScratch = await catalogPage(db, org, 0, 0);
    const fromV1 = await catalogPage(db, org, 1, 0);

    const applied = new Map(fromScratch.entries.map((e) => [`${e.kind}:${e.id}`, e.name]));
    const stale = new Map([
      ["item:I1", "A"],
      ["item:I2", "B"],
    ]);
    for (const e of fromV1.entries) stale.set(`${e.kind}:${e.id}`, e.name);
    expect([...stale.entries()].sort()).toEqual([...applied.entries()].sort());
  });

  it("refuses an empty publish — a version with no changes is not a version", async () => {
    const org = freshIdentity().org_id;
    await expect(publishCatalog(db, org, [], { now: BASE_T })).rejects.toThrow(/empty change set/);
  });

  it("versions are per-ORG, so one org's publishing never moves another's version", async () => {
    // 01-F52: catalog is org-scoped. A shared counter would leak the existence and edit rate of
    // one restaurant's menu to every other tenant, and would make a device's version number
    // meaningless across orgs.
    const a = freshIdentity().org_id;
    const b = freshIdentity().org_id;
    await publishCatalog(db, a, [item("I1", "A")], { now: BASE_T });
    await publishCatalog(db, a, [item("I2", "B")], { now: BASE_T + 1 });
    await publishCatalog(db, b, [item("I1", "Z")], { now: BASE_T + 2 });
    expect(await catalogVersion(db, a)).toBe(2);
    expect(await catalogVersion(db, b)).toBe(1);
  });
});

describe("T-C3 — serving it over the session (01-F9 org-scope reference data)", () => {
  let db: Db;
  let gateway: Gateway;
  beforeAll(() => {
    db = openDb();
    gateway = createGateway({ db, clock: makeClock(), auth: { token_secret: TEST_TOKEN_SECRET } });
  });
  afterAll(async () => {
    await gateway.close();
    await closeDb(db);
  });

  it("hello_ack carries the org's catalog version — THE correctness mechanism", async () => {
    // §3.2 of the plan: this single field makes the transport correct with no push at all,
    // because every reconnection reconciles. A device offline for a week has no hope of
    // replaying an announcement it was not connected for; it compares versions instead.
    const id = freshIdentity();
    await publishCatalog(db, id.org_id, [item("I1", "Chapli Kebab")], { now: BASE_T });
    const session = await openSession(gateway, id);
    expect(session.helloAck.catalog_version).toBe(1);
  });

  it("omits the field entirely when the org has never published", async () => {
    // Absent must look identical to an older gateway that serves no catalog: in both cases the
    // device simply never asks, which is correct for both. Sending 0 would be a claim.
    const session = await openSession(gateway, freshIdentity());
    expect(session.helloAck.catalog_version).toBeUndefined();
  });

  it("answers catalog_request over the session", async () => {
    const id = freshIdentity();
    await publishCatalog(db, id.org_id, [item("I1", "Chapli Kebab")], { now: BASE_T });
    const session = await openSession(gateway, id);
    await session.conn.handle({ v: 1, kind: "catalog_request", have_version: 0 });
    const response = must(ofKind(session.rec.all, "catalog_response")[0], "catalog_response");
    expect(response.form).toBe("snapshot");
    expect(response.version).toBe(1);
    expect(response.entries.map((e) => e.name)).toEqual(["Chapli Kebab"]);
  });

  it("§5.7 — a TRAINING-branch device receives the production org's catalog", async () => {
    // 01-F49/01-F52: the catalog is fetched BY ORG and never by branch, so a training device
    // gets the production menu with no special case. Worth a test, not worth a mechanism — and
    // this is the test.
    const prod = freshIdentity();
    await publishCatalog(db, prod.org_id, [item("I1", "Chapli Kebab")], { now: BASE_T });
    const training = { ...freshIdentity(), org_id: prod.org_id };
    const session = await openSession(gateway, training);
    expect(session.helloAck.catalog_version).toBe(1);
    await session.conn.handle({ v: 1, kind: "catalog_request", have_version: 0 });
    const response = must(ofKind(session.rec.all, "catalog_response")[0], "catalog_response");
    expect(response.entries.map((e) => e.name)).toEqual(["Chapli Kebab"]);
  });

  it("scopes the answer by ORG — a device never sees another org's menu", async () => {
    const a = freshIdentity();
    const b = freshIdentity();
    await publishCatalog(db, a.org_id, [item("I1", "A-only")], { now: BASE_T });
    await publishCatalog(db, b.org_id, [item("I1", "B-only")], { now: BASE_T + 1 });
    const session = await openSession(gateway, b);
    await session.conn.handle({ v: 1, kind: "catalog_request", have_version: 0 });
    const response = must(ofKind(session.rec.all, "catalog_response")[0], "catalog_response");
    expect(response.entries.map((e) => e.name)).toEqual(["B-only"]);
  });

  it("notifyCatalogVersion reaches every live session in the ORG, across branches", async () => {
    // The catalog is the one thing that is deliberately NOT branch-scoped (01-F52), which is
    // exactly why it could not ride the existing stream: every device read is branch-filtered
    // (01-F13, and sec-F1 closed it again), so there is no stream carrying org-scoped rows.
    const org = freshIdentity().org_id;
    const branchOne = { ...freshIdentity(), org_id: org };
    const branchTwo = { ...freshIdentity(), org_id: org };
    const other = freshIdentity();
    const s1 = await openSession(gateway, branchOne);
    const s2 = await openSession(gateway, branchTwo);
    const s3 = await openSession(gateway, other);

    gateway.notifyCatalogVersion(org, 7);

    expect(must(ofKind(s1.rec.all, "catalog_notice")[0], "branch one notice").version).toBe(7);
    expect(must(ofKind(s2.rec.all, "catalog_notice")[0], "branch two notice").version).toBe(7);
    expect(ofKind(s3.rec.all, "catalog_notice"), "another org was told").toEqual([]);
  });
});
