// Acceptance tests — T-3, the WRITER and SERVER layer of `01-F60` (price) and `03-F50` (station).
//
// Authored from spec text ONLY, by a session that has seen no implementation and, deliberately,
// not `plans/wave-1/channel-pricing-and-the-counter-loop.md` either (`24 §3` step 2):
//   `specs/01-kernel-sync.md` — `01-F60`:
//     • "Every enabled (branch, channel) pair is priced, and this is enforced at the WRITER. A
//       publish containing a sellable, non-tombstoned entry that omits an enabled pair's price is
//       REFUSED, naming the entry, the branch and the channel."
//     • "There is deliberately no fallback to a house price... Refusing at publish turns that
//       into one failed save with a message. The one-number convenience belongs in the editor
//       (`14-F29`), which a bulk import (`15-F8`) or an API client BYPASSES and this check does not."
//     • "The branch axis is DATA, not a second scope — the catalog stays org-scoped and
//       byte-identical everywhere... It would be a serious error to implement that by serving
//       each branch a filtered catalog... per-branch responses would make one version number mean
//       DIFFERENT BYTES on different devices, destroying the premise `01-F56`'s `divergent`
//       detection rests on. Instead the published artifact carries EVERY branch's prices, one
//       version, identical for all."
//     • "Non-sellable kinds (`category`, `modifier_group`) carry none."
//     Plus `01-F52` (org-scoped reference data), `01-F55` (a tombstone is a marked entry).
//   `specs/03-kitchen-fulfillment.md` — `03-F50`: `station` is CATALOG data and rides this
//     channel, "one field per item on a channel that is already built, versioned, tombstoned and
//     delivering (`01-F52`..`01-F56`)".
//   `specs/02-pos-app.md` — `02-F42`: the closed channel set; it is a price key.
//   `specs/14-backoffice.md` — `14-F29`: the editor collects a price for every enabled
//     (branch, channel) pair — a ROW PER BRANCH, A COLUMN PER ENABLED CHANNEL. That grid is
//     where the "enabled set" of this suite comes from. The editor itself does not exist and
//     nothing here tests it.
//   `specs/00-platform-overview.md §6` (integer paisa) and `§7` layer 2 ("channels enabled").
//
// ── RED-AWAITING-IMPLEMENTATION ─────────────────────────────────────────────────────────────
// `publishCatalog` validates each entry against `CatalogEntryWire` and nothing else; the wire
// schema knows neither field, and `rowToEntry` projects an explicit column list, so a price or a
// station handed to `publishCatalog` today is written nowhere and served back never. **14 of the
// 16 tests below are red. TWO ARE GREEN and say so in their own titles** — the "no enabled pairs
// declared ⇒ nothing is omitted" guard and the per-org isolation of the refusal — and each is a
// regression guard, not evidence of a closure. (`oracle-round-2-findings.md` A12.)
//
// ── PINNED INTERPRETATIONS — where the FRs stop short ────────────────────────────────────────
//
// 1. **WHERE THE ENABLED SET COMES FROM IS THE LARGEST GAP IN `01-F60`, and it is a FINDING.**
//    The FR sources it from "`00 §7` layer 2: channels enabled and the org's branches" — and
//    `03-F50` establishes, for the station ruling, that an org-config plane "requires an
//    org-config model, a store, a distribution path to devices and a `config.changed` payload
//    schema — **none of which exists**". There is therefore nowhere for `publishCatalog` to READ
//    an enabled set from. It is pinned as a caller-supplied argument,
//    `opts.enabled = { branches, channels }`, expanded to the full cross product exactly as
//    `14-F29`'s grid describes it (a row per branch, a column per enabled channel).
// 2. **`enabled` IS OPTIONAL, AND ABSENT MEANS "NOTHING IS ENABLED".** Consequence of 1: a
//    publish that declares no enabled pairs omits none and is refused for nothing. This is
//    spec-consistent (the FR refuses an OMITTED ENABLED pair, and there are none) and it is what
//    keeps every pre-`01-F60` publish in this service legal. It is also a hole — a caller that
//    forgets the argument gets no check at all — and that hole is the FINDING in 1, not a design
//    this file endorses.
// 3. PRICE SHAPE — `prices: { branch_id, channel, price_paisa }[]`, matching the wire suite. The
//    triple was chosen over a nested record because `01-F60`'s refusal must NAME the branch and
//    the channel, which reads off a triple directly.
// 4. THE REFUSAL IS A `RangeError` WITH A MESSAGE, matching the two refusals `publishCatalog`
//    already raises (empty change set, unservable entry). `01-F60` names no error class; what it
//    does specify is what the message must CONTAIN, and that is what is asserted.
//
// ── DELIBERATELY NOT COVERED, so no coverage is claimed that does not exist ───────────────────
// - AN ENTRY PRICED FOR A PAIR THAT IS **NOT** ENABLED. `01-F60` refuses an omission and says
//    nothing about a surplus. Asserting either way would invent an FR. FINDING.
// - `modifier`. `01-F60` names `item`/`variant` sellable and `category`/`modifier_group` as
//    carrying none; the fifth kind is unmentioned and is priced in every real menu. FINDING.
// - THE EDITOR (`14-F29`). It does not exist.
// - RESOLUTION AT LINE-ADD — a DEVICE rule, pinned in `packages/sync-client`.
// - STATION INHERITANCE — a DEVICE rule (`03-F50`: "a device resolves item → station locally
//    from the catalog it already holds"); pinned in `packages/sync-client`. This suite pins only
//    that the field is stored and served.

