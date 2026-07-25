// Acceptance-test builders — T-01-06 stage 2: spike exit run, sim leg (contract (g)
// scenarios X1–X9). Authored from the kernel-tasks binding contract + PROTOCOL.md +
// HUB-ELECTION.md + FOLDS.md only (24 §3 step 2: read-only to the implementing
// session). These COMPOSE the LANDED mesh (createMeshSession over the sim LAN) with
// the NOT-YET-BUILT createCloudSession (over the landed sim-cloud double) under one
// createSim virtual clock — every device runs BOTH planes over ONE shared store
// (DEC-SYNC-004: per-device cloud sessions; the mesh never touches the cloud
// write-checkpoint). Kept apart from builders.ts/mesh-builders.ts on purpose: this
// module imports the un-landed cloud surface, so its RED (createCloudSession missing)
// must never redden the T-01-03/04/05 suites. Seam types + the sim + the sim-cloud
// come from @restos/{sync-protocol,testing} — consumed, never redeclared.

import type { DeviceClass } from "@restos/domain";
import type { PeerInfo, ProtocolMessage } from "@restos/sync-protocol";
import {
  createSim,
  createSimCloud,
  type Sim,
  type SimCloud,
  type TraceEntry,
} from "@restos/testing";
import { expect } from "vitest";
import type { AppendInput, DeviceStore } from "../index.js";
// createCloudSession is the un-built T-01-06 impl surface — its absence is the RED.
import { createCloudSession, createMeshSession, type MeshSession, openStore } from "../index.js";
import { must, seededRng } from "./builders.js";
import { originLamports } from "./mesh-builders.js";

/** One org/branch for the whole simulated fleet — the branch stream is identity-scoped (01-F9). */
export const ORG = "org-spike";
export const BRANCH = "branch-spike";
/** Fixed base epoch-ms; per-event offsets are deterministic so runs are reproducible (20 §2.4). */
const BASE_TS = 1_752_800_000_000;

export const spikeIdentity = (device_id: string) => ({ org_id: ORG, branch_id: BRANCH, device_id });

export type CloudSession = ReturnType<typeof createCloudSession>;

export type SpikeDevice = {
  info: PeerInfo;
  device_id: string;
  device_class: DeviceClass;
  path: string;
  store: DeviceStore;
  mesh: MeshSession;
  cloud: CloudSession;
};

/**
 * A full spike device: real store + LAN mesh session (sim LAN transport) + cloud
 * session (sim-cloud transport), all over the SAME store and the SAME virtual clock.
 * `path` defaults to :memory:; pass a file path for the kill-seed reopen scenarios (X4).
 */
export const spikeDevice = (
  sim: Sim,
  cloud: SimCloud,
  device_id: string,
  device_class: DeviceClass,
  opts: { path?: string } = {},
): SpikeDevice => {
  const path = opts.path ?? ":memory:";
  const store = openStore({ path, identity: spikeIdentity(device_id) });
  const mesh = createMeshSession({
    store,
    transport: sim.lan.attach({ device_id, device_class }),
    clock: sim.clock,
    device_class,
    token: "spike-lan-token", // LAN auth is a stub at this rung (01-F27)
  });
  const cloudSession = createCloudSession({
    store,
    transport: cloud.transportFor(device_id),
    clock: sim.clock,
    device_class,
    token: "spike-cloud-token",
  });
  return {
    info: { device_id, device_class },
    device_id,
    device_class,
    path,
    store,
    mesh,
    cloud: cloudSession,
  };
};

export const startBoth = (d: SpikeDevice): void => {
  d.mesh.start();
  d.cloud.start();
};

export const stopBoth = (d: SpikeDevice): void => {
  d.mesh.stop();
  d.cloud.stop();
};

export const closeAll = (devices: readonly SpikeDevice[]): void => {
  for (const d of devices) {
    stopBoth(d);
    d.store.close();
  }
};

export const deviceMap = (devices: readonly SpikeDevice[]): Map<string, SpikeDevice> =>
  new Map(devices.map((d) => [d.device_id, d]));

