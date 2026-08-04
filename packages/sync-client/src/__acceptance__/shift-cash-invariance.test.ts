// Acceptance tests — S-2's 01-F34 oracle for the `shift_cash` fold. This is the heart of
// the suite and the law most often broken by accident.
//
// Device folds read NO ordering metadata: no `global_seq`, no `lamport_seq`, no device clock,
// no envelope-id comparison that reaches a projected VALUE. Authored from spec text only
// (24 §3 step 2): 01-F34, 01-F43..F46, 26 §7 and 26 §8's binding lesson.
//
// ── WHY PLAIN CONVERGENCE IS NOT ENOUGH (26 §8) ─────────────────────────────
// A `min(envelope.id)` tiebreak PASSES plain convergence and is convergent-AND-WRONG:
// `00 §6` pins ids to UUIDv7, whose leading 48 bits are the minting device's wall clock, so
// id-min is min-wall-clock in a disguise. Only bijective relabelling — including an
// ORDER-REVERSING one — kills it. The old refold-equivalence gate is deliberately NOT ported:
// it would bless min-id.
//
// Three independent nets, because each catches what the others miss:
//   1. RELABEL      — an order-reversing bijection over envelope ids. Kills min/max-by-id.
//   2. INJECTION    — garbage `device_created_at` / `lamport_seq` / `global_seq` /
//                     `server_received_at` on the identical set. Kills clock and sequence reads
//                     that survive relabelling.
//   3. POISON       — Proxy-wrapped envelopes that THROW the moment the fold reads one of the
//                     four banned fields (26 §8's own technique). Names the offending field at
//                     the moment of the read instead of inferring it from a diff, and catches a
//                     read whose effect happens to cancel in the projection.
// Each net carries its own anti-vacuity twin, because a fold that reads NOTHING passes all
// three: the branch-stamp test proves the fold really does read the one clock it is allowed to.
//
// ── AND THE NETS MUST COVER THE DANGEROUS CASE, NOT MERELY EXIST ────────────
// Technique is not coverage. A min-id tiebreak is only observable on a field decided among
// DIVERGENT concurrent heads, so a suite whose relabel net runs over a set containing no such
// field is a correct net over a safe fixture. This fold has one such money field —
// `days.opening_float_paisa` under two disagreeing `day.opened` events — and it is therefore
// carried by `shiftCashScenario()` (so all three nets above run over it) and isolated in §1b
// (so the red names the float rather than "a 25-event projection moved").
//
// RED-AWAITING-IMPLEMENTATION — `@restos/sync-client/fold-engine` exports none of the three
// shift_cash symbols yet.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { must } from "./builders.js";
import { relabelEnvelope, reversingIdMap, shuffled } from "./merge-builders.js";
import {
  BANNED_METADATA,
  DIVERGENT_FLOAT_A,
  DIVERGENT_FLOAT_B,
  divergentDayOpenSet,
  generateShiftCashSet,
  injectGarbageMetadata,
  poisoned,
  projectionBytes,
  reversedIds,
  shiftBranchStamps,
  shiftCash,
  shiftCashScenario,
} from "./shift-cash-builders.js";

type Env = Record<string, unknown> & { id: string };

// ===========================================================================
// §0 — the tripwire itself must be live. A guard that cannot fire is the round-2 §C
// failure ("the guard passed by not looking"), so the poison is tested before it is used.
// ===========================================================================

describe("§0 the Proxy poison is a LIVE tripwire, not decoration (26 §8)", () => {
  it("01-F34: reading any of the four banned fields off a poisoned envelope throws, naming the field", () => {
    const { envelopes } = shiftCashScenario();
    const env = poisoned(must(envelopes[0], "envelope"));
    for (const field of BANNED_METADATA) {
      expect(() => (env as Record<string, unknown>)[field]).toThrow(
        new RegExp(`01-F34 violation.*${field}`),
      );
    }
  });

  it("01-F43/01-F45: the fields a fold IS allowed to read pass through the poison untouched", () => {
    const { envelopes } = shiftCashScenario();
    const raw = must(envelopes[0], "envelope");
    const env = poisoned(raw);
    expect(env.type).toBe(raw.type);
    expect(env.payload).toEqual(raw.payload);
    expect(env.branch_created_at).toBe(raw.branch_created_at);
    expect(env.time_basis).toBe(raw.time_basis);
    expect(env.id).toBe(raw.id);
    // Copying an envelope is not reading a value out of it: a spread must not trip the wire,
    // and the copy must carry none of the banned fields.
    const copy = { ...env } as Record<string, unknown>;
    for (const field of BANNED_METADATA) expect(copy[field]).toBeUndefined();
    expect(copy.payload).toEqual(raw.payload);
  });
});

