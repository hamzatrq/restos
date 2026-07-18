// Acceptance property tests — T-01-04 fold laws (20 §2.3), authored from the
// kernel-tasks binding contract + packages/sync-client/FOLDS.md +
// specs/01-kernel-sync.md §3/§6 only (24 §3 step 2: read-only to the
// implementing session). The contract's four property laws: replay determinism
// (01-N1), commutativity + idempotence over concurrently-received events
// (01-F34), refold equivalence (01-F6). Heavy properties cap at numRuns 30;
// every draw routes through the NAMED seeded generator `generateBranchEventSet`
// so any failure reproduces from the printed fast-check seed.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type DeviceStore, openStore } from "../index.js";
import {
  appendInput,
  canonicalJson,
  type Identity,
  kotPrinted,
  lineStateChanged,
  orderConfirmed,
  orderCreated,
  orderLineAdded,
  orderTableAssigned,
  paymentRecorded,
  paymentRefunded,
  peerEnvelope,
  seededRng,
} from "./builders.js";

// T-01-04 store surface per the binding contract (mirrors the contract typing in
// folds-directed.test.ts) — a missing method fails the red run at runtime.
type OpenOrderRow = {
  order_id: string;
  channel: string;
  order_type: string | null;
  table_id: string | null;
  confirmed_at: number | null;
  settled: number;
  json_lines: string;
};

type KitchenQueueRow = {
  order_id: string;
  confirm_at: number;
  channel: string;
  age_basis: number;
  lines_ready: number;
  lines_total: number;
};

type ParkedRow = { event_id: string; waiting_for: string; envelope_json: string };

type FoldStore = DeviceStore & {
  ingest(envelope: unknown, opts?: { global_seq?: number }): { stored: boolean };
  assignGlobalSeq(event_id: string, global_seq: number): void;
  openOrders(): OpenOrderRow[];
  kitchenQueue(): KitchenQueueRow[];
  parked(): ParkedRow[];
  refold(): void;
};

const foldStore = (id: Identity) => openStore({ path: ":memory:", identity: id }) as FoldStore;

const tables = (store: FoldStore) => ({
  orders: store.openOrders(),
  queue: store.kitchenQueue(),
  parked: store.parked(),
});

/** Byte-level snapshot — json_lines / envelope_json compare byte-for-byte inside it. */
const snapshot = (store: FoldStore): string => canonicalJson(tables(store));

const must = <T>(x: T | undefined, what: string): T => {
  if (x === undefined) throw new Error(`generator invariant violated: missing ${what}`);
  return x;
};

// ---------------------------------------------------------------------------
// Named seeded generator (20 §2.3): registry-valid multi-device branch event
// sets. N devices (own + 1..3 peers), gap-free per-device lamport, mixed
// consumed types, cross-device parenting so many interleavings park (01-F10),
// occasional permanent orphans so `parked` converges as a table (not just to
// empty), and cross-device timestamp ties exercising the canonical-order
// tiebreak key (global_seq ?? +inf, device_created_at, device_id, lamport_seq).
// ---------------------------------------------------------------------------

const T0 = 1752800000000;

type Delivery =
  | { via: "append"; device_id: string; input: ReturnType<typeof appendInput> }
  | { via: "ingest"; device_id: string; envelope: ReturnType<typeof peerEnvelope> };

type BranchEventSet = {
  identity: Identity;
  /** queues[i] = device i's emissions in its own lamport order; queue 0 = the store's device. */
  queues: Delivery[][];
  /** Every generated envelope id — all are stored after any full delivery. */
  eventIds: string[];
};

const LINE_TARGET_STATES = [
  "confirmed",
  "in_prep",
  "ready",
  "served",
  "voided",
  "cancelled",
] as const;