/** Three spike devices (default electron/rn/kitchen), both planes started. */
export const trio = (
  sim: Sim,
  cloud: SimCloud,
  classes: [DeviceClass, DeviceClass, DeviceClass] = ["counter_electron", "counter_rn", "kitchen"],
  paths?: [string, string, string],
): { a: SpikeDevice; b: SpikeDevice; c: SpikeDevice; all: SpikeDevice[] } => {
  const a = spikeDevice(sim, cloud, "dev-a", classes[0], paths ? { path: paths[0] } : {});
  const b = spikeDevice(sim, cloud, "dev-b", classes[1], paths ? { path: paths[1] } : {});
  const c = spikeDevice(sim, cloud, "dev-c", classes[2], paths ? { path: paths[2] } : {});
  const all = [a, b, c];
  for (const d of all) startBoth(d);
  return { a, b, c, all };
};

/** Host-app fast path on BOTH planes (01-F15): drain to the hub AND push to the cloud. */
export const notifyBoth = (d: SpikeDevice): void => {
  d.mesh.notifyAppended();
  d.cloud.notifyAppended();
};

/** Durable append, then propagate on both planes — the host-app confirm path. */
export const appendOn = (d: SpikeDevice, input: SpikeInput) => {
  const envelope = d.store.append(input);
  notifyBoth(d);
  return envelope;
};

// ---------------------------------------------------------------------------
// Deterministic rush script — the local stand-in for contract (d)'s not-yet-landed
// generateRushScript. Interleaved order lifecycles (created → confirmed → line_added
// ×2 → kot.printed → line_state_changed×3 → payment.recorded); registry types only,
// integer paisas; ALL ids deterministic from the seed so a re-run is deep-equal.
// ---------------------------------------------------------------------------

export type SpikeInput = AppendInput;
export type SpikeStep = { at: number; device_id: string; input: SpikeInput };
export type AppendedEvent = { id: string; origin: string; at: number };

const LINE1_PRICE = 25_000;
const LINE1_QTY = 2;
const LINE2_PRICE = 30_000;
const LINE2_QTY = 1;
/** Σ qty×unit_price over the two (never-void) lines — a matching payment settles it. */
export const ORDER_BILLED = LINE1_QTY * LINE1_PRICE + LINE2_QTY * LINE2_PRICE;

const mkInput = (
  device_id: string,
  id: string,
  createdAt: number,
  type: string,
  payload: Record<string, unknown>,
): SpikeInput => ({
  id,
  org_id: ORG,
  branch_id: BRANCH,
  device_id,
  actor_user_id: null,
  device_created_at: createdAt,
  type,
  schema_version: 1,
  payload,
  refs: [],
});

/** One ad-hoc append input with a caller-fixed id + type — for the directed X4/X9 events. */
export const eventInput = (
  device_id: string,
  id: string,
  type: string,
  payload: Record<string, unknown>,
  createdAt = BASE_TS,
): SpikeInput => mkInput(device_id, id, createdAt, type, payload);

/**
 * A seeded rush of `orders` full lifecycles spread across `deviceIds`. Each lifecycle
 * is emitted entirely by one owner device in dependency order; receivers park/drain.
 * `at` is a rush-shaped virtual arrival curve; every id is deterministic.
 */
