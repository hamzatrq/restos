// Acceptance tests — availability fix round (oracle session; 24 §3 step 2).
//
// Authored from specs/01-kernel-sync.md (01-F6, 01-F10, 01-F22, 01-F34, 01-F37, 01-F39,
// 01-F57..F59), specs/26-merge-semantics.md (§3 the projection-key sidecar, §4 the
// waiting_for index, §7 the named subset-blindness residual, §8 the relabel oracle
// lesson, §9 the ratified product constants) and the coordinator's stated fix-round
// decisions ONLY — never from the implementation.
//
// EXPECTED RED until the fix lands (the merge-builders "red-awaiting-implementation"
// precedent), with ONE labelled exception: the §KEY-DERIVATION block is GREEN at HEAD
// by design. Those are regression guards on behaviour the sidecar must not move, not
// contract for behaviour it must add — the founder asked for them specifically.
//
// ── THE STRUCTURAL RULING ───────────────────────────────────────────────────
// Availability becomes an ORDINARY ENGINE FOLD under the `26 §3` projection-key
// sidecar (`order:O1`, `item:I4`). So these tests drive the two public surfaces that
// survive the move: the device store's ingest path, and `createMergeEngine` — the
// pure engine that `services/sync-gateway/src/auditor.ts` refolds with. Nothing here
// touches `folds/availability.ts`; if that module is deleted by the fix, this file
// does not move.
//
// ── ORACLE-PINNED PROJECTION SURFACE (binding for the implementing session) ──
// The merge-builders header sets the precedent: the oracle pins row shapes from the
// contract, and a deviation is a contract-clarification event, not a test defect.
//   store.availability() / FoldState.availability row:
//     item_id        — the toggled catalog item (01-F22). Untoggled items never
//                      appear: the catalog says what exists, availability is an
//                      operational override on top of it, and catalog is never a
//                      fold input (01-F52).
//     available (0|1)— SQLite STRICT has no boolean.
//     contested (0|1)— the maximal set disagreed (01-F58).
//     head_ids_json  — canonical JSON array of the MAXIMAL-SET event ids, UTF-16
//                      sorted. Precedent: `table_ids_json` (merge.ts:686/843). This
//                      is the P0-3 fix: a caller must be able to construct a correct
//                      superseding toggle WITHOUT re-deriving the supersedes-DAG.
//                      The sort is a PRESENTATION sequence, pinned as such by the
//                      relabel test below — it must never reach a value (01-F34).
//     anomalies_json — canonical JSON sorted distinct array of anomaly codes.
//                      Precedent: `exceptions_json` (merge.ts:851). Two codes:
//                        availability_contested   — 01-F58, named in the FR itself.
//                        availability_incomplete  — the empty-maximal / data-
//                          completeness case. NAME CHOSEN BY THIS ORACLE; the
//                          coordinator specified the behaviour and called it
//                          "availability_contested's sibling" without naming it.
//                          Renaming it is a clarification, not a test defect.

import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AVAILABILITY_FALSE_WINS, parseEvent } from "@restos/domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createMergeEngine } from "../fold-engine.js";
import { DivergentDuplicateError } from "../index.js";
import { canonicalJson, identity, peerEnvelope, peerIdentity } from "./builders.js";
import {
  confirmed,
  created,
  foldStats,
  ingestAll,
  lineAdded,
  type MergeStore,
  mergeStore,
  relabelEnvelope,
  reversingIdMap,
  settlementClosed,
  tableAssigned,
} from "./merge-builders.js";

// ---------------------------------------------------------------------------
// Pinned surface + the two seams
// ---------------------------------------------------------------------------

type AvailabilityProjectionRow = {
  item_id: string;
  available: number;
  contested: number;
  head_ids_json: string;
  anomalies_json: string;
};

/** The store surface this suite drives, typed standalone so the oracle compiles
 * against the contract; a missing member fails the red run at runtime with a named
 * error (the `foldStats` precedent in merge-builders.ts). */
type AvailabilityStore = MergeStore & {
  availability?(): AvailabilityProjectionRow[];
  ingestPage?(items: readonly { envelope: unknown }[]): readonly unknown[];
  refold?(): void;
};

const availabilityRows = (store: AvailabilityStore): AvailabilityProjectionRow[] => {
  if (typeof store.availability !== "function")
    throw new Error(
      "store.availability() is not implemented yet — P1-6: availability is folded by " +
        "NOTHING today (merge.ts:561 declines the type, no other consumer exists). " +
        "01-F6 names availability as a materialized state table " +
        "(red-awaiting-implementation)",
    );
  return store.availability();
};

const onlyItem = (store: AvailabilityStore): AvailabilityProjectionRow => {
  const rows = availabilityRows(store);
  expect(rows).toHaveLength(1);
  const row = rows[0];
  if (!row) throw new Error("expected exactly one availability row");
  return row;
};

const headIds = (row: AvailabilityProjectionRow): string[] =>
  JSON.parse(row.head_ids_json) as string[];
const anomalies = (row: AvailabilityProjectionRow): string[] =>
  JSON.parse(row.anomalies_json) as string[];

/**
 * Merge-semantics seam: project a delivered envelope SET through the PURE engine —
 * the same entry `auditor.ts:234` refolds the cloud log with, and the layer at which
 * the merge rule must hold regardless of what the store does above it.
 *
 * `FoldState` gains an `availability` array under the sidecar, exactly as it already
 * carries `orders` / `queue` / `parked` (merge.ts:78-82).
 */