// ===========================================================================
// §1 — RELABEL (26 §8's binding lesson).
// ===========================================================================

describe("§1 bijective envelope-id relabelling, including order-reversing (01-F34, 26 §8)", () => {
  it("01-F34: an ORDER-REVERSING id bijection leaves the shift_cash projection BYTE-IDENTICAL — the projection carries no id, so φ is the identity on it", () => {
    const fold = shiftCash();
    const { envelopes } = shiftCashScenario();
    const baseline = fold.projectAll(envelopes);
    const map = reversingIdMap(envelopes.map((e) => e.id));
    // Sanity on the adversary itself: the bijection really does INVERT the id order, so a
    // min-id or max-id tiebreak necessarily changes its answer here. Without this the whole
    // relabel net could be an identity map and every assertion below would be free.
    const sortedIds = [...envelopes.map((e) => e.id)].sort();
    const images = sortedIds.map((id) => must(map.get(id), "image"));
    expect(images).toEqual([...images].sort().reverse());
    expect(new Set(images).size).toBe(images.length); // still a bijection

    const relabelled = envelopes.map((env) => relabelEnvelope(env, map));
    expect(projectionBytes(fold.projectAll(relabelled))).toBe(projectionBytes(baseline));
  });

  it("01-F34: relabelling + garbage metadata + a shuffled delivery, all at once, still projects byte-identically", () => {
    const fold = shiftCash();
    const { envelopes } = shiftCashScenario();
    const baseline = fold.projectAll(envelopes);
    const map = reversingIdMap(envelopes.map((e) => e.id));
    const adversarial = shuffled(
      injectGarbageMetadata(envelopes.map((env) => relabelEnvelope(env, map)) as Env[]),
      31337,
    );
    expect(projectionBytes(fold.projectAll(adversarial))).toBe(projectionBytes(baseline));
  });
});

// ===========================================================================
// §1b — THE DIVERGENT-MONEY CASE, ISOLATED.
//
// 26 §8's binding lesson is not "have a relabel test", it is "the relabel test must COVER the
// case a min-id tiebreak decides". This fold has exactly one such money field: two `day.opened`
// events for one `day_id` carrying DIFFERENT `opening_float_paisa`. Those are concurrent
// divergent heads, not a redelivery, and a fold resolving them by `min(envelope.id)` converges
// on every device (so shuffling never sees it) while quietly letting the minting device's wall
// clock — the UUIDv7 prefix, `00 §6` — decide the branch's opening cash.
//
// The case is inside `shiftCashScenario()` too, so every net in this file already runs over it.
// It is ALSO isolated here so the red is diagnostic: a failure below names the divergent float
// instead of reporting that the whole-evening scenario's projection moved.
// ===========================================================================