import { decodeMessage, encodeMessage } from "@restos/sync-protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type CatalogEntry, catalogPage, catalogVersion, publishCatalog } from "../catalog.js";
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

// ── the surface T-3 contracts (interpretation 1), reached through a cast so this file
// typechecks before `publishCatalog` grows the argument.

const DHA = "br-dha";
const SADDAR = "br-saddar";

/** `14-F29`'s grid for a two-branch chain that has enabled two of `02-F42`'s five channels. */
const ENABLED = { branches: [DHA, SADDAR], channels: ["counter", "foodpanda"] } as const;

type Price = { branch_id: string; channel: string; price_paisa: number };

const at = (branch_id: string, channel: string, price_paisa: number): Price => ({
  branch_id,
  channel,
  price_paisa,
});

/** Every cell of the `ENABLED` grid, so a case can knock exactly one out. */
const FULL_GRID: readonly Price[] = [
  at(DHA, "counter", 145_000),
  at(DHA, "foodpanda", 168_000),
  at(SADDAR, "counter", 118_000),
  at(SADDAR, "foodpanda", 139_000),
];

const entry = (
  kind: string,
  id: string,
  name: string,
  extra: Record<string, unknown> = {},
): CatalogEntry => ({ kind, id, name, ...extra }) as CatalogEntry;

type PublishOpts = Parameters<typeof publishCatalog>[3];

const publish = (
  db: Db,
  org: string,
  entries: readonly CatalogEntry[],
  extra: Record<string, unknown> = {},
): Promise<number> =>
  publishCatalog(db, org, entries, { now: BASE_T, ...extra } as unknown as PublishOpts);

/** Read the two fields off a served page entry, which does not declare them yet. */
type ServedEntry = { id: string; prices?: readonly Price[]; station?: string | null };
const served = (e: unknown): ServedEntry => e as unknown as ServedEntry;

/**
 * A REFUSAL that can fail more than one way (`oracle-round-2-findings.md` §C: "a refusal that
 * leaves a partial version behind is the actual A3 hazard, and 'it threw' does not catch it").
 * Asserts the throw, asserts the message names the entry / branch / channel `01-F60` requires it
 * to name, and asserts the version table is untouched by RE-READING it.
 */
const refusedLeavingNothing = async (
  db: Db,
  org: string,
  versionBefore: number,
  publishing: Promise<number>,
  names: readonly string[],
): Promise<void> => {
  let message: string | undefined;
  await publishing.then(
    (v) => {
      throw new Error(`publishCatalog ACCEPTED an incomplete grid and committed version ${v}`);
    },
    (e: unknown) => {
      message = e instanceof Error ? e.message : String(e);
    },
  );
  for (const name of names) {
    expect(
      message,
      `the refusal does not name ${name} (01-F60: "naming the entry, the ` +
        `branch and the channel")`,
    ).toContain(name);
  }
  // THE POISONED-VERSION CHECK. A3 was an org-wide sync outage caused by a version that existed
  // and could not be served; a refusal that half-commits is the same defect with a different
  // trigger. Re-read the table rather than trust the throw.
  expect(await catalogVersion(db, org), "a refused publish left a version behind").toBe(
    versionBefore,
  );
};