const projectSet = (envelopes: readonly unknown[]): readonly AvailabilityProjectionRow[] => {
  const engine = createMergeEngine();
  engine.rebuild(envelopes.map((e) => parseEvent(e)));
  const state = engine.snapshot() as unknown as {
    availability?: AvailabilityProjectionRow[];
  };
  if (!state.availability)
    throw new Error(
      "FoldState.availability is not implemented yet — the 26 §3 sidecar must project " +
        "item: keys through the engine like every other fold (red-awaiting-implementation)",
    );
  return state.availability;
};

const projectOne = (envelopes: readonly unknown[]): AvailabilityProjectionRow => {
  const rows = projectSet(envelopes);
  expect(rows).toHaveLength(1);
  const row = rows[0];
  if (!row) throw new Error("expected exactly one projected item");
  return row;
};

/** `availability.changed` payload fragment (registry.ts:39-44), shaped like the
 * merge-builders fragments so it spreads into `peerEnvelope`. */
const availabilityChanged = (
  item_id: string,
  available: boolean,
  supersedes: readonly string[] = [],
) => ({
  type: "availability.changed",
  payload: { item_id, available, supersedes: [...supersedes] },
});

/** An availability envelope with a CHOSEN id, so supersedes cycles are expressible
 * (envelope ids are `z.string().min(1)`, envelope.ts:34 — not uuid-constrained). */
const av = (
  peer: ReturnType<typeof peerIdentity>,
  id: string,
  available: boolean,
  supersedes: string[] = [],
  item = "karahi",
  lamport = 0,
): Record<string, unknown> => ({
  ...peerEnvelope(peer, lamport, availabilityChanged(item, available, supersedes)),
  id,
});

const CONTESTED = "availability_contested";
const INCOMPLETE = "availability_incomplete";

/**
 * The conservative direction, READ FROM THE RATIFIED CONSTANT rather than restated
 * (26 §9: "each remains one named constant with one place to overrule it"). P1-5: the
 * shipped fold hardcodes `false` at availability.ts:79 and the constant's own doc
 * comment still says "Unconsumed until the availability fold lands". Deriving the
 * expectation here means flipping the constant moves the test with the code.
 */
const CONSERVATIVE_AVAILABLE = AVAILABILITY_FALSE_WINS ? 0 : 1;

/** Named seed (20 §2.3 — every draw reproduces from a printed seed). */
const SEED = 20_260_727;

const SRC = join(new URL(".", import.meta.url).pathname, "..");

// ---------------------------------------------------------------------------
// P0-1 — divergent duplicate event ids: delivery order must not decide the value
// ---------------------------------------------------------------------------

describe("P0-1 / 01-F34 — a divergent duplicate id renders as a conflict, not a race", () => {
  // Decision: key by event id PLUS canonical payload bytes, matching how merge.ts keys
  // `createMembers` / `lineValues` / `pay` / `refund`. At HEAD availability.ts:92 does
  // `m.set(t.event_id, t)` — last-write-wins by ARRIVAL — so delivery order decides a
  // projected value, a live standing-law-1 break.
  //
  // WHY THIS SURVIVES THE MOVE TO THE ENGINE, AND WHY IT MATTERS MORE THERE: the device
  // store rejects a divergent same-id envelope (device-store.ts:759), but the engine is
  // ALSO the Auditor's independent refold over the MERGED CLOUD LOG (auditor.ts:234),
  // and 01-F37 keys quarantine per `(org, claimed_event_id, device_id)` — "so a foreign
  // pre-claim can never displace an honest origin's envelope; each claimant's bytes are
  // preserved as its own evidence row". Two claimants' envelopes for one id therefore
  // genuinely coexist in what the Auditor folds. Value-keying is the engine's job, not
  // the store's.
  const peer = peerIdentity(identity());
  const dupFalse = av(peer, "dup", false);
  const dupTrue = av(peer, "dup", true);

  it("01-F34/01-F58: two same-id envelopes with divergent payloads BOTH survive into the maximal set and project contested", () => {
    const row = projectOne([dupFalse, dupTrue]);
    expect({ available: row.available, contested: row.contested }).toEqual({
      available: CONSERVATIVE_AVAILABLE,
      contested: 1,
    });
    // One id, two members — the head set is keyed by id, so the id appears ONCE.
    expect(headIds(row)).toEqual(["dup"]);
    expect(anomalies(row)).toEqual([CONTESTED]);
  });

  it("01-F34: the projection is byte-identical in both delivery orders (the shipped fold returns available=1 for one order and 0 for the other)", () => {
    expect(canonicalJson(projectSet([dupFalse, dupTrue]))).toEqual(
      canonicalJson(projectSet([dupTrue, dupFalse])),
    );
  });

  it("01-F34: redelivering the IDENTICAL envelope is still a no-op — value-keying must not turn a transport duplicate into a conflict", () => {
    const once = canonicalJson(projectSet([dupFalse]));
    expect(canonicalJson(projectSet([dupFalse, { ...dupFalse }]))).toEqual(once);
    expect(JSON.parse(once)).toEqual([
      {
        item_id: "karahi",
        available: 0,
        contested: 0,
        head_ids_json: '["dup"]',
        anomalies_json: "[]",
      },
    ]);
  });

  it("01-F9: the engine-level fix does NOT weaken the store's divergent-duplicate guard, and the store still projects the first-landed event", () => {
    const id = identity();
    const store = mergeStore(id) as AvailabilityStore;
    const first = av(peerIdentity(id), "same-id", false);
    const forged = av(peerIdentity(id), "same-id", true);
    store.ingest(first);
    expect(() => store.ingest(forged)).toThrow(DivergentDuplicateError);
    const row = onlyItem(store);
    expect({ available: row.available, contested: row.contested }).toEqual({
      available: 0,
      contested: 0,
    });
    store.close();
  });

  it("20 §2.3 REGRESSION SEED 619389665 — the counterexample the shipped suite hits ~2.5% of CI runs", () => {
    // Committed as a regression case per 20:35 ("a property failure is never 'flaky' —
    // it is a bug with a reproducer"). Shrinks to two same-id divergent toggles.
    fc.assert(orderInvariance(peer), { seed: 619_389_665, numRuns: 100 });
  });

  it("20 §2.3 REGRESSION SEED 377912348 — the second observed CI failure, same shape", () => {
    fc.assert(orderInvariance(peer), { seed: 377_912_348, numRuns: 100 });
  });
});

