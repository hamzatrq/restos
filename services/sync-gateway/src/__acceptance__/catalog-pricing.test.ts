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
// ── STATUS, RE-MEASURED AFTER THE ORACLE REPAIR (2026-08-04) ─────────────────────────────────
// This block used to read "RED-AWAITING-IMPLEMENTATION — 14 of the 16 tests below are red",
// which was true when it was written and is **not true now**: `01-F60`'s base shipped and all of
// those tests pass. Restating it would be `oracle-round-2-findings.md` §C's first pattern (the
// comment was the defect), so it is replaced with measurements rather than edited:
//
//   pnpm -C services/sync-gateway test   → Tests  6 failed | 248 passed (254)
//   ...of which this file                → Tests  6 failed |  17 passed  (23)
//
// **All six red are amendment tests, and they are exactly the amendments' refusals** — one for
// ruling B (in the first describe) and five for ruling A. Nothing else in the package is red.
//
// ── AND THE CORRECT IMPLEMENTATION CAN NOW BE LANDED AGAINST THIS PACKAGE ────────────────────
// Measured, not assumed. Ruling B's guard — `if (opts.enabled === undefined) throw` — was
// injected in front of the shipped `publishCatalog` through a vitest alias, with no
// implementation source edited:
//   • against the sibling suites AS THEY STOOD → **25 of 29 tests red**, every one of them
//     "the enabled set is a REQUIRED input", because **all 38** of their `publishCatalog` call
//     sites omitted the argument. The amendment was unlandable against its own package.
//   • against the package AS IT NOW STANDS     → **Tests 5 failed | 249 passed (254)**: the
//     amendment-B test goes GREEN and not one other test moves. The five remaining red are
//     amendment A's, which that guard does not address.
// `catalog-transport.test.ts` and `journey-catalog.test.ts` were migrated to make that true:
// all 38 of their calls now declare a real one-branch/one-channel grid and price their fixtures
// for it, so `01-F60`'s completeness check RUNS on every publish in this package and passes,
// rather than being skipped. See the header of either file for why the empty set was refused as
// the cheap way out.
// Three of the seventeen green are regression guards rather than evidence of a closure, and each
// says so in its own title:
//   - the per-ORG isolation of the refusal — green since the original authorship;
//   - "`modifier` is priced and a `modifier_group` is not" and "a FREE modifier ... PUBLISHES",
//     which pass TODAY only because no completeness check reaches a `modifier` at all. They are
//     tripwires that arm the moment amendment A is implemented — a falsy `if (!price)` turns the
//     second one red — and each is PAIRED with a currently-red refusal that forces the check to
//     exist at all. Neither is alone sufficient, which is the point of the pairing. (§C: "a
//     tripwire that stayed vacuous after its blocker cleared".)
//
// ── THE JULY 2026 AMENDMENTS (`dac8747`), added by a SECOND authoring session ─────────────────
// `01-F60` was amended twice by founder ruling after the tests above were written, and no code
// shipped for either amendment. Both are inline in the FR and both are tested below.
//   A. **`modifier` is SELLABLE** — "a paid add-on carries the same commission exposure as the
//      dish it sits on, so 'extra raita' is priced per (branch, channel) like anything else and
//      falls under the writer's completeness check". The FR states the consequence rather than
//      leaving it to be discovered: **"a free modifier carries an explicit `0` on every enabled
//      pair"**, because that is what "distinguishes 'this costs nothing' from 'somebody forgot
//      foodpanda', and those are indistinguishable under any rule that lets an unpriced modifier
//      through". Non-sellable kinds (`category`, `modifier_group`) still carry none.
//   B. **"The enabled set is a REQUIRED input to the publish"** — "not an optional one defaulting
//      to 'check nothing'... making it optional would mean a caller who simply forgot the
//      argument silently received no completeness check at all, which is precisely the omission
//      this FR refuses a fallback in order to prevent."
// Ruling B REVERSES this file's original pinned interpretation 2 and the one test that pinned
// it; the retirement is recorded in place, at the test that replaced it.
//
// ── PINNED INTERPRETATIONS — where the FRs stop short ────────────────────────────────────────
//
// 1. **WHERE THE ENABLED SET COMES FROM — a caller-supplied argument. RAISED AS A FINDING BY THE
//    FIRST AUTHOR, SINCE RULED ON, AND NO LONGER OPEN.** The FR sources it from "`00 §7` layer 2:
//    channels enabled and the org's branches" — and `03-F50` establishes, for the station ruling,
//    that an org-config plane "requires an org-config model, a store, a distribution path to
//    devices and a `config.changed` payload schema — **none of which exists**". There is
//    therefore nowhere for `publishCatalog` to READ an enabled set from. It is pinned as a
//    caller-supplied argument, `opts.enabled = { branches, channels }`, expanded to the full
//    cross product exactly as `14-F29`'s grid describes it (a row per branch, a column per
//    enabled channel). Ruling B settles this as the DESIGN: "`00 §7`'s config plane does not
//    exist yet, so the caller states the set explicitly, even where that is a constant."
// 2. **RETIRED BY RULING B.** It read: *"`enabled` IS OPTIONAL, AND ABSENT MEANS 'nothing is
//    enabled'"* — the position the founder overruled in the same breath as answering
//    interpretation 1's finding. Absent is now **not a legal call**. What ruling B does NOT
//    settle is which form of "required" binds: the WEAK form (the argument is missing and the
//    publish throws) or the STRONG form (`24 §3`'s standing preference — the call cannot be
//    EXPRESSED without it, cf. `03-F32`'s "the profile schema has no slot id addressing money").
//    This file asserts the weak form, because that is the form a running test can observe;
//    a type that also forbids the call satisfies it. FINDING — see the block below.
// 3. PRICE SHAPE — `prices: { branch_id, channel, price_paisa }[]`, matching the wire suite. The
//    triple was chosen over a nested record because `01-F60`'s refusal must NAME the branch and
//    the channel, which reads off a triple directly.
// 4. THE REFUSAL IS A `RangeError` WITH A MESSAGE, matching the two refusals `publishCatalog`
//    already raises (empty change set, unservable entry). `01-F60` names no error class; what it
//    does specify is what the message must CONTAIN, and that is what is asserted.
// 5. **THE MISSING-ENABLED-SET REFUSAL NAMES `enabled`.** `01-F60` spells out the message content
//    for the omitted-PAIR refusal ("naming the entry, the branch and the channel") and says
//    nothing about the message for ruling B's refusal. Asserting only that it threw would make
//    the amendment-B test pass against an implementation that never implemented ruling B and
//    merely happened to reject that call, so the weakest assertion that keeps the refusal
//    ATTRIBUTABLE is pinned instead: the message contains the FR's own word for the input it is
//    missing. FINDING — the FR should say what this refusal names, as it does for the other one.
//
// ── DELIBERATELY NOT COVERED, so no coverage is claimed that does not exist ───────────────────
// - AN ENTRY PRICED FOR A PAIR THAT IS **NOT** ENABLED. `01-F60` refuses an omission and says
//    nothing about a surplus. Asserting either way would invent an FR. FINDING. (An unknown
//    CHANNEL is a different thing and IS asserted: `02-F42` closes that vocabulary, so
//    `dine_in` is not a surplus pair, it is a value no channel axis contains.)
// - WHETHER AN **EMPTY** ENABLED SET IS A LEGAL VALUE. Ruling B makes the argument REQUIRED; it
//    does not say whether `{ branches: [], channels: [] }` may be passed. STILL A FINDING, and
//    still open — but it is no longer load-bearing for this package. It used to be: the sibling
//    acceptance suites called `publishCatalog` roughly fifty times with NO enabled set at all,
//    so ruling B could not be implemented without reddening them, and the cheap way out was to
//    pass the empty set everywhere — which would have restored exactly the "no completeness
//    check ran" silence ruling B exists to remove. Those call sites were migrated instead
//    (`catalog-transport.test.ts`, `journey-catalog.test.ts`): every one now declares a real
//    one-branch/one-channel grid and prices its sellable fixtures for it, so NOTHING in this
//    package depends on the empty set being legal, in either direction.
// - WHICH FORM OF "REQUIRED" BINDS THE IMPLEMENTER (type vs runtime). Interpretation 2. FINDING.
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
// typechecks against whatever shape `publishCatalog`'s options argument currently has —
// including the amendment-B case, a call that deliberately OMITS `enabled` and which the STRONG
// reading of "required input" (interpretation 2) would make a type error rather than a throw.

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