describe("01-F60 — the writer refuses an incomplete (branch, channel) grid", () => {
  let db: Db;
  beforeAll(() => {
    db = openDb();
  });
  afterAll(async () => {
    await closeDb(db);
  });

  it("ACCEPTS a fully-priced sellable entry and serves every cell back", async () => {
    // The anchor for every refusal below: the identical publish with the grid complete is
    // accepted, so a refusal is one CELL away from a passing save and not a malformed fixture.
    const org = freshIdentity().org_id;
    const v = await publish(
      db,
      org,
      [entry("item", "I-karahi", "Chicken Karahi", { prices: FULL_GRID })],
      { enabled: ENABLED },
    );
    expect(v).toBe(1);
    const page = await catalogPage(db, org, 0, 0);
    expect(served(must(page.entries[0], "the published entry")).prices).toEqual([...FULL_GRID]);
  });

  it("REFUSES an entry that omits one enabled pair, naming the entry, the branch and the channel", async () => {
    // `01-F60`'s named hazard: "a fallback makes a forgotten aggregator price sell at the
    // in-restaurant rate while commission still takes its cut — invisible at the till, frozen
    // permanently by `01-F53`, and surfacing months later as unattributable thin margin."
    // The forgotten cell here is exactly that: Saddar's foodpanda price.
    const org = freshIdentity().org_id;
    const incomplete = FULL_GRID.filter(
      (p) => !(p.branch_id === SADDAR && p.channel === "foodpanda"),
    );
    await refusedLeavingNothing(
      db,
      org,
      0,
      publish(db, org, [entry("item", "I-karahi", "Chicken Karahi", { prices: incomplete })], {
        enabled: ENABLED,
      }),
      ["I-karahi", SADDAR, "foodpanda"],
    );
  });

  it("REFUSES an entry with NO prices at all when pairs are enabled", async () => {
    const org = freshIdentity().org_id;
    await refusedLeavingNothing(
      db,
      org,
      0,
      publish(db, org, [entry("item", "I-daal", "Daal")], { enabled: ENABLED }),
      ["I-daal"],
    );
  });

  it("a `variant` is sellable too, and is checked the same way", async () => {
    // `01-F60` names both: "Every sellable entry (`item`, `variant`)". A check that reached only
    // `item` would leave every half-portion and every size unpriced on the aggregator channel.
    const org = freshIdentity().org_id;
    await refusedLeavingNothing(
      db,
      org,
      0,
      publish(
        db,
        org,
        [
          entry("item", "I-karahi", "Chicken Karahi", { prices: FULL_GRID }),
          entry("variant", "V-half", "Half", {
            parent_id: "I-karahi",
            prices: [at(DHA, "counter", 78_000)],
          }),
        ],
        { enabled: ENABLED },
      ),
      // Only the ENTRY is named here: three cells are missing and no FR says which one a
      // refusal reports first. The branch/channel naming is pinned by the single-omission test
      // above, where there is exactly one answer.
      ["V-half"],
    );
  });

  it("THE REFUSAL LEAVES NO PARTIAL VERSION — the prior menu is intact and the next version is N+1", async () => {
    // A3 in one test. The failure mode is not "an exception was raised", it is a version that
    // exists, cannot be served, and puts every device in the org into a reconnect loop that a
    // corrective publish does not heal. So: publish a good v1, refuse a bad one, then prove
    // (a) v1's rows are untouched, (b) no trace of the refused entry is servable, and
    // (c) the refused publish consumed no version number.
    const org = freshIdentity().org_id;
    const v1 = await publish(
      db,
      org,
      [entry("item", "I-karahi", "Chicken Karahi", { prices: FULL_GRID })],
      { enabled: ENABLED },
    );
    expect(v1).toBe(1);

    await refusedLeavingNothing(
      db,
      org,
      v1,
      publish(db, org, [entry("item", "I-poison", "Seekh Kebab", { prices: [] })], {
        enabled: ENABLED,
      }),
      ["I-poison"],
    );

    const afterRefusal = await catalogPage(db, org, 0, 0);
    expect(afterRefusal.version).toBe(v1);
    expect(
      afterRefusal.entries.map((e) => e.id),
      "the refused entry is servable",
    ).toEqual(["I-karahi"]);

    // (c) The next good publish is version 2, not 3 — a refusal that burned a number would leave
    // a hole that a delta range spans forever.
    const v2 = await publish(db, org, [entry("item", "I-daal", "Daal", { prices: FULL_GRID })], {
      enabled: ENABLED,
      now: BASE_T + 1,
    });
    expect(v2).toBe(2);
  });

  it("01-F55 — a TOMBSTONED sellable entry needs no prices, and a live one does", async () => {
    // `01-F60` refuses "a sellable, NON-TOMBSTONED entry". A delete travels as a marked entry
    // (`01-F55`) whose only job is to keep the name resolvable for a reprint; requiring a price
    // grid on it would make deleting an item impossible once a channel was enabled.
    //
    // DELTA ISOLATION: the same unpriced entry ± `deleted: true`. Asserting only that the
    // tombstone publishes would pass today, when nothing is checked at all.
    const org = freshIdentity().org_id;
    const v = await publish(db, org, [entry("item", "I-retired", "Nihari", { deleted: true })], {
      enabled: ENABLED,
    });
    expect(v).toBe(1);
    const page = await catalogPage(db, org, 0, 0);
    expect(must(page.entries[0], "the tombstone").deleted).toBe(true);

    await refusedLeavingNothing(
      db,
      org,
      v,
      publish(db, org, [entry("item", "I-retired", "Nihari")], {
        enabled: ENABLED,
        now: BASE_T + 1,
      }),
      ["I-retired"],
    );
  });

  it("a CATEGORY and a MODIFIER GROUP publish with no prices at all", async () => {
    // "Non-sellable kinds (`category`, `modifier_group`) carry none." A completeness check that
    // did not know which kinds are sellable would refuse every menu that has a category in it.
    const org = freshIdentity().org_id;
    const v = await publish(
      db,
      org,
      [
        entry("category", "C-mains", "Mains", { station: "grill" }),
        entry("modifier_group", "MG-spice", "Spice level"),
        entry("item", "I-karahi", "Chicken Karahi", { prices: FULL_GRID, parent_id: "C-mains" }),
      ],
      { enabled: ENABLED },
    );
    expect(v).toBe(1);
    const page = await catalogPage(db, org, 0, 0);
    const byId = new Map(page.entries.map((e) => [e.id, served(e)]));
    // The priced sibling is asserted in the SAME page, so "no prices" is distinguishable from
    // "the field is dropped for everyone" — which is the state of this service today.
    expect(byId.get("I-karahi")?.prices).toEqual([...FULL_GRID]);
    expect(byId.get("C-mains")?.prices ?? []).toEqual([]);
    expect(byId.get("MG-spice")?.prices ?? []).toEqual([]);
  });

  it("02-F42 — a price keyed by a channel outside the closed set is refused AT THE WRITER", async () => {
    // A3's lesson stated as a rule: one definition governs both ends. A channel the wire cannot
    // carry must not reach the table, or the read path becomes the first thing to apply the
    // rules — by throwing inside `dispatch`, where the server closes the socket.
    //
    // The grid is COMPLETE and the surplus cell is the only defect, so the refusal cannot be an
    // omission. `dine_in` must appear in the message: this file deliberately does not assert what
    // a surplus ENABLED-but-unlisted pair does (see the header), so naming the offending VALUE is
    // what distinguishes "refused because `dine_in` is not a channel" from "refused for something
    // else entirely" — and it is what `01-F60`'s "naming ... the channel" requires anyway.
    const org = freshIdentity().org_id;
    await refusedLeavingNothing(
      db,
      org,
      0,
      publish(
        db,
        org,
        [
          entry("item", "I-karahi", "Chicken Karahi", {
            prices: [...FULL_GRID, at(DHA, "dine_in", 1)],
          }),
        ],
        { enabled: ENABLED },
      ),
      ["I-karahi", "dine_in"],
    );
  });

  it("00 §6 — a FRACTIONAL paisa is refused AT THE WRITER", async () => {
    const org = freshIdentity().org_id;
    const fractional = [
      at(DHA, "counter", 145_000.5),
      at(DHA, "foodpanda", 168_000),
      at(SADDAR, "counter", 118_000),
      at(SADDAR, "foodpanda", 139_000),
    ];
    await refusedLeavingNothing(
      db,
      org,
      0,
      publish(db, org, [entry("item", "I-karahi", "Chicken Karahi", { prices: fractional })], {
        enabled: ENABLED,
      }),
      ["I-karahi"],
    );
  });

  it("with NO enabled pairs declared, nothing is omitted and nothing is refused [GREEN at authorship]", () => {
    // GREEN before the implementation, and pinned to make interpretation 2 in the header a
    // TESTED claim rather than a comment: an org that has enabled no (branch, channel) pair has
    // no omission to refuse. It is also the compatibility guarantee for every publish already in
    // this service. It is NOT an endorsement — see the FINDING in interpretation 1.
    const org = freshIdentity().org_id;
    return expect(publish(db, org, [entry("item", "I-karahi", "Chicken Karahi")])).resolves.toBe(1);
  });

  it("the refusal is per-ORG — one tenant's bad save never moves another's version [GREEN at authorship]", async () => {
    // GREEN before the implementation only because the refusal fires for a different reason
    // today (an empty change set). `01-F52` makes the catalog org-scoped, and A3's blast radius
    // was org-wide; pinning the boundary is cheap.
    const a = freshIdentity().org_id;
    const b = freshIdentity().org_id;
    await publish(db, a, [entry("item", "I1", "A", { prices: FULL_GRID })], { enabled: ENABLED });
    await expect(publish(db, b, [], { enabled: ENABLED })).rejects.toThrow();
    expect(await catalogVersion(db, a)).toBe(1);
    expect(await catalogVersion(db, b)).toBe(0);
  });
});