/** The shipped suite's property, re-expressed over the pinned projection so the two
 * committed seeds replay against the same arbitrary (availability.test.ts:94-125). */
const orderInvariance = (peer: ReturnType<typeof peerIdentity>) =>
  fc.property(
    fc.array(
      fc.record({
        event_id: fc.string({ minLength: 1, maxLength: 4 }),
        available: fc.boolean(),
        supersedes: fc.array(fc.string({ minLength: 1, maxLength: 4 }), { maxLength: 3 }),
      }),
      { maxLength: 8 },
    ),
    fc.array(fc.nat(), { maxLength: 8 }),
    (
      rows: readonly { event_id: string; available: boolean; supersedes: string[] }[],
      perm: readonly number[],
    ) => {
      const envelopes = rows.map((r) => av(peer, r.event_id, r.available, r.supersedes));
      const shuffled = [...envelopes];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = (perm[i] ?? 0) % (i + 1);
        const tmp = shuffled[i] as Record<string, unknown>;
        shuffled[i] = shuffled[j] as Record<string, unknown>;
        shuffled[j] = tmp;
      }
      return canonicalJson(projectSet(envelopes)) === canonicalJson(projectSet(shuffled));
    },
  );

// ---------------------------------------------------------------------------
// P1-4 / P1-5 — an empty maximal set is a data-completeness ANOMALY, not a default
// ---------------------------------------------------------------------------