export const generateSpikeRush = (params: {
  seed: number;
  deviceIds: readonly string[];
  orders: number;
}): SpikeStep[] => {
  const rng = seededRng(params.seed);
  const steps: SpikeStep[] = [];
  let at = 0;
  let counter = 0;
  const push = (owner: string, type: string, payload: Record<string, unknown>): void => {
    at += 1 + Math.floor(rng() * 40); // rush-shaped spacing, deterministic
    const id = `evt-${params.seed}-${counter}`;
    steps.push({
      at,
      device_id: owner,
      input: mkInput(owner, id, BASE_TS + counter, type, payload),
    });
    counter += 1;
  };
  for (let o = 0; o < params.orders; o++) {
    const owner = must(params.deviceIds[Math.floor(rng() * params.deviceIds.length)]);
    const order_id = `order-${params.seed}-${o}`;
    const l1 = `line-${params.seed}-${o}-1`;
    const l2 = `line-${params.seed}-${o}-2`;
    push(owner, "order.created", { order_id, channel: "dine_in" });
    push(owner, "order.confirmed", { order_id });
    push(owner, "order.line_added", {
      order_id,
      line_id: l1,
      item_id: "item-karahi",
      qty: LINE1_QTY,
      unit_price_paisa: LINE1_PRICE,
    });
    push(owner, "order.line_added", {
      order_id,
      line_id: l2,
      item_id: "item-naan",
      qty: LINE2_QTY,
      unit_price_paisa: LINE2_PRICE,
    });
    push(owner, "kot.printed", { order_id });
    // T-01-15 M (oracle enumeration, cross-cutting): amended payloads — per-line
    // line_context edges (01-F34/01-F35) and the payment purpose discriminator
    // (01-F30/01-F32).
    const walk = (state: string, from: string) => {
      push(owner, "order.line_state_changed", {
        order_id,
        line_ids: [l1, l2],
        state,
        line_context: {
          [l1]: { to: state, from_states: [from], preds: [] },
          [l2]: { to: state, from_states: [from], preds: [] },
        },
      });
    };
    walk("confirmed", "placed");
    walk("in_prep", "confirmed");
    walk("ready", "in_prep");
    push(owner, "payment.recorded", {
      order_id,
      amount_paisa: ORDER_BILLED,
      method: "cash",
      purpose: "settles_order",
      settlement_attempt_id: `pay-${params.seed}-${o}`,
    });
  }
  return steps;
};

/** N own `order.created` inputs for one device — the X8 >500 backlog (deterministic ids). */
export const generateOwnCreates = (params: {
  seed: number;
  device_id: string;
  count: number;
}): SpikeInput[] =>
  Array.from({ length: params.count }, (_unused, i) =>
    mkInput(params.device_id, `bulk-${params.seed}-${i}`, BASE_TS + i, "order.created", {
      order_id: `bulk-order-${params.seed}-${i}`,
      channel: "delivery",
    }),
  );

/**
 * Drive a rush script: advance virtual time to each step's `at`, append on the owner,
 * fast-path both planes. Returns every appended event with its origin + append time.
 */
export const driveRush = (
  sim: Sim,
  devicesById: ReadonlyMap<string, SpikeDevice>,
  steps: readonly SpikeStep[],
): AppendedEvent[] => {
  const appended: AppendedEvent[] = [];
  let elapsed = 0;
  for (const step of steps) {
    if (step.at > elapsed) {
      sim.runFor(step.at - elapsed);
      elapsed = step.at;
    }
    const device = must(devicesById.get(step.device_id));
    const envelope = appendOn(device, step.input);
    appended.push({ id: envelope.id, origin: step.device_id, at: sim.now() });
  }
  return appended;
};

// ---------------------------------------------------------------------------
// Digests + measurement.
// ---------------------------------------------------------------------------

/** Byte-stable fold-state digest (orders/queue/parked come pre-sorted from the store). */
export const foldDigest = (store: DeviceStore): string =>
  JSON.stringify({
    orders: store.openOrders(),
    queue: store.kitchenQueue(),
    parked: store.parked(),
  });

export const idSet = (store: DeviceStore): Set<string> =>
  new Set(store.readAllEvents().map((e) => e.id));

/**
 * The 20 §4.2 reference: a fresh store (distinct device id) ingesting the cloud's
 * merged stream IN global_seq ORDER, each with its seq — the "device state ≡
 * cloud-order replay" oracle. Only valid where every appended event merged (no
 * quarantine/never-synced tail): X1–X4, X7-post-heal, not X9.
 */
export const cloudReplayDigest = (cloud: SimCloud): string => {
  const ref = openStore({ path: ":memory:", identity: spikeIdentity("spike-ref-device") });
  for (const m of cloud.mergedStream()) {
    const { global_seq, ...envelope } = m;
    ref.ingest(envelope, { global_seq });
  }
  const digest = foldDigest(ref);
  ref.close();
  return digest;
};

/** Event ids carried by a push or event_batch; [] for every other kind. */
export const batchEventIds = (message: ProtocolMessage): string[] =>
  message.kind === "push" || message.kind === "event_batch" ? message.events.map((e) => e.id) : [];