describe("01-F60 — ONE version, identical bytes for every branch", () => {
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

  it("two devices in DIFFERENT branches of one org receive the SAME catalog_response", async () => {
    // THE GUARD AGAINST A LATER "OPTIMISATION". `01-F60`: "It would be a serious error to
    // implement that by serving each branch a filtered catalog... per-branch responses would make
    // one version number mean DIFFERENT BYTES on different devices, destroying the premise
    // `01-F56`'s `divergent` detection rests on." Filtering would look like a saving and would be
    // invisible until two devices at version N disagreed about what N means.
    const org = freshIdentity().org_id;
    await publish(
      db,
      org,
      [entry("item", "I-karahi", "Chicken Karahi", { prices: FULL_GRID, station: "grill" })],
      { enabled: ENABLED },
    );

    const dhaDevice = { ...freshIdentity(), org_id: org, branch_id: DHA };
    const saddarDevice = { ...freshIdentity(), org_id: org, branch_id: SADDAR };
    const s1 = await openSession(gateway, dhaDevice);
    const s2 = await openSession(gateway, saddarDevice);
    await s1.conn.handle({ v: 1, kind: "catalog_request", have_version: 0 });
    await s2.conn.handle({ v: 1, kind: "catalog_request", have_version: 0 });

    const r1 = must(ofKind(s1.rec.all, "catalog_response")[0], "DHA catalog_response");
    const r2 = must(ofKind(s2.rec.all, "catalog_response")[0], "Saddar catalog_response");
    expect(r2, "the two branches were served different catalogs").toEqual(r1);
    // Deep equality can be satisfied by two objects that serialise differently; the FR's word is
    // BYTES, and one version meaning one set of bytes is the whole premise of `01-F56`.
    expect(encodeMessage(r2)).toBe(encodeMessage(r1));

    // And what they are both served is EVERY branch's prices — "the published artifact carries
    // every branch's prices, one version, identical for all". A device reading another branch's
    // price is the accepted cost, stated in the FR.
    expect(served(must(r1.entries[0], "the served entry")).prices).toEqual([...FULL_GRID]);
  });

  it("the served frame is one the WIRE can carry — encode/decode is lossless", async () => {
    // A3's shape: the gateway stored what Postgres accepted and the READ path was the first
    // thing to apply the wire's rules — by throwing inside `dispatch`, which closes the socket.
    // A frame that cannot survive its own codec is that defect with a new field.
    const org = freshIdentity().org_id;
    await publish(
      db,
      org,
      [entry("item", "I-karahi", "Chicken Karahi", { prices: FULL_GRID, station: "grill" })],
      { enabled: ENABLED },
    );
    const id = { ...freshIdentity(), org_id: org, branch_id: DHA };
    const session = await openSession(gateway, id);
    await session.conn.handle({ v: 1, kind: "catalog_request", have_version: 0 });
    const response = must(ofKind(session.rec.all, "catalog_response")[0], "catalog_response");
    const round = decodeMessage(encodeMessage(response));
    expect(round).toEqual(response);
    // Asserting only the round trip would pass TODAY, when the frame carries nothing to lose —
    // "the guard passed by not looking" (§C). What must survive is named.
    const decoded = served(must((round as typeof response).entries[0], "the decoded entry"));
    expect(decoded.prices).toEqual([...FULL_GRID]);
    expect(decoded.station).toBe("grill");
  });
});