describe("P1-4 / 01-F58 — an unresolvable head set resolves conservatively and says so", () => {
  // A finite supersedes graph has an empty maximal set IFF every delivered node has an
  // in-edge from another delivered node — which in a finite digraph forces a CYCLE. So
  // "empty maximal" and "cycle among delivered toggles" are the same phenomenon, and
  // every case below is one. At HEAD availability.ts:64-68 returns the DEFAULT
  // (available, no anomaly), so an item that two delivered events BOTH mark 86'd
  // projects as sellable. The k=1 case is already defended at availability.ts:61; the
  // guard simply does not generalise.
  const peer = peerIdentity(identity());

  it("01-F58: a 2-cycle over two UNAVAILABLE toggles does not resurrect the item", () => {
    const row = projectOne([av(peer, "a", false, ["b"]), av(peer, "b", false, ["a"])]);
    expect({ available: row.available, contested: row.contested }).toEqual({
      available: CONSERVATIVE_AVAILABLE,
      contested: 1,
    });
    expect(anomalies(row)).toEqual([INCOMPLETE]);
    // No head is nameable — the operator surface must not offer a supersedes target it
    // cannot justify.
    expect(headIds(row)).toEqual([]);
  });

  it("01-F58/26 §9: the direction comes from AVAILABILITY_FALSE_WINS even when every delivered toggle says AVAILABLE", () => {
    const row = projectOne([av(peer, "a", true, ["b"]), av(peer, "b", true, ["a"])]);
    expect(row.available).toBe(CONSERVATIVE_AVAILABLE);
    expect(anomalies(row)).toEqual([INCOMPLETE]);
  });

  it("01-F58: a 3-cycle is the same case — the guard must not be arity-specific", () => {
    const row = projectOne([
      av(peer, "a", false, ["b"]),
      av(peer, "b", false, ["c"]),
      av(peer, "c", false, ["a"]),
    ]);
    expect(row.available).toBe(CONSERVATIVE_AVAILABLE);
    expect(anomalies(row)).toEqual([INCOMPLETE]);
  });

  it("01-F58: a cycle with non-cycle nodes hanging off it is still unresolvable", () => {
    // x and y are superseded by cycle members, so nothing is maximal.
    const row = projectOne([
      av(peer, "a", false, ["b", "x"]),
      av(peer, "b", true, ["a", "y"]),
      av(peer, "x", true),
      av(peer, "y", false),
    ]);
    expect(row.available).toBe(CONSERVATIVE_AVAILABLE);
    expect(anomalies(row)).toEqual([INCOMPLETE]);
  });

  it("01-F57: the k=1 self-reference case keeps its EXISTING answer — the event stands, it is not an incompleteness", () => {
    const row = projectOne([av(peer, "a", false, ["a"])]);
    expect({ available: row.available, contested: row.contested }).toEqual({
      available: 0,
      contested: 0,
    });
    expect(headIds(row)).toEqual(["a"]);
    expect(anomalies(row)).toEqual([]);
  });

  it("26 §9 / P1-5: the ratified constant is CONSUMED by the engine, and its 'Unconsumed' doc comment is retired", () => {
    // Behavioural tests cannot distinguish `false` hardcoded from the constant read,
    // because the constant is currently `true`. This is the discipline guard that can
    // (the packages/ui components/discipline.test.ts precedent: some properties are of
    // how code is WRITTEN, and a behaviour test would not see them).
    const sources = [join(SRC, "folds"), SRC].flatMap((dir) =>
      readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith(".ts"))
        .map((e) => readFileSync(join(dir, e.name), "utf8")),
    );
    expect(sources.some((s) => s.includes("AVAILABILITY_FALSE_WINS"))).toBe(true);

    // The stale claim is "Unconsumed until the availability fold lands". It is WRAPPED
    // across two comment lines in the source, so a single-line regex silently never
    // matches — this assertion passed against the stale comment until that was caught.
    // Unwrap `\n * ` first, then match.
    const constants = readFileSync(
      join(SRC, "..", "..", "domain", "src", "product-constants.ts"),
      "utf8",
    ).replace(/\s*\n\s*\*\s*/g, " ");
    expect(constants).not.toMatch(/Unconsumed until the availability fold lands/);
  });

  it("20 §2.2 / 24-F3: every coverage-ignore directive in the fold engine is PAIRED — an unterminated one silently exempts the rest of the file", () => {
    // v8's ignore-start runs to END OF FILE when its stop is missing. That is invisible in
    // review, and it turns the 100% branch gate into a gate over whatever happens to sit
    // above the directive — green forever, on a protected path. The observable is the
    // DENOMINATOR, which no threshold can see: when this was first written, one unpaired
    // start at merge.ts:543 dropped the measured set from 426 statements / 202 branches to
    // 113 / 65, taking the whole of `createMergeEngine` (declared nine lines below it) out
    // of the gate while it reported 100%.
    //
    // Structural, not behavioural — a coverage run cannot detect this about itself. Scans
    // only `src/*.ts` and `src/folds/*.ts`, so this file is NOT in the scanned set and its
    // own mentions of the directives cannot satisfy it (the scanner is excluded from the
    // scanned; the literals below are split for the same reason).
    const START = `${"v8"} ignore start`;
    const STOP = `${"v8"} ignore stop`;
    const count = (s: string, needle: string) => s.split(needle).length - 1;
    for (const dir of [join(SRC, "folds"), SRC]) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
        const src = readFileSync(join(dir, entry.name), "utf8");
        expect({ file: entry.name, starts: count(src, START), stops: count(src, STOP) }).toEqual({
          file: entry.name,
          starts: count(src, START),
          stops: count(src, START),
        });
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 01-F22 — the empty-toggle-set default, and why it is NOT the incomplete case
// ---------------------------------------------------------------------------

describe("01-F22 — an item nobody has toggled is AVAILABLE, which is a different answer from unresolvable", () => {
  // merge.ts:462's `toggles.size === 0` guard. `projectItemKey` is public on the engine, so
  // this branch is reachable directly rather than only through a delivered event — and it is
  // the only thing standing between an untoggled item and the incomplete-set branch one line
  // below, which resolves to UNAVAILABLE with `availability_incomplete`. Delete the guard and
  // every item nobody has ever touched reads as 86'd.
  //
  // The default is 01-F22's, not 01-F59's (the citation this round corrected): the catalog
  // says what exists and availability is an operational override layered on top of it, so
  // "no toggle delivered" means "sell it". Catalog is never a fold input (01-F52), which is
  // why the engine can answer for an item it has never heard of.

  it("01-F22: projectItemKey on a never-toggled item is available and uncontested, with no heads and no anomaly", () => {
    const engine = createMergeEngine();
    expect(engine.projectItemKey("never-toggled")).toEqual({
      item_id: "never-toggled",
      available: 1,
      contested: 0,
      head_ids_json: "[]",
      anomalies_json: "[]",
    });
  });

  it("01-F22 vs 01-F58: an empty set and an unresolvable set are told apart by the anomaly, and neither item's answer leaks into the other", () => {
    const peer = peerIdentity(identity());
    const engine = createMergeEngine();
    // karahi's ENTIRE delivered set is a 2-cycle, so nothing is maximal: incomplete, not empty.
    engine.rebuild(
      [av(peer, "a", false, ["b"], "karahi"), av(peer, "b", false, ["a"], "karahi")].map((e) =>
        parseEvent(e),
      ),
    );

    const unresolvable = engine.projectItemKey("karahi");
    const untoggled = engine.projectItemKey("naan");

    // Told apart by the ANOMALY under every value of the ratified constant — that is the
    // invariant distinction. (Under AVAILABILITY_FALSE_WINS as ratified they also differ in
    // `available`; asserting both separately keeps this test correct if it is ever flipped.)
    expect(unresolvable.available).toBe(CONSERVATIVE_AVAILABLE);
    expect(JSON.parse(unresolvable.anomalies_json)).toEqual([INCOMPLETE]);

    // Per-item: an unresolvable neighbour must never 86 an item nobody has touched.
    expect(untoggled).toEqual({
      item_id: "naan",
      available: 1,
      contested: 0,
      head_ids_json: "[]",
      anomalies_json: "[]",
    });
  });
});

// ---------------------------------------------------------------------------
// P1-4 (transient) + 26 §7 residual — what catch-up looks like, pinned not discovered
// ---------------------------------------------------------------------------

describe("26 §7 — the conservative read has a transient cost during catch-up; pin it", () => {
  it("01-F58: a page delivering a concurrent pair 86s the item WITH an anomaly, and the resolving toggle in a LATER page clears both (non-monotone, clears on backfill)", () => {
    // 26 §8's ratified shape for conflict visibility: the anomaly is not monotone — it
    // exists to be cleared by the data that resolves it. A device mid-catch-up therefore
    // briefly refuses to sell an item the branch considers available. That is the
    // accepted cost of the 01-F58 direction, asserted here rather than found in a
    // restaurant.
    const id = identity();
    const pass = peerIdentity(id);
    const manager = peerIdentity(id);
    const store = mergeStore(id) as AvailabilityStore;

    const e1 = peerEnvelope(pass, 0, availabilityChanged("karahi", false));
    const e2 = peerEnvelope(manager, 0, availabilityChanged("karahi", true));
    ingestAll(store, [e1, e2]);

    const mid = onlyItem(store);
    expect({ available: mid.available, contested: mid.contested }).toEqual({
      available: CONSERVATIVE_AVAILABLE,
      contested: 1,
    });
    expect(anomalies(mid)).toEqual([CONTESTED]);

    const e3 = peerEnvelope(
      manager,
      1,
      availabilityChanged("karahi", true, [e1.id as string, e2.id as string]),
    );
    ingestAll(store, [e3]);

    const settled = onlyItem(store);
    expect({ available: settled.available, contested: settled.contested }).toEqual({
      available: 1,
      contested: 0,
    });
    expect(anomalies(settled)).toEqual([]);
    store.close();
  });

  it("26 §7 RESIDUAL, pinned NOT fixed: a device holding a strict PREFIX of an honest history reads the stale value with NO anomaly — subset-blindness is a missing-data problem no algebra closes", () => {
    // 26 §7: "availability subset-blindness ... [is a] missing-data problem requiring a
    // delivery-completeness mechanism nobody has specced." Honest histories are DAGs, so
    // any subset of one is a DAG and the maximal set is never empty — the P1-4 guard
    // above CANNOT see this case. 01-F39 gives waiter devices a scoped slice that
    // includes availability, so this is the shape that actually reaches a tablet. Pinned
    // so a future session cannot mistake the P1-4 fix for a fix of THIS.
    const id = identity();
    const store = mergeStore(id) as AvailabilityStore;
    // e2 (the 86) exists on the branch but has not reached this device.
    ingestAll(store, [peerEnvelope(peerIdentity(id), 0, availabilityChanged("karahi", true))]);

    const row = onlyItem(store);
    expect({ available: row.available, contested: row.contested }).toEqual({
      available: 1,
      contested: 0,
    });
    expect(anomalies(row)).toEqual([]);
    store.close();
  });
});

// ---------------------------------------------------------------------------
// P0-3 — contested must be clearable in ONE operator act
// ---------------------------------------------------------------------------

describe("P0-3 / 01-F58 — one tap clears a contest, and which event the device saw cannot matter", () => {
  /** Two concurrent root toggles on one item — the ordinary 01-F22 race. Returns the
   * store's own identity: every later envelope must be minted under it, because the
   * branch stream is identity-scoped (01-F9) and a foreign org/branch is refused at
   * ingest rather than folded. */
  const contestedStore = (): {
    store: AvailabilityStore;
    id: ReturnType<typeof identity>;
    ids: [string, string];
  } => {
    const id = identity();
    const e1 = peerEnvelope(peerIdentity(id), 0, availabilityChanged("karahi", false));
    const e2 = peerEnvelope(peerIdentity(id), 0, availabilityChanged("karahi", true));
    const store = mergeStore(id) as AvailabilityStore;
    ingestAll(store, [e1, e2]);
    return { store, id, ids: [e1.id as string, e2.id as string] };
  };

  it("01-F58: the row NAMES its maximal set, so a caller can build a correct superseding toggle without re-deriving the DAG", () => {
    const { store, ids } = contestedStore();
    const row = onlyItem(store);
    expect(row.contested).toBe(1);
    expect(headIds(row)).toEqual([...ids].sort());
    store.close();
  });

  it.each([
    ["available", true, 1],
    ["unavailable", false, 0],
  ])(
    "01-F58: one toggle superseding exactly head_ids resolves the contest to %s",
    (_label, asserted, expected) => {
      const { store, id } = contestedStore();
      const heads = headIds(onlyItem(store));
      // A THIRD device — a new device under the SAME org/branch (01-F9).
      const fix = peerEnvelope(
        peerIdentity(id),
        0,
        availabilityChanged("karahi", asserted as boolean, heads),
      );
      ingestAll(store, [fix]);
      const row = onlyItem(store);
      expect({ available: row.available, contested: row.contested }).toEqual({
        available: expected,
        contested: 0,
      });
      expect(anomalies(row)).toEqual([]);
      expect(headIds(row)).toEqual([fix.id as string]);
      store.close();
    },
  );

  it("01-F58: superseding head_ids ALWAYS clears — the shipped asymmetry (same intent, opposite outcome by which event was named) must be unreachable", () => {
    // At HEAD: naming m1 clears and naming m2 sticks, for identical operator intent. The
    // contract is that head_ids is the only supersedes source a UI ever needs.
    const peer = peerIdentity(identity());
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 2, maxLength: 5 }),
        fc.boolean(),
        (values: readonly boolean[], asserted: boolean) => {
          const roots = values.map((v, i) => av(peer, `r${i}`, v));
          const heads = headIds(projectOne(roots));
          expect(heads).toEqual(roots.map((r) => r.id as string).sort());
          const after = projectOne([...roots, av(peer, "fix", asserted, heads)]);
          return (
            after.contested === 0 &&
            after.available === (asserted ? 1 : 0) &&
            after.anomalies_json === "[]"
          );
        },
      ),
      { seed: SEED, numRuns: 50 },
    );
  });

  it("01-F34 / 26 §8: exposing head ids must not leak an ordering into a VALUE — under an order-REVERSING id bijection every projected value is byte-identical and only head_ids_json is relabelled", () => {
    // The new field is the one new opportunity to break law 1 (sort the heads, take
    // [0]). reversingIdMap sends the lexicographically smallest id to the largest image,
    // so any min/max-by-id tiebreak moves the answer.
    const id = identity();
    const e1 = peerEnvelope(peerIdentity(id), 0, availabilityChanged("karahi", false));
    const e2 = peerEnvelope(peerIdentity(id), 0, availabilityChanged("karahi", true));

    const before = projectOne([e1, e2]);
    const map = reversingIdMap([e1.id as string, e2.id as string]);
    const after = projectOne([e1, e2].map((e) => relabelEnvelope(e, map)));

    expect({
      available: after.available,
      contested: after.contested,
      anomalies_json: after.anomalies_json,
    }).toEqual({
      available: before.available,
      contested: before.contested,
      anomalies_json: before.anomalies_json,
    });
    expect(headIds(after)).toEqual([...map.values()].sort());
  });

  it("01-F34 / 26 §8: relabel invariance as a PROPERTY over random supersedes graphs — ported from availability.test.ts and strengthened to an ORDER-REVERSING bijection", () => {
    // The shipped suite's relabel property is its strongest asset: it kills a min-id
    // tiebreak in 200/200 trials at numRuns 100, including the variant that smuggles only
    // the VALUE and keeps the contested flag. It must not be lost when the standalone fold
    // is deleted, so it is ported here at the engine layer — and strengthened: string
    // reversal is the identity on 1-char ids and order-preserving in ~15% of draws, while
    // reversingIdMap sends the lexicographically smallest id to the largest image every
    // time. Values must be invariant; only head_ids_json may move, and only by φ.
    const peer = peerIdentity(identity());
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            n: fc.nat({ max: 5 }),
            available: fc.boolean(),
            supersedes: fc.array(fc.nat({ max: 5 }), { maxLength: 3 }),
          }),
          { minLength: 1, maxLength: 6 },
        ),
        (rows: readonly { n: number; available: boolean; supersedes: number[] }[]) => {
          const envelopes = rows.map((r, i) =>
            av(
              peer,
              `e${i}`,
              r.available,
              r.supersedes.map((s) => `e${s}`),
            ),
          );
          const before = projectOne(envelopes);
          const map = reversingIdMap(envelopes.map((e) => e.id as string));
          const after = projectOne(envelopes.map((e) => relabelEnvelope(e, map)));
          const image = headIds(before)
            .map((h) => map.get(h) ?? h)
            .sort();
          return (
            after.available === before.available &&
            after.contested === before.contested &&
            after.anomalies_json === before.anomalies_json &&
            after.item_id === before.item_id &&
            canonicalJson(headIds(after)) === canonicalJson(image)
          );
        },
      ),
      { seed: SEED, numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// P1-6 — the adapter, persistence, refold equivalence, and work-counter honesty
// ---------------------------------------------------------------------------

describe("P1-6 / 01-F6 — availability.changed folds through the engine, persists, and survives refold", () => {
  it("01-F6/01-F22: an ingested availability.changed produces a projection row whose head id IS THE ENVELOPE ID", () => {
    // The payload (registry.ts:39-44) carries no event id, so the adapter must take it
    // from the envelope. Nothing in the repo does this today — merge.ts:561 declines the
    // type and no other consumer exists, so an availability.changed delivered to a
    // device is folded by NOTHING.
    const id = identity();
    const store = mergeStore(id) as AvailabilityStore;
    const env = peerEnvelope(peerIdentity(id), 0, availabilityChanged("karahi", false));
    ingestAll(store, [env]);
    expect(onlyItem(store)).toEqual({
      item_id: "karahi",
      available: 0,
      contested: 0,
      head_ids_json: canonicalJson([env.id]),
      anomalies_json: "[]",
    });
    store.close();
  });

  it("01-F57: `supersedes` survives the schema boundary — a superseding toggle retires its named predecessor through the ingest path", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id) as AvailabilityStore;
    const off = peerEnvelope(peer, 0, availabilityChanged("karahi", false));
    const back = peerEnvelope(peer, 1, availabilityChanged("karahi", true, [off.id as string]));
    ingestAll(store, [off, back]);
    const row = onlyItem(store);
    expect({ available: row.available, contested: row.contested }).toEqual({
      available: 1,
      contested: 0,
    });
    expect(headIds(row)).toEqual([back.id as string]);
    store.close();
  });

  it("01-F6: items are keyed independently — a toggle on one item never projects a row for another", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id) as AvailabilityStore;
    ingestAll(store, [
      peerEnvelope(peer, 0, availabilityChanged("karahi", false)),
      peerEnvelope(peer, 1, availabilityChanged("naan", true)),
    ]);
    expect(availabilityRows(store).map((r) => [r.item_id, r.available])).toEqual([
      ["karahi", 0],
      ["naan", 1],
    ]);
    store.close();
  });

  it("01-F2/01-F6: the projection is PERSISTED — it survives closing and reopening the store, and refold() reproduces it byte-for-byte", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const path = join(mkdtempSync(join(tmpdir(), "restos-availability-")), "device.sqlite");

    const first = mergeStore(id, path) as AvailabilityStore;
    ingestAll(first, [
      peerEnvelope(peer, 0, availabilityChanged("karahi", false)),
      peerEnvelope(peer, 1, availabilityChanged("naan", false)),
    ]);
    const projected = canonicalJson(availabilityRows(first));
    first.close();

    const reopened = mergeStore(id, path) as AvailabilityStore;
    expect(canonicalJson(availabilityRows(reopened))).toEqual(projected);
    reopened.refold?.();
    expect(canonicalJson(availabilityRows(reopened))).toEqual(projected);
    reopened.close();
  });

  it("01-F6 (F5 honesty): the engine folds availability.changed, so events_folded counts it — 'counted, folded nothing' is the one combination the honesty rule forbids", () => {
    // merge.ts:448 increments the counter before the switch; merge.ts:561 returns having
    // folded nothing, so HEAD counts 1 and projects 0 — the exact F5 overcount
    // merge-workcounter.test.ts:119 was written to prevent. Under the sidecar there is
    // no "declines to fold" case at all: the count is honest because the work is real.
    const id = identity();
    const store = mergeStore(id) as AvailabilityStore;
    const before = foldStats(store).events_folded;
    ingestAll(store, [peerEnvelope(peerIdentity(id), 0, availabilityChanged("karahi", false))]);
    expect(foldStats(store).events_folded - before).toBe(1);
    expect(availabilityRows(store)).toHaveLength(1);
    store.close();
  });
});