/**
 * Per-event propagation over the LAN bus trace (delivery entries only — the sim-cloud
 * uses bare timers, so this is LAN-plane time): for each event, the latest first-hold
 * across every non-origin device minus its append time. Events not yet delivered
 * everywhere within the trace are skipped (reported via `measured`).
 */
export const propagationTimes = (
  trace: readonly TraceEntry[],
  appended: readonly AppendedEvent[],
  deviceIds: readonly string[],
): number[] => {
  const out: number[] = [];
  for (const ev of appended) {
    const others = deviceIds.filter((d) => d !== ev.origin);
    let last = ev.at;
    let reachedAll = true;
    for (const d of others) {
      let first = Number.POSITIVE_INFINITY;
      for (const entry of trace) {
        if (entry.kind !== "delivery" || entry.to !== d) continue;
        if (batchEventIds(entry.message).includes(ev.id)) {
          first = entry.at; // trace is (time, seq)-ordered — first match is earliest
          break;
        }
      }
      if (first === Number.POSITIVE_INFINITY) {
        reachedAll = false;
        break;
      }
      if (first > last) last = first;
    }
    if (reachedAll) out.push(last - ev.at);
  }
  return out;
};

/** Nearest-rank p95 (0 for an empty sample). */
export const p95 = (xs: readonly number[]): number => {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);
  return must(sorted[idx]);
};

// ---------------------------------------------------------------------------
// Oracle assertions (shared across the X-scenarios; each pins the contract laws).
// ---------------------------------------------------------------------------

const rangeArray = (n: number): number[] => Array.from({ length: n }, (_unused, i) => i);

/**
 * The full X1 convergence oracle over a fully-merged run (every appended event has a
 * global_seq): id-set equality + exactly-once, gap-free per-origin lamport at every
 * receiver, dense global_seq for every event, outbox drained to own_high_water, fold
 * tables byte-identical across devices ≡ a fresh store replaying the merged stream
 * (01-N1 / 01-F34 / 01-F6 / 01-F8 / 19 §5). T-01-15 enumeration entry 29 (R):
 * digest equality + merged-stream replay survive; the refold legs are dropped
 * (the banned oracle is not ported — the projection is order-free by law).
 */
export const assertConverged = (
  devices: readonly SpikeDevice[],
  cloud: SimCloud,
  appended: readonly AppendedEvent[],
): void => {
  const union = new Set(appended.map((a) => a.id));
  const origins = [...new Set(appended.map((a) => a.origin))];
  const perOrigin = new Map(origins.map((o) => [o, appended.filter((a) => a.origin === o).length]));

  // Cloud merged every appended event exactly once, global_seq dense from 1.
  expect(cloud.mergedStream()).toHaveLength(appended.length);
  expect(cloud.state().last_global_seq).toBe(appended.length);
  cloud.mergedStream().forEach((m, i) => {
    expect(m.global_seq).toBe(i + 1);
  });

  const replay = cloudReplayDigest(cloud);
  let sharedDigest: string | null = null;
  for (const device of devices) {
    const events = device.store.readAllEvents();
    const ids = events.map((e) => e.id);
    expect(new Set(ids)).toEqual(union); // set-union merge (01-F38)
    expect(ids.length).toBe(union.size); // exactly once per id (01-F8)
    for (const [origin, count] of perOrigin) {
      // readAllEvents sorts by (device, lamport): equality with [0..count-1] is
      // gap-free + no-dup + monotonic per origin in one assertion.
      expect(originLamports(events, origin)).toEqual(rangeArray(count));
    }
    // The cloud ack IS the outbox write-checkpoint — a fully drained outbox (19 §5).
    expect(device.store.status().acked_watermark).toBe(device.store.status().own_high_water);
    expect(device.store.status().queue_depth).toBe(0);
    // Every device learned cloud order (01-F34) — its session cursor tracks the log.
    expect(device.cloud.status().last_global_seq).toBe(cloud.state().last_global_seq);

    const digest = foldDigest(device.store);
    if (sharedDigest === null) sharedDigest = digest;
    else expect(digest).toBe(sharedDigest); // fold tables byte-identical across devices
    expect(digest).toBe(replay); // ≡ merged-stream replay into a fresh store (01-N1)
  }
};

export { createSim, createSimCloud };