describe("03-F50 — the station is stored and served like any other catalog field", () => {
  let db: Db;
  beforeAll(() => {
    db = openDb();
  });
  afterAll(async () => {
    await closeDb(db);
  });

  it("a station survives publish → SNAPSHOT, on a category and on an item", async () => {
    // `03-F50`: "`station` joins `kitchen_name` and the per-channel visibility flags on the
    // catalog entry" — so it must be stored and served exactly as `kitchen_name` is. The common
    // case is the category ("all breads to the tandoor").
    const org = freshIdentity().org_id;
    await publish(
      db,
      org,
      [
        entry("category", "C-breads", "Breads", { station: "tandoor" }),
        entry("item", "I-garlic", "Garlic Bread", {
          parent_id: "C-breads",
          station: "grill",
          prices: FULL_GRID,
        }),
      ],
      { enabled: ENABLED },
    );
    const page = await catalogPage(db, org, 0, 0);
    const byId = new Map(page.entries.map((e) => [e.id, served(e)]));
    expect(byId.get("C-breads")?.station).toBe("tandoor");
    expect(byId.get("I-garlic")?.station).toBe("grill");
  });

  it("a station survives publish → DELTA, so a re-route reaches a device that is only behind", async () => {
    // The delta path is how a running branch learns anything. A field carried on the snapshot and
    // dropped on the delta re-routes only the devices that happen to resync from scratch — which
    // is the divergence `01-F56` calls undetectable at the till.
    const org = freshIdentity().org_id;
    const v1 = await publish(
      db,
      org,
      [entry("item", "I-naan", "Naan", { station: "tandoor", prices: FULL_GRID })],
      { enabled: ENABLED },
    );
    await publish(
      db,
      org,
      [entry("item", "I-naan", "Naan", { station: "grill", prices: FULL_GRID })],
      { enabled: ENABLED, now: BASE_T + 1 },
    );
    const page = await catalogPage(db, org, v1, 0);
    expect(page.form).toBe("delta");
    expect(served(must(page.entries[0], "the re-routed item")).station).toBe("grill");
  });

  it("an item with no station publishes fine — absence is 03-F50's INHERIT instruction", async () => {
    // `03-F50` expresses inheritance ENTIRELY through the field's absence, so the served entry
    // must carry no station rather than an invented one. The category in the SAME page carries
    // one, which is what distinguishes "absent because unset" from "absent because the column
    // does not exist" — the state of this service today, and the reason this test is red.
    const org = freshIdentity().org_id;
    await publish(
      db,
      org,
      [
        entry("category", "C-breads", "Breads", { station: "tandoor" }),
        entry("item", "I-naan", "Naan", { parent_id: "C-breads", prices: FULL_GRID }),
      ],
      { enabled: ENABLED },
    );
    const page = await catalogPage(db, org, 0, 0);
    const byId = new Map(page.entries.map((e) => [e.id, served(e)]));
    expect(byId.get("C-breads")?.station).toBe("tandoor");
    expect(byId.get("I-naan")?.station ?? null).toBeNull();
  });
});