// ---------------------------------------------------------------------------
// 01-F59 — availability never gates anything
// ---------------------------------------------------------------------------

describe("01-F59 — availability is not an 01-F17 block: an 86'd item never gates the order folds", () => {
  // The citation repair in availability.test.ts left 01-F59 with NO mapped test, because
  // its only previous mapping was the miscited "default is available" block (that default
  // is 01-F22's). This is the half of 01-F59 that IS assertable in the kernel: availability
  // state must be inert with respect to the order plane. The other half — "the counter may
  // still sell it deliberately" — is 02-F31's oversell path on a POS surface, and no test
  // at this layer can reach it.
  //
  // Wiring availability into the order fold as a gate would break 01-F59 AND law 1 at once:
  // an order's projected value would depend on item state, i.e. on this device's
  // availability sync position at fold time — exactly the 01-F52 hazard.

  it("01-F59/01-F17/01-F53: 86-ing an item leaves an order that sells it byte-identical, and a line added AFTER the 86 still lands", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id) as AvailabilityStore;
    ingestAll(store, [
      peerEnvelope(peer, 0, created("O1")),
      peerEnvelope(peer, 1, lineAdded("O1", "L1")), // item-karahi
    ]);
    const beforeOrder = canonicalJson(store.openOrders());

    // The pass 86s the very item this order is selling.
    ingestAll(store, [peerEnvelope(peer, 2, availabilityChanged("item-karahi", false))]);
    expect(onlyItem(store).available).toBe(0);

    // The line's money was captured at append (01-F53) and availability is not an input to
    // the order plane at all, so the order projection must not move by one byte.
    expect(canonicalJson(store.openOrders())).toEqual(beforeOrder);
    expect(store.parked()).toEqual([]);

    // A sale is never blocked (01-F17): the next line lands on the 86'd item.
    ingestAll(store, [peerEnvelope(peer, 3, lineAdded("O1", "L2"))]);
    const row = store.openOrders()[0];
    if (!row) throw new Error("expected one open order");
    expect(Object.keys(JSON.parse(row.json_lines)).sort()).toEqual(["L1", "L2"]);
    store.close();
  });
});