/** The NAMED seeded generator behind every fold property (20 §2.3) — no ambient randomness. */
const generateBranchEventSet = (setSeed: number): BranchEventSet => {
  const rng = seededRng(setSeed);
  const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]): T => must(xs[Math.floor(rng() * xs.length)], "pick");

  const own: Identity = {
    org_id: `org-${setSeed}`,
    branch_id: `br-${setSeed}`,
    device_id: "d0-own",
  };
  const devices: Identity[] = [own];
  for (let i = 1, n = int(2, 4); i < n; i++) devices.push({ ...own, device_id: `d${i}-peer` });

  const queues: Delivery[][] = devices.map(() => []);
  const clocks = devices.map(() => T0 + int(0, 5) * 100);
  const lamports = devices.map(() => 0);
  const eventIds: string[] = [];

  const emit = (
    deviceIdx: number,
    typed: { type: string; payload: Record<string, unknown> },
  ): string => {
    const id = `e${eventIds.length}`;
    eventIds.push(id);
    const device = must(devices[deviceIdx], "device");
    const queue = must(queues[deviceIdx], "queue");
    const at = must(clocks[deviceIdx], "clock");
    clocks[deviceIdx] = at + int(0, 3) * 100; // zero-steps create the tie cases
    if (deviceIdx === 0) {
      queue.push({
        via: "append",
        device_id: device.device_id,
        input: appendInput(own, { id, device_created_at: at, ...typed }),
      });
    } else {
      const lamport = must(lamports[deviceIdx], "lamport");
      lamports[deviceIdx] = lamport + 1; // gap-free per device
      queue.push({
        via: "ingest",
        device_id: device.device_id,
        envelope: peerEnvelope(device, lamport, { id, device_created_at: at, ...typed }),
      });
    }
    return id;
  };

  const anyDevice = () => int(0, devices.length - 1);
  const orderIds: string[] = [];
  for (let o = 0, n = int(1, 3); o < n; o++) orderIds.push(`O${o}`);

  for (const orderId of orderIds) {
    const created =
      rng() < 0.3 ? orderCreated(orderId, { table_id: `T${int(1, 3)}` }) : orderCreated(orderId);
    emit(anyDevice(), created);
    const lineIds: string[] = [];
    for (let l = 0, n = int(1, 3); l < n; l++) {
      const lineId = `${orderId}-L${l}`;
      lineIds.push(lineId);
      emit(
        anyDevice(),
        orderLineAdded(orderId, lineId, { qty: int(1, 3), unit_price_paisa: int(1, 5) * 100 }),
      );
    }
    for (let c = int(0, 2); c > 0; c--) emit(anyDevice(), orderConfirmed(orderId));
    for (let k = int(0, 2); k > 0; k--) emit(anyDevice(), kotPrinted(orderId));
    for (let t = int(0, 2); t > 0; t--)
      emit(anyDevice(), orderTableAssigned(orderId, `T${int(1, 3)}`));
    for (let s = int(0, 3); s > 0; s--) {
      const targets =
        rng() < 0.3 && lineIds.length > 1
          ? [...new Set([pick(lineIds), pick(lineIds)])]
          : [pick(lineIds)];
      emit(anyDevice(), lineStateChanged(orderId, targets, pick(LINE_TARGET_STATES)));
    }
    const paymentEventIds: string[] = [];
    for (let p = int(0, 2); p > 0; p--) {
      const base = paymentRecorded(orderId, int(0, 6) * 100);
      const payId = emit(anyDevice(), {
        type: base.type,
        payload: { ...base.payload, settlement_attempt_id: `sa-${eventIds.length}` },
      });
      paymentEventIds.push(payId);
    }
    for (const payId of paymentEventIds) {
      if (rng() < 0.4) emit(anyDevice(), paymentRefunded(payId, int(0, 3) * 100));
    }
  }
  // Permanent orphans (01-F10): consumed types whose parent never exists in the set.
  if (rng() < 0.4) emit(anyDevice(), orderConfirmed("O-ghost"));
  if (rng() < 0.3) emit(anyDevice(), lineStateChanged(pick(orderIds), ["L-ghost"], "confirmed"));
  // The laws quantify over own-append AND peer-ingest deliveries — never let either be vacuous.
  if (must(queues[0], "own queue").length === 0) emit(0, orderConfirmed(must(orderIds[0], "O0")));
  if (queues.slice(1).every((q) => q.length === 0))
    emit(1, orderConfirmed(must(orderIds[0], "O0")));

  return { identity: own, queues, eventIds };
};

/** One delivery order respecting every device's per-device lamport order (the 01-N1 precondition). */
const interleaveQueues = (
  queues: readonly (readonly Delivery[])[],
  orderSeed: number,
): Delivery[] => {
  const rng = seededRng(orderSeed);
  const cursors = queues.map(() => 0);
  const total = queues.reduce((n, q) => n + q.length, 0);
  const out: Delivery[] = [];
  while (out.length < total) {
    const live: number[] = [];
    queues.forEach((q, i) => {
      if (must(cursors[i], "cursor") < q.length) live.push(i);
    });
    const qi = must(live[Math.floor(rng() * live.length)], "live queue");
    const cursor = must(cursors[qi], "cursor");
    out.push(must(must(queues[qi], "queue")[cursor], "delivery"));
    cursors[qi] = cursor + 1;
  }
  return out;
};

const deliver = (store: FoldStore, seq: readonly Delivery[]): void => {
  for (const d of seq) {
    if (d.via === "append") store.append(d.input);
    else store.ingest(d.envelope);
  }
};

const peerEnvelopesOf = (set: BranchEventSet) =>
  set.queues.flatMap((q) => q.flatMap((d) => (d.via === "ingest" ? [d.envelope] : [])));

const ownInputsOf = (set: BranchEventSet) =>
  must(set.queues[0], "own queue").flatMap((d) => (d.via === "append" ? [d.input] : []));

