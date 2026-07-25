// T-01-17 oracle builders — the time layer (DEC-TIME-001, accepted).
// Authored from specs/01-kernel-sync.md (01-F43, 01-F44, 01-F45, 01-F46, 01-N2
// amended; 01-F3 envelope, 01-F13 hub election, 01-F17 never block a sale, 01-F34
// merge law), specs/DECISIONS.md (DEC-TIME-001 row) and specs/25-fold-performance.md
// §14 ONLY — never from an implementation (24 §3 step 2: read-only to the
// implementing session).
//
// ── ORACLE-PINNED SURFACE (binding for the implementing session) ────────────
// The store is the append path and the object both sessions share (the DEC-SYNC-009
// relay-seam precedent), so the branch-time offset lives on it:
//
//   store.setBranchTimeOffset(offset_ms: number): void
//     The single write path for 01-F43's `branch_time_offset`. Calling it IS hub
//     contact: it records a signed integer millisecond offset, moves the stamping
//     basis to "branch", and sets the 01-N2 skew observation to |offset_ms|. The
//     hub — the branch time authority (01-F13) — sets its own offset to 0.
//
//   store.branchTimeStatus(): BranchTimeStatus
//     The observational surface (01-N2 "device health flag … observational only";
//     doc 15 consumes it). Before any hub contact: offset 0, basis
//     "branch_provisional" (01-F44), skew_ms null, skew_flagged false.
//
//   append() stamps the envelope (01-F43): branch_created_at = device_created_at +
//     offset_ms, time_basis = the current basis. `device_created_at` is passed by
//     the host app and is stored RAW — 01-F45 demotes it to a forensic hint, and
//     01-N2 measures skew against it.
//
//   SKEW_FLAG_THRESHOLD_MS = 5 * 60_000 (01-N2: "skew > 5 min … raises a device
//     health flag … but never blocks operation").
//
// Deliberately UNPINNED: the wire mechanism by which a follower measures the hub's
// clock (01-F43 requires an offset "against hub time, refreshed on hub contact" and
// names no protocol), and whether the offset survives a store reopen. Both are
// implementer choices; the mesh suite asserts only the measured OUTCOME, with a
// tolerance that any sane sampling meets on a 5 ms LAN.
import type { Clock, MeshTransport, PeerInfo, TimerId } from "@restos/sync-protocol";
import type { Sim } from "@restos/testing";
import { createMeshSession, type MeshSession, openStore } from "../index.js";
import { appendInput, canonicalJson, type Identity, must, peerEnvelope } from "./builders.js";
import {
  confirmed,
  created,
  edge,
  lineAdded,
  type MergeInvariantProjection,
  type MergeLineCell,
  type MergeStore,
  payment,
  refund,
  settlementClosed,
  tableAssigned,
} from "./merge-builders.js";
import { LOSSLESS, meshIdentity, peer as peerInfo } from "./mesh-builders.js";

/** 01-N2: skew above five minutes raises the health flag. Observational only. */
export const SKEW_FLAG_THRESHOLD_MS = 5 * 60_000;

export type TimeBasis = "branch" | "branch_provisional";

/** The 01-N2 / 01-F43 observational surface (oracle-pinned, see the header). */
export type BranchTimeStatus = {
  /** Signed integer ms against hub time (01-F43); 0 before any contact. */
  offset_ms: number;
  /** What this device stamps right now (01-F44). */
  basis: TimeBasis;
  /** |offset| at the last measurement — null when the clock was never measured. */
  skew_ms: number | null;
  /** 01-N2: skew_ms > SKEW_FLAG_THRESHOLD_MS. Never blocks anything. */
  skew_flagged: boolean;
};

/** MergeStore + the T-01-17 additions, typed standalone so this oracle compiles
 * against the CONTRACT — a missing member fails the red run loudly at runtime. */
export type TimeStore = MergeStore & {
  append(input: Record<string, unknown>): Record<string, unknown> & { id: string };
  setBranchTimeOffset(offset_ms: number): void;
  branchTimeStatus(): BranchTimeStatus;
  refold(): void;
  status(): Record<string, unknown>;
};

export const timeStore = (id: Identity, path = ":memory:"): TimeStore =>
  openStore({ path, identity: id }) as unknown as TimeStore;