// ---------------------------------------------------------------------------
// P2-8 — one engine, one self-supersession guard, so the two folds cannot disagree
// ---------------------------------------------------------------------------

describe("P2-8 / 01-F34 — a self-superseding event stands; both supersedes-DAG folds answer the same way", () => {
  // availability.ts:61 excludes self-references so "a malformed event cannot erase
  // itself and take the item's whole history with it". merge.ts:488 has no such guard:
  // `for (const id of p.supersedes) e.tombstones.add(id)` tombstones the event itself.
  // Under one engine there is one guard, so the divergence is structurally impossible —
  // these two tests are what pins that.

  it("01-F19/01-F34: an order.table_assigned naming its OWN envelope id keeps its assignment", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    const createEnv = peerEnvelope(peer, 0, created("O1"));
    const base = peerEnvelope(peer, 1, tableAssigned("O1", "T1"));
    // The malformed event names ITSELF.
    const assign = {
      ...base,
      payload: tableAssigned("O1", "T1", { supersedes: [base.id as string] }).payload,
    };
    ingestAll(store, [createEnv, assign]);
    const rows = store.openOrders();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (!row) throw new Error("expected one open order");
    expect(JSON.parse(row.table_ids_json)).toEqual(["T1"]);
    expect(row.table_conflict).toBe(0);
    store.close();
  });

  it("01-F57/01-F34: an availability.changed naming its OWN envelope id keeps its toggle — the same answer, through the same engine", () => {
    const id = identity();
    const store = mergeStore(id) as AvailabilityStore;
    const base = peerEnvelope(peerIdentity(id), 0, availabilityChanged("karahi", false));
    // The malformed event names ITSELF.
    const env = {
      ...base,
      payload: availabilityChanged("karahi", false, [base.id as string]).payload,
    };
    ingestAll(store, [env]);
    const row = onlyItem(store);
    expect({ available: row.available, contested: row.contested }).toEqual({
      available: 0,
      contested: 0,
    });
    expect(headIds(row)).toEqual([env.id as string]);
    store.close();
  });
});

