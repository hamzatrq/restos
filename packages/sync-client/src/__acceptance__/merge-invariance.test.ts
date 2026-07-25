// Acceptance tests — the 01-F34 invariance oracle (T-01-15; the heart of the suite).
// Device folds read NO ordering metadata: no global_seq, no lamport_seq, no device
// clock. Property-tested exactly as the rewritten 01-F34 mandates: bijective
// envelope-id relabeling (including an ORDER-REVERSING one) and sequence/clock
// injection invariance. Plain convergence is insufficient — a min-envelope-id
// tiebreak passes it while smuggling wall clock through the UUIDv7 prefix; only
// relabel invariance kills it (26 §8, binding oracle lesson).
//
// Two deliberate scopings, both reported as findings:
// 1. Ids are IDENTITY-only (Addendum-B): `supersedes`/`preds` REFERENCE ids, so the
//    bijection is applied consistently to references, and the expected projection is
//    the φ-image of the original projection (id keys in anomaly maps / parked
//    membership map through φ). "No id read" is pinned as "no id COMPARISON/ORDER".
// 2. The three time-VALUED columns (confirmed_at / confirm_at / age_basis) are
//    excluded via invariantProjection: the T-01-15 contract keeps their value
//    stamping on device_created_at until DEC-TIME-001, which contradicts 01-F34's
//    literal "byte-equal under clock injection" — flagged for spec correction, not
//    silently absorbed. Everything else must be bit-identical.
// RED-AWAITING-IMPLEMENTATION against the shipped comparator engine.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Identity, must, peerEnvelope } from "./builders.js";
import {
  confirmed,
  created,
  edge,
  generateMergeSet,
  ingestAll,
  invariantBytes,
  invariantProjection,
  lineAdded,
  mapProjectionIds,
  mergeStore,
  payment,
  projectionBytes,
  refund,
  relabelEnvelope,
  reversingIdMap,
  settlementClosed,
  shuffled,
  tableAssigned,
} from "./merge-builders.js";

const T0 = 1752800000000;

type Env = Record<string, unknown> & { id: string };

/** A directed scenario touching every merge rule: duplicate divergent creates,
 * an edge chain into a contested terminal pair, an illegal edge, a supersession
 * chain AND a concurrent assignment head, agreed/disputed/repay attempts, a refund
 * keyed by parent attempt, a settlement close, two confirms, and a parked orphan. */
const richScenario = () => {
  const identity: Identity = { org_id: "org-inv", branch_id: "br-inv", device_id: "d0-own" };
  const peers: Identity[] = [1, 2, 3].map((i) => ({ ...identity, device_id: `d${i}-peer` }));
  const lamports = [0, 0, 0];
  const envelopes: Env[] = [];
  const emit = (peerIdx: number, typed: Record<string, unknown>, offset: number): string => {
    const peer = must(peers[peerIdx], "peer");
    const lamport = must(lamports[peerIdx], "lamport");
    lamports[peerIdx] = lamport + 1;
    const id = `e-${String(envelopes.length).padStart(2, "0")}`;
    envelopes.push(
      peerEnvelope(peer, lamport, { id, device_created_at: T0 + offset, ...typed }) as Env,
    );
    return id;
  };

  const createdId = emit(0, created("O1", { table_id: "T1" }), 0);
  emit(1, created("O1", { channel: "takeaway" }), 50); // divergent duplicate create
  emit(0, lineAdded("O1", "L1"), 100);
  emit(1, lineAdded("O1", "L2", { qty: 2, unit_price_paisa: 700 }), 150);
  const c1 = emit(0, edge("O1", "L1", "confirmed", ["placed"]), 200);
  const c2 = emit(0, edge("O1", "L1", "in_prep", ["confirmed"], [c1]), 250);
  const c3 = emit(0, edge("O1", "L1", "ready", ["in_prep"], [c2]), 300);
  emit(1, edge("O1", "L1", "served", ["ready"], [c3]), 350); // contested pair …
  emit(2, edge("O1", "L1", "voided", ["ready"], [c3]), 350); // … two terminal heads
  emit(2, edge("O1", "L2", "ready", ["placed"]), 400); // payload-illegal edge
  const a1 = emit(1, tableAssigned("O1", "T4", { from: "T1", supersedes: [createdId] }), 450);
  emit(1, tableAssigned("O1", "T7", { from: "T4", supersedes: [a1] }), 500); // chain head T7
  emit(2, tableAssigned("O1", "T9", { from: "T1", supersedes: [createdId] }), 500); // concurrent head T9
  emit(0, confirmed("O1"), 550);
  emit(2, confirmed("O1"), 560);
  emit(0, payment("O1", 185000, { attempt: "sa-K" }), 600); // agreed attempt
  emit(1, payment("O1", 185000, { attempt: "sa-K" }), 610); // intent duplicate — same member value
  emit(1, payment("O1", 500, { attempt: "sa-D" }), 620); // disputed attempt …
  emit(2, payment("O1", 185000, { attempt: "sa-D" }), 630); // … divergent second member
  emit(2, payment("O1", 50000, { attempt: "sa-R", purpose: "repays_receivable" }), 640);
  emit(0, refund("O1", 20000, { attempt: "sa-ref", parent: "sa-K" }), 650);
  emit(1, settlementClosed("O1", { settlement_attempt_ids: ["sa-K"] }), 700);
  emit(2, confirmed("O-ghost"), 750); // permanent orphan — parked membership

  return { identity, envelopes };
};