describe("§1b the divergent-float day is under the FULL adversary (01-F34, 26 §7, 26 §8)", () => {
  it("01-F34/26 §8: an ORDER-REVERSING id bijection leaves the divergent-float projection byte-identical — min-id and max-id both flip their answer here", () => {
    const fold = shiftCash();
    const { envelopes } = divergentDayOpenSet();

    // The fixture must actually be the dangerous shape: two members, one key, disagreeing on
    // MONEY. A fixture that quietly agreed would make every assertion below free.
    const opens = envelopes.filter((e) => e.type === "day.opened");
    expect(opens).toHaveLength(2);
    expect(DIVERGENT_FLOAT_A).not.toBe(DIVERGENT_FLOAT_B);
    expect(
      opens.map((e) => (e.payload as { opening_float_paisa: number }).opening_float_paisa),
    ).toEqual([DIVERGENT_FLOAT_A, DIVERGENT_FLOAT_B]);

    const baseline = fold.projectAll(envelopes);
    const relabelled = reversedIds(envelopes);
    // Guard the guard (round-2 §C pattern 2): φ must be a bijection AND must invert the order.
    expect(relabelled.reversing).toBe(true);
    expect(relabelled.bijective).toBe(true);
    expect(projectionBytes(fold.projectAll(relabelled.envelopes))).toBe(projectionBytes(baseline));
  });

  it("01-F34/01-F45/26 §8: the same divergent-float set under garbage metadata, Proxy poison and shuffled delivery — all three nets, one fixture", () => {
    const fold = shiftCash();
    const { envelopes } = divergentDayOpenSet();
    const baseline = fold.projectAll(envelopes);

    const injected = injectGarbageMetadata(envelopes);
    expect(injected.map((e) => e.lamport_seq)).not.toEqual(envelopes.map((e) => e.lamport_seq));
    expect(projectionBytes(fold.projectAll(injected))).toBe(projectionBytes(baseline));

    for (const seed of [11, 977, 40503]) {
      // `reversedIds` builds φ from the id SET, so shuffling first varies the delivery order
      // without weakening the bijection — both guards still have to hold.
      const relabelled = reversedIds(shuffled(envelopes, seed));
      expect(relabelled.reversing).toBe(true);
      expect(relabelled.bijective).toBe(true);
      const poison = injectGarbageMetadata(relabelled.envelopes as Env[]).map((env) =>
        poisoned(env),
      );
      const project = () => fold.projectAll(poison);
      // The poison throws NAMING the field it caught, so this red is diagnostic.
      expect(project).not.toThrow();
      expect(projectionBytes(project())).toBe(projectionBytes(baseline));
    }
  });
});

// ===========================================================================
// §2 — INJECTION, with its anti-vacuity twin.
// ===========================================================================

describe("§2 sequence/clock injection invariance (01-F34, 01-F45)", () => {
  it("01-F34/01-F45: garbage device_created_at, lamport_seq, global_seq and server_received_at on the identical set project byte-identically", () => {
    const fold = shiftCash();
    const { envelopes } = shiftCashScenario();
    const baseline = fold.projectAll(envelopes);
    const injected = injectGarbageMetadata(envelopes);
    // The adversary must actually differ, or this test proves nothing.
    expect(injected.map((e) => e.device_created_at)).not.toEqual(
      envelopes.map((e) => e.device_created_at),
    );
    expect(projectionBytes(fold.projectAll(injected))).toBe(projectionBytes(baseline));
  });

  it("01-F43 (anti-vacuity twin): moving every BRANCH stamp DOES move the projection — the fold reads branch time, it does not read no time at all", () => {
    const fold = shiftCash();
    const { envelopes } = shiftCashScenario();
    const baseline = fold.projectAll(envelopes);
    const shifted = shiftBranchStamps(envelopes, 3_600_000);
    // Without this pin, a fold that projected `open_at: 0` unconditionally would pass every
    // invariance test in this file.
    expect(projectionBytes(fold.projectAll(shifted))).not.toBe(projectionBytes(baseline));
    const openAts = fold.projectAll(shifted).shifts.map((r) => r.open_at);
    expect(openAts).toEqual(baseline.shifts.map((r) => r.open_at + 3_600_000));
  });
});

// ===========================================================================
// §3 — POISON: 26 §8's dynamic enforcement.
// ===========================================================================

describe("§3 Proxy-poisoned envelopes — no ordering-metadata read at all (26 §8)", () => {
  it("01-F34: the whole scenario folds through envelopes that THROW on an ordering-metadata read, and projects exactly what the unpoisoned set does", () => {
    const fold = shiftCash();
    const { envelopes } = shiftCashScenario();
    const baseline = fold.projectAll(envelopes);
    const poison = envelopes.map((env) => poisoned(env));
    const project = () => fold.projectAll(poison);
    // The throw would name the offending field, so this failure is diagnostic, not a mystery.
    expect(project).not.toThrow();
    expect(projectionBytes(project())).toBe(projectionBytes(baseline));
  });

  it("01-F34: the poison holds under a shuffled delivery too — a read that only happens on a re-ordering path is still a read", () => {
    const fold = shiftCash();
    const { envelopes } = shiftCashScenario();
    const baseline = fold.projectAll(envelopes);
    for (const seed of [7, 1009, 65521]) {
      const poison = shuffled(envelopes, seed).map((env) => poisoned(env));
      expect(projectionBytes(fold.projectAll(poison))).toBe(projectionBytes(baseline));
    }
  });
});