// ---------------------------------------------------------------------------
// §KEY-DERIVATION — GREEN AT HEAD BY DESIGN. Regression guards on the order-keyed
// folds, for the change that generalises `apply`'s key derivation (merge.ts:578-612).
// ---------------------------------------------------------------------------

describe("§KEY-DERIVATION (GREEN at HEAD — guards, not contract): generalising keys must not move the order-keyed folds", () => {
  // NAMED HIGHEST RISK: the PARKED-DRAIN RENDEZVOUS (01-F10, 26 §4 defect 2).
  //
  // Everywhere else, a key answers "which row do I rewrite" and a wrong answer shows up
  // as a wrong or missing row. In the parking path the key is a RENDEZVOUS between two
  // events — `waiting_for` on the parked side, `order.created`'s own key on the drain
  // side — and the two must derive the SAME string. Under a generalised derivation that
  // returns a key SET per event (26 §3), those two sites can drift apart while every
  // in-memory assertion still passes: the event parks, the create lands, the drain index
  // is probed with a key that no longer matches, and the event stays parked FOREVER with
  // no error anywhere. The observable is an order whose confirm never applies — a
  // kitchen ticket that never appears — and `01-F17` says a sale is never blocked.
  // This area has already produced one measured quadratic and one convergence hole
  // (26 §4), which is why it gets the hardest pin.

  it("01-F10/26 §4: a confirm before its create parks under the ORDER key, and only that order's create drains it", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    const confirmEnv = peerEnvelope(peer, 0, confirmed("O1"));
    ingestAll(store, [confirmEnv]);

    // Parked under the order key — not the event's own id, not a generalised key.
    expect(store.parked()).toEqual([
      {
        event_id: confirmEnv.id,
        waiting_for: "O1",
        envelope_json: canonicalJson(confirmEnv),
      },
    ]);

    // A DIFFERENT order's create must not drain it (the waiting_for index, 26 §4).
    ingestAll(store, [peerEnvelope(peer, 1, created("O2"))]);
    expect(store.parked().map((p) => p.event_id)).toEqual([confirmEnv.id]);

    // Its own create drains it, and the confirm actually applies.
    ingestAll(store, [peerEnvelope(peer, 2, created("O1"))]);
    expect(store.parked()).toEqual([]);
    const o1 = store.openOrders().find((r) => r.order_id === "O1");
    expect(o1?.confirmed_at).not.toBeNull();
    store.close();
  });

  it("01-F6: incremental delivery must write the PERSISTED row, not only the in-memory lattice", () => {
    // The second-highest risk: if `dirty` becomes namespaced (`order:O1`) but the
    // store's row-write path still expects a bare id, the lattice is right and SQLite is
    // stale. Only a read of openOrders() BETWEEN deliveries — with no refold — sees it.
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    ingestAll(store, [peerEnvelope(peer, 0, created("O1"))]);
    expect(store.openOrders()).toHaveLength(1);

    ingestAll(store, [peerEnvelope(peer, 1, lineAdded("O1", "L1"))]);
    const afterLine = store.openOrders()[0];
    if (!afterLine) throw new Error("expected one open order");
    expect(Object.keys(JSON.parse(afterLine.json_lines))).toEqual(["L1"]);

    ingestAll(store, [peerEnvelope(peer, 2, tableAssigned("O1", "T3"))]);
    const afterTable = store.openOrders()[0];
    if (!afterTable) throw new Error("expected one open order");
    expect(JSON.parse(afterTable.table_ids_json)).toEqual(["T3"]);
    store.close();
  });

  it("fix-round F8: an unknown key prefix is STILL rejected loudly with nothing changed — adding a namespace must not turn the guard into 'anything with a colon'", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    ingestAll(store, [peerEnvelope(peer, 0, created("O1"))]);
    const before = canonicalJson(store.openOrders());
    expect(() => store.retentionDrop?.(["bogus:O1"])).toThrow();
    expect(() => store.retentionDrop?.(["line:O1"])).toThrow();
    expect(canonicalJson(store.openOrders())).toEqual(before);
    store.close();
  });
});