export const setBranchTimeOffset = (store: TimeStore, offset_ms: number): void => {
  if (typeof store.setBranchTimeOffset !== "function")
    throw new Error(
      "store.setBranchTimeOffset() is not implemented yet (T-01-17 red-awaiting-implementation, 01-F43)",
    );
  store.setBranchTimeOffset(offset_ms);
};

export const branchTimeStatus = (store: TimeStore): BranchTimeStatus => {
  if (typeof store.branchTimeStatus !== "function")
    throw new Error(
      "store.branchTimeStatus() is not implemented yet (T-01-17 red-awaiting-implementation, 01-F43/01-N2)",
    );
  return store.branchTimeStatus();
};

/** The stamped time layer of a stored envelope (01-F43/01-F44/01-F45). */
export type StampedTime = {
  device_created_at: number;
  branch_created_at: number;
  time_basis: string;
};

export const stampsOf = (envelope: Record<string, unknown>): StampedTime => ({
  device_created_at: envelope.device_created_at as number,
  branch_created_at: envelope.branch_created_at as number,
  time_basis: envelope.time_basis as string,
});

// ---------------------------------------------------------------------------
// Envelope construction with an explicitly DIVERGENT clock and branch stamp — the
// only shape that can tell a fold reading branch time from one reading the clock.
// ---------------------------------------------------------------------------

export type BranchStamp = {
  /** Branch-consensus time (01-F43) — what every duration and fold must read. */
  branch_at: number;
  /** The originating device's own raw clock (01-F45) — untrusted, forensic only. */
  device_at: number;
  basis?: TimeBasis;
};