/** Garbage clock + lamport injection: same ids, same payloads, same devices —
 * every device_created_at replaced by an unrelated value and every lamport_seq by
 * a disjoint counter (unique per device, so the ingest-seam corruption guards
 * cannot fire). A fold reading either would diverge. */
const garbageStamps = (envelopes: readonly Env[]): Env[] =>
  envelopes.map((env, i) => ({
    ...env,
    device_created_at: T0 - (i + 1) * 9_999_991, // reversed and absurd — before the epoch of the set
    lamport_seq: 100_000 + (envelopes.length - i) * 7, // disjoint from the real counters, unique
  }));

describe("01-F34 — sequence/clock injection invariance", () => {
  it("01-F34: garbage device_created_at + lamport_seq on the identical event set produce a bit-identical merge projection", () => {
    const { identity, envelopes } = richScenario();
    const real = mergeStore(identity);
    ingestAll(real, envelopes);
    const injected = mergeStore(identity);
    ingestAll(injected, garbageStamps(envelopes));
    expect(invariantBytes(injected)).toBe(invariantBytes(real));
    real.close();
    injected.close();
  });

  it("01-F34/01-F3: assigning arbitrary global_seq values to every event changes NOTHING — the full projection (time columns included) is bit-identical across the adoption boundary", () => {
    const { identity, envelopes } = richScenario();
    const store = mergeStore(identity);
    ingestAll(store, envelopes);
    const before = projectionBytes(store);
    // Cloud order arrives REVERSED relative to emission — under the superseded law
    // this reordered the fold; under 01-F34 it is a sidecar write only.
    [...envelopes].reverse().forEach((env, i) => {
      store.assignGlobalSeq(env.id, i + 1);
    });
    expect(projectionBytes(store)).toBe(before);
    store.close();
  });

  it("01-F34: a duplicate-id ingest CARRYING global_seq (the LAN-first-then-cloud-catchup path) adopts the seq with zero projection change", () => {
    const { identity, envelopes } = richScenario();
    const store = mergeStore(identity);
    ingestAll(store, envelopes);
    const before = projectionBytes(store);
    envelopes.forEach((env, i) => {
      expect(store.ingest(env, { global_seq: 1000 + i })).toEqual({ stored: false });
    });
    expect(projectionBytes(store)).toBe(before);
    store.close();
  });
});

describe("01-F34 — bijective envelope-id relabeling (including order-reversing)", () => {
  it("01-F34: an ORDER-REVERSING id bijection, applied consistently to ids and to id references (supersedes, preds), maps the projection through φ exactly", () => {
    const { identity, envelopes } = richScenario();
    const real = mergeStore(identity);
    ingestAll(real, envelopes);
    const map = reversingIdMap(envelopes.map((e) => e.id));
    const relabeled = mergeStore(identity);
    ingestAll(
      relabeled,
      envelopes.map((env) => relabelEnvelope(env, map)),
    );
    const expected = mapProjectionIds(invariantProjection(real), map);
    expect(JSON.stringify(invariantProjection(relabeled))).toBe(JSON.stringify(expected));
    real.close();
    relabeled.close();
  });

  it("01-F34: relabeling + garbage stamps + arbitrary global_seq + a shuffled delivery order — all at once — still maps the projection through φ exactly", () => {
    const { identity, envelopes } = richScenario();
    const real = mergeStore(identity);
    ingestAll(real, envelopes);
    const map = reversingIdMap(envelopes.map((e) => e.id));
    const adversarial = shuffled(
      garbageStamps(envelopes.map((env) => relabelEnvelope(env, map)) as Env[]),
      31337,
    );
    const store = mergeStore(identity);
    ingestAll(store, adversarial);
    adversarial.forEach((env, i) => {
      store.assignGlobalSeq(env.id, 500 + i);
    });
    const expected = mapProjectionIds(invariantProjection(real), map);
    expect(JSON.stringify(invariantProjection(store))).toBe(JSON.stringify(expected));
    real.close();
    store.close();
  });

  it("01-F34: property — generated sets under order-reversing relabel + garbage stamps + shuffled delivery project identically (φ-mapped), for every seed", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0x7fffffff }),
        fc.integer({ min: 0, max: 0x7fffffff }),
        (setSeed, orderSeed) => {
          const set = generateMergeSet(setSeed);
          const real = mergeStore(set.identity);
          ingestAll(real, set.envelopes);
          const map = reversingIdMap(set.envelopes.map((e) => e.id));
          const adversarial = shuffled(
            garbageStamps(set.envelopes.map((env) => relabelEnvelope(env, map)) as Env[]),
            orderSeed,
          );
          const store = mergeStore(set.identity);
          ingestAll(store, adversarial);
          const expected = mapProjectionIds(invariantProjection(real), map);
          expect(JSON.stringify(invariantProjection(store))).toBe(JSON.stringify(expected));
          real.close();
          store.close();
        },
      ),
      { numRuns: 50 },
    );
  });
});