/** Seeded "any subset, any order": p=0.6 inclusion then Fisher–Yates shuffle. */
const subsetShuffle = <T>(xs: readonly T[], seed: number): T[] => {
  const rng = seededRng(seed);
  const subset = xs.filter(() => rng() < 0.6);
  for (let i = subset.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = must(subset[i], "shuffle a");
    const b = must(subset[j], "shuffle b");
    subset[i] = b;
    subset[j] = a;
  }
  return subset;
};

/**
 * A seeded pick among adjacent pairs from different devices. The generator
 * guarantees >= 2 devices emit, so at least one cross-device adjacency exists
 * in every interleaving.
 */
const crossDeviceAdjacentIndex = (seq: readonly Delivery[], pickSeed: number): number => {
  const rng = seededRng(pickSeed);
  const candidates: number[] = [];
  for (let i = 0; i + 1 < seq.length; i++) {
    if (must(seq[i], "delivery").device_id !== must(seq[i + 1], "delivery").device_id)
      candidates.push(i);
  }
  return must(candidates[Math.floor(rng() * candidates.length)], "cross-device adjacent pair");
};

const seedArb = fc.integer({ min: 0, max: 0x7fffffff });

describe("fold property laws — named seeded generator (20 §2.3)", () => {
  it("01-N1: any two delivery interleavings respecting per-device lamport order fold to identical orders/queue/parked tables — json_lines byte-identical", () => {
    fc.assert(
      fc.property(seedArb, seedArb, seedArb, (setSeed, orderSeedA, orderSeedB) => {
        const set = generateBranchEventSet(setSeed);
        const one = foldStore(set.identity);
        const two = foldStore(set.identity);
        deliver(one, interleaveQueues(set.queues, orderSeedA));
        deliver(two, interleaveQueues(set.queues, orderSeedB));
        expect(tables(two)).toEqual(tables(one));
        expect(snapshot(two)).toBe(snapshot(one));
        one.close();
        two.close();
      }),
      { numRuns: 30 },
    );
  });

  it("01-F34: swapping two adjacent deliveries from different devices yields identical final tables", () => {
    fc.assert(
      fc.property(seedArb, seedArb, seedArb, (setSeed, orderSeed, pickSeed) => {
        const set = generateBranchEventSet(setSeed);
        const base = interleaveQueues(set.queues, orderSeed);
        const i = crossDeviceAdjacentIndex(base, pickSeed);
        const swapped = [...base];
        const a = must(swapped[i], "swap left");
        const b = must(swapped[i + 1], "swap right");
        swapped[i] = b;
        swapped[i + 1] = a;
        const one = foldStore(set.identity);
        const two = foldStore(set.identity);
        deliver(one, base);
        deliver(two, swapped);
        expect(tables(two)).toEqual(tables(one));
        expect(snapshot(two)).toBe(snapshot(one));
        one.close();
        two.close();
      }),
      { numRuns: 30 },
    );
  });

  it("01-F34: re-delivering any already-stored subset in any order changes nothing — tables byte-identical before/after", () => {
    fc.assert(
      fc.property(
        seedArb,
        seedArb,
        seedArb,
        seedArb,
        (setSeed, orderSeed, ingestSeed, appendSeed) => {
          const set = generateBranchEventSet(setSeed);
          const store = foldStore(set.identity);
          deliver(store, interleaveQueues(set.queues, orderSeed));
          const before = snapshot(store);
          // Re-delivery via the ingest seam: every stored envelope (own + peer) dedupes by id.
          const stored: unknown[] = [...store.readOwnEvents(), ...peerEnvelopesOf(set)];
          for (const env of subsetShuffle(stored, ingestSeed)) {
            expect(store.ingest(env)).toEqual({ stored: false });
          }
          // Re-delivery via the append seam: identical-content re-append assigns nothing (18 §4).
          for (const input of subsetShuffle(ownInputsOf(set), appendSeed)) store.append(input);
          expect(snapshot(store)).toBe(before);
          store.close();
        },
      ),
      { numRuns: 30 },
    );
  });

  it("01-F6: after any delivery sequence, refold() reproduces the incrementally-maintained tables exactly — before and after cloud global_seq assignment (01-F34)", () => {
    fc.assert(
      fc.property(seedArb, seedArb, seedArb, (setSeed, orderSeed, ackSeed) => {
        const set = generateBranchEventSet(setSeed);
        const store = foldStore(set.identity);
        deliver(store, interleaveQueues(set.queues, orderSeed));
        const incremental = snapshot(store);
        store.refold();
        expect(snapshot(store)).toBe(incremental);
        // Cloud acks any stored subset in any order (unique global_seq per event, 01-F3).
        for (const [gseq, eventId] of subsetShuffle(set.eventIds, ackSeed).entries()) {
          store.assignGlobalSeq(eventId, gseq);
        }
        const converged = snapshot(store);
        store.refold();
        expect(snapshot(store)).toBe(converged);
        store.close();
      }),
      { numRuns: 30 },
    );
  });
});