// ── amendment A fixtures: the sellable `modifier` ─────────────────────────────────────────────

/** `01-F60`'s own example — "extra raita", priced higher where commission takes its cut. */
const RAITA_GRID: readonly Price[] = [
  at(DHA, "counter", 8_000),
  at(DHA, "foodpanda", 11_000),
  at(SADDAR, "counter", 6_000),
  at(SADDAR, "foodpanda", 9_000),
];

/**
 * The free modifier, stated by `01-F60` as a consequence rather than left to be discovered:
 * "a free modifier carries an explicit `0` on every enabled pair". Integer paisa (`00 §6`) —
 * `0` is a PRICE here, and the one-character defect this fixture exists to catch reads it as
 * the absence of one.
 */
const ZERO_GRID: readonly Price[] = [
  at(DHA, "counter", 0),
  at(DHA, "foodpanda", 0),
  at(SADDAR, "counter", 0),
  at(SADDAR, "foodpanda", 0),
];

/**
 * `02-F42`'s closed channel set, written out LITERALLY — never derived from whatever the
 * implementation believes a channel is, or the assertion is the implementation agreeing with
 * itself. The order here is `02-F42`'s own.
 */
const ALL_CHANNELS = ["counter", "phone", "storefront", "whatsapp", "foodpanda"] as const;