// ===========================================================================
// §4 — COMMUTATIVITY, IDEMPOTENCE AND DETERMINISTIC ROW ORDER (FOLDS.md line 7, 01-F34).
// ===========================================================================

describe("§4 the fold is commutative, idempotent, and returns rows in a delivery-independent order", () => {
  it("01-F34: five shuffled deliveries, each also duplicated, all project byte-identically", () => {
    const fold = shiftCash();
    const { envelopes } = shiftCashScenario();
    const baseline = fold.projectAll(envelopes);
    for (const seed of [1, 2, 3, 5, 8]) {
      const order = shuffled(envelopes, seed);
      expect(projectionBytes(fold.projectAll(order))).toBe(projectionBytes(baseline));
      // Transport duplicates (01-F8) change nothing — idempotence per envelope.
      expect(projectionBytes(fold.projectAll([...order, ...shuffled(envelopes, seed + 100)]))).toBe(
        projectionBytes(baseline),
      );
    }
  });

  it("01-F34: rows come back sorted by their key, not in insertion order — row order is projection, so delivery order must not be visible in it", () => {
    const fold = shiftCash();
    const { envelopes } = shiftCashScenario();
    const proj = fold.projectAll(shuffled(envelopes, 424242));
    expect(proj.shifts.map((r) => r.shift_id)).toEqual(
      [...proj.shifts.map((r) => r.shift_id)].sort(),
    );
    expect(proj.days.map((r) => r.day_id)).toEqual([...proj.days.map((r) => r.day_id)].sort());
    expect(proj.unbound.map((r) => r.settlement_attempt_id)).toEqual(
      [...proj.unbound.map((r) => r.settlement_attempt_id)].sort(),
    );
    // Non-vacuous: the scenario really does contain rows of each kind to order.
    expect(proj.shifts.length).toBeGreaterThan(1);
    expect(proj.unbound.length).toBeGreaterThan(0);
  });

  it("FOLDS.md line 7: projectShiftCash is pure — projecting the same state twice returns the same bytes", () => {
    const fold = shiftCash();
    const { envelopes } = shiftCashScenario();
    const state = fold.foldAll(envelopes);
    expect(projectionBytes(fold.project(state))).toBe(projectionBytes(fold.project(state)));
  });
});

// ===========================================================================
// §5 — THE PROPERTY, over generated sets (20 §2.3).
// ===========================================================================

describe("§5 property — every generated shift/cash set is invariant under the full adversary", () => {
  it("01-F34: for every seed, order-reversing relabel + garbage metadata + shuffled delivery projects byte-identically", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0x7fffffff }),
        fc.integer({ min: 0, max: 0x7fffffff }),
        (setSeed, orderSeed) => {
          const fold = shiftCash();
          const set = generateShiftCashSet(setSeed);
          const baseline = fold.projectAll(set.envelopes);
          const map = reversingIdMap(set.envelopes.map((e) => e.id));
          const adversarial = shuffled(
            injectGarbageMetadata(set.envelopes.map((env) => relabelEnvelope(env, map)) as Env[]),
            orderSeed,
          );
          expect(projectionBytes(fold.projectAll(adversarial))).toBe(projectionBytes(baseline));
        },
      ),
      { numRuns: 50 },
    );
  });

  it("01-F34/26 §8: for every seed, the generated set also folds through poisoned envelopes to the same bytes", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0x7fffffff }),
        fc.integer({ min: 0, max: 0x7fffffff }),
        (setSeed, orderSeed) => {
          const fold = shiftCash();
          const set = generateShiftCashSet(setSeed);
          const baseline = fold.projectAll(set.envelopes);
          const poison = shuffled(set.envelopes, orderSeed).map((env) => poisoned(env));
          expect(projectionBytes(fold.projectAll(poison))).toBe(projectionBytes(baseline));
        },
      ),
      { numRuns: 50 },
    );
  });
});