export const branchEnvelope = (
  peer: Identity,
  lamport_seq: number,
  stamp: BranchStamp,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> & { id: string } =>
  peerEnvelope(peer, lamport_seq, {
    device_created_at: stamp.device_at,
    branch_created_at: stamp.branch_at,
    time_basis: stamp.basis ?? "branch",
    ...overrides,
  }) as Record<string, unknown> & { id: string };

/** The branch's TRUE shared instant at scenario start (a Friday rush). */
export const TRUE_T0 = 1752800000000;

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Per-device clock error, in the founder's threat model: every device arbitrarily
 * wrong, in either direction, by different amounts (DEC-PERF-001 rationale, 01-N2).
 * Index 0 is the branch's own store's device.
 */
export const DEVICE_SKEWS = [4 * YEAR_MS, -3 * YEAR_MS, 7 * 30 * 24 * 3600 * 1000, 1234] as const;

export type TimeSet = {
  identity: Identity;
  envelopes: Array<Record<string, unknown> & { id: string }>;
  /** branch_created_at of the ONE confirm delivered for `singleConfirmOrder`. */
  singleConfirmBranchAt: number;
  singleConfirmDeviceAt: number;
  singleConfirmOrder: string;
  /** Every branch stamp in the set — the closed set a projected time may come from. */
  branchStamps: number[];
  /** Every raw device stamp — no projected time may EVER equal one of these. */
  deviceStamps: number[];
};

/**
 * A directed multi-device set: two orders, one with a single confirm (so the
 * anchor's VALUE is pinned) and one with two competing confirms; line edges into a
 * contested terminal pair; a supersession chain plus a concurrent assignment head;
 * agreed and disputed attempt keys; a refund; a settlement close; a permanent
 * orphan. Every event's device clock is years away from its branch stamp, and the
 * two orderings are deliberately INVERTED (device stamps descend as branch stamps
 * ascend) so no accident can make a clock-reading fold look right.
 */
export const timeScenario = (): TimeSet => {
  const identity: Identity = { org_id: "org-time", branch_id: "br-time", device_id: "d0-own" };
  const peers: Identity[] = [1, 2, 3].map((i) => ({ ...identity, device_id: `d${i}-peer` }));
  const lamports = [0, 0, 0];
  const envelopes: Array<Record<string, unknown> & { id: string }> = [];
  const branchStamps: number[] = [];
  const deviceStamps: number[] = [];

  const emit = (peerIdx: number, typed: Record<string, unknown>, offsetMs: number): string => {
    const p = must(peers[peerIdx], "peer");
    const lamport = must(lamports[peerIdx], "lamport");
    lamports[peerIdx] = lamport + 1;
    const id = `t-${String(envelopes.length).padStart(2, "0")}`;
    const branch_at = TRUE_T0 + offsetMs;
    // Inverted: later branch time ⇒ EARLIER device stamp, plus a per-device era.
    const device_at = branch_at + must(DEVICE_SKEWS[peerIdx], "skew") - offsetMs * 2;
    branchStamps.push(branch_at);
    deviceStamps.push(device_at);
    envelopes.push(branchEnvelope(p, lamport, { branch_at, device_at }, { id, ...typed }));
    return id;
  };

  // O1 — the pinned single-confirm order.
  const createdO1 = emit(0, created("O1", { table_id: "T1" }), 0);
  emit(0, lineAdded("O1", "L1"), 100);
  emit(1, lineAdded("O1", "L2", { qty: 2, unit_price_paisa: 700 }), 150);
  const c1 = emit(0, edge("O1", "L1", "confirmed", ["placed"]), 200);
  const c2 = emit(0, edge("O1", "L1", "in_prep", ["confirmed"], [c1]), 250);
  const c3 = emit(0, edge("O1", "L1", "ready", ["in_prep"], [c2]), 300);
  emit(1, edge("O1", "L1", "served", ["ready"], [c3]), 350); // contested terminal pair …
  emit(2, edge("O1", "L1", "voided", ["ready"], [c3]), 350); // … two heads
  const a1 = emit(1, tableAssigned("O1", "T4", { from: "T1", supersedes: [createdO1] }), 450);
  emit(1, tableAssigned("O1", "T7", { from: "T4", supersedes: [a1] }), 500);
  emit(2, tableAssigned("O1", "T9", { from: "T1", supersedes: [createdO1] }), 500);
  const singleConfirmIndex = envelopes.length;
  emit(0, confirmed("O1"), 550); // the ONE confirm for O1
  emit(0, payment("O1", 185000, { attempt: "sa-K" }), 600);
  emit(1, payment("O1", 500, { attempt: "sa-D" }), 620); // disputed …
  emit(2, payment("O1", 185000, { attempt: "sa-D" }), 630); // … divergent member
  emit(0, refund("O1", 20000, { attempt: "sa-ref", parent: "sa-K" }), 650);
  emit(1, settlementClosed("O1", { settlement_attempt_ids: ["sa-K"] }), 700);

  // O2 — two competing confirms from two devices (anchor SELECTION is clock-free).
  emit(1, created("O2", { channel: "takeaway" }), 800);
  emit(1, lineAdded("O2", "M1"), 850);
  emit(1, confirmed("O2"), 900);
  emit(2, confirmed("O2"), 1200);

  emit(2, confirmed("O-ghost"), 1500); // permanent orphan — parked membership

  const single = must(envelopes[singleConfirmIndex], "single confirm");
  return {
    identity,
    envelopes,
    singleConfirmOrder: "O1",
    singleConfirmBranchAt: single.branch_created_at as number,
    singleConfirmDeviceAt: single.device_created_at as number,
    branchStamps,
    deviceStamps,
  };
};

/**
 * Clock injection for 01-F45: every `device_created_at` replaced by an unrelated,
 * per-device, wildly wrong value — the branch stamps and everything else untouched.
 * A fold that derives ANY projected value from the device clock diverges here; a
 * fold that reads only `branch_created_at` cannot notice.
 */
export const injectGarbageDeviceClocks = <T extends Record<string, unknown>>(
  envelopes: readonly T[],
): T[] =>
  envelopes.map((env, i) => ({
    ...env,
    device_created_at:
      TRUE_T0 +
      (i % 2 === 0 ? -1 : 1) * (i + 1) * 9_999_991 +
      must(DEVICE_SKEWS[i % DEVICE_SKEWS.length], "skew"),
  }));

// ---------------------------------------------------------------------------
// Projection φ-mapping over the FULL projection (time columns INCLUDED). The
// T-01-15 oracle had to exclude confirmed_at/confirm_at/age_basis because their
// value stamping still read the device clock; 01-F45 removes that exception, so
// the T-01-17 suites compare the whole thing.
// ---------------------------------------------------------------------------

export type FullProjection = {
  orders: ReturnType<MergeStore["openOrders"]>;
  queue: ReturnType<MergeStore["kitchenQueue"]>;
  parked_event_ids: string[];
};

export const fullProjection = (store: MergeStore): FullProjection => ({
  orders: store.openOrders(),
  queue: store.kitchenQueue(),
  parked_event_ids: store
    .parked()
    .map((r) => r.event_id)
    .sort(),
});

export const fullProjectionBytes = (store: MergeStore): string =>
  canonicalJson(fullProjection(store));

/** φ on the projection side — the id REFERENCES a projection legitimately retains
 * (json_lines anomaly keys, parked membership), with every time column kept. */
export const mapFullProjectionIds = (
  proj: FullProjection,
  map: ReadonlyMap<string, string>,
): FullProjection => {
  const m = (v: string) => map.get(v) ?? v;
  return {
    orders: proj.orders.map((row) => {
      const cells = JSON.parse(row.json_lines) as Record<string, MergeLineCell>;
      const mapped: Record<string, MergeLineCell> = {};
      for (const [lineId, cell] of Object.entries(cells)) {
        const anomalies: Record<string, string> = {};
        for (const [eventId, code] of Object.entries(cell.anomalies)) anomalies[m(eventId)] = code;
        mapped[lineId] = { ...cell, anomalies };
      }
      return { ...row, json_lines: canonicalJson(mapped) };
    }),
    queue: proj.queue,
    parked_event_ids: proj.parked_event_ids.map(m).sort(),
  };
};

/** Type bridge for suites that also drive the T-01-15 invariant view. */
export const asInvariant = (proj: FullProjection): MergeInvariantProjection => ({
  orders: proj.orders.map(({ confirmed_at: _t, ...rest }) => rest),
  queue: proj.queue.map(({ confirm_at: _c, age_basis: _a, ...rest }) => rest),
  parked_event_ids: proj.parked_event_ids,
});

// ---------------------------------------------------------------------------
// Mesh harness: real stores + real sessions on the deterministic sim, each device
// running a WRONG wall clock. The sim's virtual time is the branch's TRUE time; a
// device's own clock is `sim.now() + skew_ms`, which is what its host app stamps
// into device_created_at and what its mesh session reads through the Clock seam.
// ---------------------------------------------------------------------------

export const skewedClock = (inner: Clock, skew_ms: number): Clock => ({
  now: () => inner.now() + skew_ms,
  setTimeout: (fn: () => void, ms: number): TimerId => inner.setTimeout(fn, ms),
  clearTimeout: (id: TimerId): void => {
    inner.clearTimeout(id);
  },
});

export type TimeMeshDevice = {
  info: PeerInfo;
  store: TimeStore;
  session: MeshSession;
  skew_ms: number;
  /** This device's own (wrong) wall clock at the sim's current TRUE instant. */
  deviceNow(): number;
  /** Branch time as this device computes it (01-F43): device clock + offset. */
  branchNow(): number;
};

export const timeMeshDevice = (
  sim: Sim,
  device_id: string,
  skew_ms: number,
  device_class: PeerInfo["device_class"] = "counter_electron",
): TimeMeshDevice => {
  const info = peerInfo(device_id, device_class);
  const store = timeStore(meshIdentity(device_id));
  const transport: MeshTransport = sim.lan.attach(info);
  const session = createMeshSession({
    store: store as unknown as Parameters<typeof createMeshSession>[0]["store"],
    transport,
    clock: skewedClock(sim.clock, skew_ms),
    device_class,
    token: "lan-token-stub",
  });
  const deviceNow = () => sim.now() + skew_ms;
  return {
    info,
    store,
    session,
    skew_ms,
    deviceNow,
    branchNow: () => deviceNow() + branchTimeStatus(store).offset_ms,
  };
};

/** Append through the host-app fast path with THIS device's own wrong clock. */
export const appendAt = (
  device: TimeMeshDevice,
  typed: Record<string, unknown>,
): Record<string, unknown> & { id: string } => {
  const envelope = device.store.append(
    appendInput(meshIdentity(device.info.device_id), {
      device_created_at: device.deviceNow(),
      ...typed,
    }),
  );
  device.session.notifyAppended();
  return envelope;
};

export const closeMesh = (devices: readonly TimeMeshDevice[]): void => {
  for (const d of devices) {
    d.session.stop();
    d.store.close();
  }
};

export { LOSSLESS, meshIdentity };