/** A single-branch org that has enabled every one of the five. */
const ENABLED_ALL = { branches: [DHA], channels: [...ALL_CHANNELS] } as const;

/** Five cells, one per `02-F42` channel — `whatsapp` discounted, which is `01-F60`'s reason. */
const FIVE_CHANNEL_GRID: readonly Price[] = [
  at(DHA, "counter", 8_000),
  at(DHA, "phone", 8_000),
  at(DHA, "storefront", 9_000),
  at(DHA, "whatsapp", 7_000),
  at(DHA, "foodpanda", 11_000),
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

/** Read the two fields off a served page entry, without depending on the served type declaring them. */
type ServedEntry = { id: string; prices?: readonly Price[]; station?: string | null };
const served = (e: unknown): ServedEntry => e as unknown as ServedEntry;

/**
 * `01-F75`/`01-F77` — the catalog fetch as the wire carries it since the reference-data
 * generalisation: one `reference_request` for every resource, naming the `01-F76` artifact key.
 * The catalog stays ORG-scoped (`01-F52`), so `branch_id` is null, and the org is the SESSION's
 * because `01-F71` (e) has the server refuse a request that states another.
 */
const catalogRequest = (org_id: string) =>
  ({
    v: 2,
    kind: "reference_request",
    resource: "catalog",
    scope: { org_id, branch_id: null },
    have_version: 0,
  }) as const;

/**
 * `prices` is a SET of (branch, channel) cells and no FR orders it. `01-F60` specifies which
 * cells must exist and what each must contain; it says nothing about sequence, and the entry is
 * carried as one jsonb value whose element order is an artefact of how the writer happened to
 * build the array. So `toEqual([...GRID])` here is an unordered-collection assumption: it holds
 * today only because insertion order survives, and it would red on a writer that grouped by
 * branch or sorted by channel — a false failure that says "the grid is wrong" when it is not.
 *
 * Sorting BOTH sides by the cell key keeps the assertion exact rather than loosening it: a
 * missing cell, a surplus cell, a duplicated cell and a wrong `price_paisa` all still fail.
 */
const cellKey = (p: Price): string => JSON.stringify([p.branch_id, p.channel]);
const byCell = (cells: readonly Price[]): Price[] =>
  [...cells].sort((a, b) => (cellKey(a) < cellKey(b) ? -1 : cellKey(a) > cellKey(b) ? 1 : 0));

const expectCells = (
  actual: readonly Price[] | undefined,
  expected: readonly Price[],
  what: string,
): void => {
  // `undefined` is NOT the empty grid: an entry served with no `prices` field at all is the
  // "the column does not exist" failure, and `?? []` would launder it into a passing comparison
  // whenever `expected` is empty.
  expect(actual, `${what}: no price grid was served at all`).toBeDefined();
  expect(byCell(actual ?? []), what).toEqual(byCell(expected));
};

/**
 * The non-sellable direction, stated so that it cannot pass on an ABSENT entry.
 * `expect(byId.get(id)?.prices ?? []).toEqual([])` — the shape this replaces — is `[] === []`
 * whenever the entry is missing from the page, which is the very failure it exists to exclude.
 */
const expectNoCells = (entry: ServedEntry | undefined, what: string): void => {
  const found = must(entry, `${what} — it is ABSENT from the served page`);
  expect(
    found.prices ?? [],
    `${what} was served a price grid; 01-F60: "Non-sellable kinds (\`category\`, ` +
      '`modifier_group`) carry none"',
  ).toEqual([]);
};

/**
 * A REFUSAL that can fail more than one way (`oracle-round-2-findings.md` §C: "a refusal that
 * leaves a partial version behind is the actual A3 hazard, and 'it threw' does not catch it").
 * Asserts the throw, asserts the message names the entry / branch / channel `01-F60` requires it
 * to name, and asserts the version table is untouched by RE-READING it.
 *
 * `neverNames` (amendment A) is the other direction: an id the message must NOT contain, because
 * naming it would mean the check treated a NON-sellable kind as sellable. It is OPTIONAL —
 * omitted at most call sites — so both loops are guarded against running zero times, which is
 * `oracle-round-2-findings.md` §C pattern 2 in its cheapest form (an assertion inside a `for`
 * over an empty array is not a weaker assertion, it is no assertion at all).
 */
const refusedLeavingNothing = async (
  db: Db,
  org: string,
  versionBefore: number,
  // A THUNK, not a promise. `01-F60` says the publish is refused; it does not say whether the
  // refusal arrives as a rejected promise or as a synchronous throw from an argument check that
  // runs before the async body — and both are legitimate ways to refuse at the writer. Taking a
  // promise made this helper silently assume the async shape: a synchronous refusal escaped as
  // an unhandled error at the CALL SITE, before this function ran, so a correct implementation
  // would have been reported as a crash rather than measured against `01-F60`'s message. MEASURED,
  // not hypothesised — injecting ruling B's guard as a plain (non-`async`) wrapper did exactly
  // that to the amendment-B test.
  publishing: () => Promise<number>,
  names: readonly string[],
  neverNames?: readonly string[],
): Promise<void> => {
  let message: string | undefined;
  let accepted: number | undefined;
  try {
    accepted = await publishing();
  } catch (e: unknown) {
    message = e instanceof Error ? e.message : String(e);
  }
  expect(
    accepted,
    `publishCatalog ACCEPTED an incomplete grid and committed version ${String(accepted)}`,
  ).toBeUndefined();
  expect(
    names.length,
    "refusedLeavingNothing was given NO names — the refusal's content would go unasserted and " +
      "this call would degrade to 'it threw'",
  ).toBeGreaterThan(0);
  for (const name of names) {
    expect(
      message,
      `the refusal does not name ${name} (01-F60: "naming the entry, the ` +
        `branch and the channel")`,
    ).toContain(name);
  }
  if (neverNames !== undefined) {
    expect(
      neverNames.length,
      "refusedLeavingNothing was given an EMPTY neverNames — the negative assertion it was " +
        "passed for would run zero times and the call would silently claim a check it never made",
    ).toBeGreaterThan(0);
    for (const name of neverNames) {
      expect(
        message,
        `the refusal names ${name}, which 01-F60 makes NON-sellable ("Non-sellable kinds ` +
          '(`category`, `modifier_group`) carry none") — a check that treats every kind as ' +
          "sellable refuses a legal menu and makes deleting a category impossible",
      ).not.toContain(name);
    }
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
    expectCells(
      served(must(page.entries[0], "the published entry")).prices,
      FULL_GRID,
      "the served grid of the accepted entry",
    );
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
      () =>
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
      () => publish(db, org, [entry("item", "I-daal", "Daal")], { enabled: ENABLED }),
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
      () =>
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
      () =>
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
      () =>
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
    expectCells(byId.get("I-karahi")?.prices, FULL_GRID, "the priced sibling's grid");
    expectNoCells(byId.get("C-mains"), "the category");
    expectNoCells(byId.get("MG-spice"), "the modifier group");
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
      () =>
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
      () =>
        publish(db, org, [entry("item", "I-karahi", "Chicken Karahi", { prices: fractional })], {
          enabled: ENABLED,
        }),
      ["I-karahi"],
    );
  });

  it("a publish that declares NO enabled set is REFUSED — absent is not 'check nothing' (amendment B)", async () => {
    // ── RETIREMENT, and the reason this test exists ─────────────────────────────────────────
    // This slot held "with NO enabled pairs declared, nothing is omitted and nothing is refused
    // [GREEN at authorship]", which pinned the original header's interpretation 2 — "`enabled`
    // IS OPTIONAL, AND ABSENT MEANS 'nothing is enabled'". The first author flagged that shape
    // as a hole in the same header ("a caller that forgets the argument gets no check at all"),
    // the founder ruled on exactly that finding (`dac8747`, July 2026), and `01-F60` now reads:
    // "**The enabled set is a REQUIRED input to the publish** — not an optional one defaulting
    // to 'check nothing'... making it optional would mean a caller who simply forgot the
    // argument silently received no completeness check at all, which is precisely the omission
    // this FR refuses a fallback in order to prevent."
    // The retired test was GREEN, so it did not merely go stale — it would have FAILED the
    // correct implementation and argued that the ruling was the defect.
    //
    // ── WHY THE FIXTURE IS A `category` AND NOT A PRICED ITEM ───────────────────────────────
    // This test first replaced the retired one with a fully-priced `item` and `rejects.toThrow()`,
    // and an oracle reviewer refused it: `.rejects` alone cannot tell "refused because the
    // enabled set was absent" from "refused for some unrelated reason", so it would pass against
    // an implementation that got ruling B wrong and happened to throw on this call for anything
    // else. Worse, a fully-priced entry published against NO declared enabled set has a second,
    // genuinely available ground for refusal: every one of its four cells is priced for a pair
    // that was never declared, and the header above deliberately does NOT pin what a surplus
    // pair does. So both halves are fixed here:
    //   • the fixture is a single `category` — non-sellable, so `01-F60` requires it to carry no
    //     prices and it carries none; its name is servable; the change set is non-empty
    //     (`01-F52`). There is no completeness ground, no surplus ground, no wire ground. The
    //     ONLY thing wrong with this call is the argument that is missing from it.
    //   • the refusal must NAME what is missing. `01-F60` spells out the message content for the
    //     omitted-PAIR refusal ("naming the entry, the branch and the channel") and not for this
    //     one, so what is asserted is the weakest thing that keeps the refusal attributable: the
    //     message says `enabled` — the FR's own word for the input ("The enabled set is a
    //     REQUIRED input to the publish"). PINNED INTERPRETATION, recorded as a finding below.
    //
    // Note what this fixture also settles, and settles the strict way: a `category`-only publish
    // has nothing for a completeness check to look at, so an implementation that skipped the
    // requirement whenever there was nothing to check would pass a priced-item fixture and fail
    // this one. Ruling B says the enabled set is a required input to THE PUBLISH — the call is
    // malformed, not the menu — and that is the reading asserted here.
    //
    // A SYNCHRONOUS throw and a rejected promise are both caught: an argument check that runs
    // before the async body refuses synchronously, and reading only the rejection would report
    // that correct implementation as an unhandled crash. MEASURED — injecting ruling B's guard as
    // a plain (non-`async`) wrapper did exactly that to the first version of this test.
    const org = freshIdentity().org_id;
    let message: string | undefined;
    let accepted: number | undefined;
    try {
      accepted = await publish(db, org, [entry("category", "C-mains", "Mains")]);
    } catch (e: unknown) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(
      accepted,
      `publishCatalog ACCEPTED a publish that declared NO enabled set and committed version ` +
        `${String(accepted)} — ruling B: "not an optional one defaulting to 'check nothing'"`,
    ).toBeUndefined();
    expect(
      message,
      "the refusal does not name the missing input, so it is indistinguishable from a refusal " +
        "for any other reason — and a test that cannot tell them apart passes against an " +
        "implementation that never implemented ruling B",
    ).toMatch(/enabled/i);
    expect(
      await catalogVersion(db, org),
      "a publish that named no enabled set still committed a version",
    ).toBe(0);

    // DELTA ISOLATION: the IDENTICAL entries with the set present publish. The argument is the
    // only difference between the two calls, so without this half an implementation that refused
    // every publish outright would satisfy every assertion above.
    const other = freshIdentity().org_id;
    await expect(
      publish(db, other, [entry("category", "C-mains", "Mains")], { enabled: ENABLED }),
    ).resolves.toBe(1);
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

describe("01-F60 — `modifier` is SELLABLE (amendment A, founder ruling July 2026)", () => {
  let db: Db;
  beforeAll(() => {
    db = openDb();
  });
  afterAll(async () => {
    await closeDb(db);
  });

  it("a `modifier` is priced and a `modifier_group` is not — one underscore, opposite sides [GREEN at amendment authorship]", async () => {
    // The accept anchor for every refusal below, and the whole of trap 2 in one publish.
    // `01-F60`: "'extra raita' is priced per (branch, channel) like anything else and falls
    // under the writer's completeness check" / "Non-sellable kinds (`category`,
    // `modifier_group`) carry none."
    //
    // GREEN TODAY, AND WHY THAT IS NOT A CLOSURE: the price columns exist and round-trip for a
    // `modifier` already; what does not exist is the completeness check reaching that kind, and
    // an accept-path test cannot see the difference between "checked and complete" and "never
    // checked". The next test is its red half — an implementation that made every kind sellable
    // would pass THIS one and fail that one. What this test does own permanently is the
    // `modifier_group` direction: it must keep publishing unpriced after amendment A lands.
    //
    // Both kinds are in the SAME page, so "the group carries no prices" is distinguishable from
    // "the field is dropped for everyone".
    const org = freshIdentity().org_id;
    const v = await publish(
      db,
      org,
      [
        entry("modifier_group", "MG-spice", "Spice level"),
        entry("modifier", "M-raita", "Extra raita", {
          parent_id: "MG-spice",
          prices: RAITA_GRID,
        }),
      ],
      { enabled: ENABLED },
    );
    expect(v).toBe(1);
    const page = await catalogPage(db, org, 0, 0);
    const byId = new Map(page.entries.map((e) => [e.id, served(e)]));
    expectCells(byId.get("M-raita")?.prices, RAITA_GRID, "the modifier's served grid");
    expectNoCells(byId.get("MG-spice"), "the modifier group");
  });

  it("the refusal names the unpriced MODIFIER and NOT the unpriced MODIFIER GROUP", async () => {
    // The mirror direction of trap 2, and the one a test that only checked the newly-sellable
    // kind would miss: an implementation that made EVERY kind sellable passes "the modifier is
    // refused" and then refuses every menu that has a spice group in it.
    //
    // The group is listed FIRST so that an implementation refusing at its first failing entry
    // reports the group before it ever reaches the modifier. The modifier deliberately carries
    // NO `parent_id` here: a message naming the group as a PARENT would be legitimate and would
    // make the negative assertion below fire for the wrong reason.
    const org = freshIdentity().org_id;
    await refusedLeavingNothing(
      db,
      org,
      0,
      () =>
        publish(
          db,
          org,
          [
            entry("modifier_group", "MG-spice", "Spice level"),
            entry("modifier", "M-raita", "Extra raita"),
          ],
          { enabled: ENABLED },
        ),
      ["M-raita"],
      ["MG-spice"],
    );
  });

  it("a PAID modifier that omits ONE enabled pair is REFUSED, naming the entry, the branch and the channel", async () => {
    // `01-F60`'s named hazard, applied to the add-on: "a fallback makes a forgotten aggregator
    // price sell at the in-restaurant rate while commission still takes its cut". The mirror of
    // the free-modifier defect below is the expensive one — a missing cell that DEFAULTS to `0`
    // gives the paid add-on away, and `01-F53` freezes that into every line added before anyone
    // notices. The forgotten cell is Saddar's foodpanda price.
    const org = freshIdentity().org_id;
    const incomplete = RAITA_GRID.filter(
      (p) => !(p.branch_id === SADDAR && p.channel === "foodpanda"),
    );
    await refusedLeavingNothing(
      db,
      org,
      0,
      () =>
        publish(db, org, [entry("modifier", "M-raita", "Extra raita", { prices: incomplete })], {
          enabled: ENABLED,
        }),
      ["M-raita", SADDAR, "foodpanda"],
    );
  });

  it("a FREE modifier carrying an explicit `0` on every enabled pair PUBLISHES, and `0` is served back [GREEN at amendment authorship]", async () => {
    // THE test amendment A exists for. `01-F60` states it outright: "a free modifier carries an
    // explicit `0` on every enabled pair, which is the point — it distinguishes 'this costs
    // nothing' from 'somebody forgot foodpanda'". A falsy check (`if (!price)`) at the writer
    // refuses this entirely legal save; the same check in the read path serves the cell back as
    // absent, which turns "free" into "unpriced" and makes the modifier unaddable (`01-F60`:
    // "If the order's channel has no price, the item cannot be added").
    //
    // GREEN TODAY BECAUSE NO CHECK RUNS ON A `modifier` AT ALL — this is a TRIPWIRE, not a
    // closure, and it arms the moment amendment A is implemented: the one-character defect it
    // exists to catch cannot be written until the check it lives inside is written. The test
    // below is its red half, and the two differ only in the `prices` array.
    const org = freshIdentity().org_id;
    const v = await publish(
      db,
      org,
      [entry("modifier", "M-noonions", "No onions", { prices: ZERO_GRID })],
      { enabled: ENABLED },
    );
    expect(v).toBe(1);
    const page = await catalogPage(db, org, 0, 0);
    const cells = served(must(page.entries[0], "the free modifier")).prices;
    expectCells(cells, ZERO_GRID, "the free modifier's served grid");
    // Named again by VALUE rather than by shape, so a writer that dropped the falsy cell fails
    // on "the DHA/counter cell is missing" instead of on an array-length mismatch. Integer
    // paisa throughout (`00 §6`) — `0` is a number here, never a placeholder.
    const dhaCounter = must(
      (cells ?? []).find((p) => p.branch_id === DHA && p.channel === "counter"),
      "the DHA/counter cell of the free modifier",
    );
    expect(dhaCounter.price_paisa).toBe(0);
  });

  it("the SAME modifier with NO prices at all is REFUSED — `0` is a price, absence is not", async () => {
    // DELTA ISOLATION against the test above: same kind, same id, same name, and the `prices`
    // array is the only difference. `01-F60` says the two are "indistinguishable under any rule
    // that lets an unpriced modifier through" — so the rule that lets one through is exactly
    // what this pair forbids, in both directions, and neither test alone forbids it.
    //
    // Only the ENTRY is named: all four cells are missing and no FR says which one a refusal
    // reports first. Branch/channel naming is pinned by the single-omission test above.
    const org = freshIdentity().org_id;
    await refusedLeavingNothing(
      db,
      org,
      0,
      () => publish(db, org, [entry("modifier", "M-noonions", "No onions")], { enabled: ENABLED }),
      ["M-noonions"],
    );
  });

  it("01-F55 — a TOMBSTONED modifier needs no prices, and a live one does", async () => {
    // `01-F60` refuses "a sellable, NON-TOMBSTONED entry", and amendment A moved `modifier`
    // into "sellable" — which drags the tombstone exemption along with it. Without that, an
    // owner who enabled foodpanda can never delete an add-on again, because the delete travels
    // as a marked entry (`01-F55`) whose only job is keeping the name resolvable for a reprint.
    //
    // DELTA ISOLATION: the same unpriced entry ± `deleted: true`.
    const org = freshIdentity().org_id;
    const v = await publish(
      db,
      org,
      [entry("modifier", "M-retired", "Extra cheese", { deleted: true })],
      { enabled: ENABLED },
    );
    expect(v).toBe(1);
    const page = await catalogPage(db, org, 0, 0);
    expect(must(page.entries[0], "the tombstoned modifier").deleted).toBe(true);

    await refusedLeavingNothing(
      db,
      org,
      v,
      () =>
        publish(db, org, [entry("modifier", "M-retired", "Extra cheese")], {
          enabled: ENABLED,
          now: BASE_T + 1,
        }),
      ["M-retired"],
    );
  });

  it("02-F42 — an org with all FIVE channels enabled prices a modifier on all five, and the omitted one is named", async () => {
    // The channel axis is `02-F42`'s closed set, not the two channels the fixtures above happen
    // to use: a completeness check written against a narrower list would pass every test in this
    // file and still let `storefront` and `whatsapp` through unpriced. `ALL_CHANNELS` is written
    // out literally at the top of this file for that reason.
    const org = freshIdentity().org_id;
    const v = await publish(
      db,
      org,
      [entry("modifier", "M-raita", "Extra raita", { prices: FIVE_CHANNEL_GRID })],
      { enabled: ENABLED_ALL },
    );
    expect(v).toBe(1);
    const page = await catalogPage(db, org, 0, 0);
    expectCells(
      served(must(page.entries[0], "the five-channel modifier")).prices,
      FIVE_CHANNEL_GRID,
      "the five-channel modifier's served grid",
    );

    // A SECOND, distinct add-on, so the refusal cannot be confused with `01-F52`'s empty-change-
    // set refusal. It drops `whatsapp` — the channel `01-F60` names as the one an owner
    // discounts to steer demand onto a channel it owns.
    await refusedLeavingNothing(
      db,
      org,
      v,
      () =>
        publish(
          db,
          org,
          [
            entry("modifier", "M-papad", "Papad", {
              prices: FIVE_CHANNEL_GRID.filter((p) => p.channel !== "whatsapp"),
            }),
          ],
          { enabled: ENABLED_ALL, now: BASE_T + 1 },
        ),
      ["M-papad", DHA, "whatsapp"],
    );
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
    await s1.conn.handle(catalogRequest(org));
    await s2.conn.handle(catalogRequest(org));

    const r1 = must(ofKind(s1.rec.all, "reference_response")[0], "DHA reference_response");
    const r2 = must(ofKind(s2.rec.all, "reference_response")[0], "Saddar reference_response");
    expect(r2, "the two branches were served different catalogs").toEqual(r1);
    // Deep equality can be satisfied by two objects that serialise differently; the FR's word is
    // BYTES, and one version meaning one set of bytes is the whole premise of `01-F56`.
    expect(encodeMessage(r2)).toBe(encodeMessage(r1));

    // And what they are both served is EVERY branch's prices — "the published artifact carries
    // every branch's prices, one version, identical for all". A device reading another branch's
    // price is the accepted cost, stated in the FR.
    expectCells(
      served(must(r1.entries[0], "the served entry")).prices,
      FULL_GRID,
      "the grid served to the DHA device",
    );
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
    await session.conn.handle(catalogRequest(org));
    const response = must(ofKind(session.rec.all, "reference_response")[0], "reference_response");
    const round = decodeMessage(encodeMessage(response));
    expect(round).toEqual(response);
    // Asserting only the round trip would pass TODAY, when the frame carries nothing to lose —
    // "the guard passed by not looking" (§C). What must survive is named.
    const decoded = served(must((round as typeof response).entries[0], "the decoded entry"));
    expectCells(decoded.prices, FULL_GRID, "the grid that survived the codec");
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