describe("§KEY-DERIVATION (RED): the item key must join the same machinery", () => {
  it("01-F10/01-F17: an availability.changed never parks — it carries its full projection key and must never wait for an order", () => {
    const id = identity();
    const store = mergeStore(id) as AvailabilityStore;
    ingestAll(store, [peerEnvelope(peerIdentity(id), 0, availabilityChanged("karahi", false))]);
    expect(store.parked()).toEqual([]);
    expect(availabilityRows(store)).toHaveLength(1);
    store.close();
  });

  it("01-F42/fix-round F1: dropping an ORDER key leaves item keys untouched — the namespaces must not collide", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id) as AvailabilityStore;
    ingestAll(store, [
      peerEnvelope(peer, 0, created("O1")),
      // The open-bill guard (01-F42/01-F17) forbids pruning an unsettled entity, so the
      // order must be SETTLED before it is droppable. That guard is pre-existing and
      // correct; the property under test here is namespace isolation, not the guard.
      peerEnvelope(peer, 1, settlementClosed("O1")),
      peerEnvelope(peer, 2, availabilityChanged("karahi", false)),
    ]);
    const items = canonicalJson(availabilityRows(store));
    store.retentionDrop?.(["order:O1"]);
    expect(store.openOrders()).toEqual([]);
    expect(canonicalJson(availabilityRows(store))).toEqual(items);
    store.close();
  });
});
