// Oracle builders — `02-F11` multi-terminal coherence over the LAN mesh (R36).
//
// Authored from specs/01-kernel-sync.md (01-F12, 01-F13, 01-F14, 01-F15, 01-F16, 01-F34,
// 01-F38, 01-F43, 01-F45, 01-F8, 01-F17), specs/02-pos-app.md (02-F11),
// specs/26-merge-semantics.md and plans/saas-pivot/plan-of-record.md (R36) ONLY — never
// from an implementation (24 §3 step 2: read-only to the implementing session).
//
// ── WHY THIS HARNESS EXISTS AT ALL ──────────────────────────────────────────
// The two halves of this claim are each covered and NOTHING covers the join.
//
//   `mesh-scenarios.test.ts` says so in its own header, verbatim: "Convergence is ledger
//   set-equality + per-origin order, NEVER FOLD IDENTITY (assumption 9; folds are
//   T-01-04/T-01-06)."  It proves the mesh moves envelopes.
//
//   `merge-invariance.test.ts` / `time-invariance.test.ts` prove fold identity by ingesting
//   a set DIRECTLY — one store, one process, one clock. They never cross a mesh, so the
//   delivery order they shuffle is a hand-written array, not one a hub produced.
//
// So no assertion in this repo says: *two tills on one branch, having received the same
// events in DIFFERENT orders over a real mesh, display the same thing.* That is `02-F11`,
// it is the sentence R36 says stops being unexercised, and a `grep -a` for `02-F11` across
// every `*.test.ts` returns fold-level and identity-level suites and not one mesh suite.
// It is also the `catalog-fetch.ts` shape one layer up: both halves green, the join lossy.
//
// ── THE ANTI-VACUITY RULE THIS FILE IS BUILT AROUND ─────────────────────────
// A cross-device equality assertion is FREE if every device happened to receive the same
// events in the same order. That is failure pattern 1 — a fixture that answers its own
// question — and it is the whole reason `observed` exists below. Every test asserting
// cross-device projection identity MUST also assert that the delivery orders genuinely
// diverged, or it is proving nothing about order-independence.
//
// ⚠ AND CROSS-DEVICE EQUALITY ALONE CANNOT SEE A MIN-ID TIEBREAK — every device computes
// the same `min(envelope.id)`, so a fold smuggling wall clock through the UUIDv7 prefix
// (`01-F34`'s named counterexample) passes it on every device. Only the RELABEL run kills
// that, which is why `phi()` and `reversingIds` are here and why the two claims are
// separate tests with separate mutants.

import type { Clock, MeshTransport, PeerInfo, ProtocolMessage } from "@restos/sync-protocol";
import type { Sim } from "@restos/testing";
import { createMeshSession, type MeshSession, openStore } from "../index.js";
import { appendInput, canonicalJson, must } from "./builders.js";
import {
  confirmed,
  created,
  edge,
  lineAdded,
  type MergeStore,
  payment,
  refund,
  settlementClosed,
  tableAssigned,
} from "./merge-builders.js";
import { batchEventIds, meshIdentity } from "./mesh-builders.js";
import {
  type FullProjection,
  fullProjection,
  skewedClock,
  type TimeStore,
} from "./time-builders.js";

export { LOSSLESS } from "./mesh-builders.js";
export { canonicalJson };

/** The branch's TRUE shared instant — a Friday rush. Sim virtual time is branch truth. */
export const TRUE_T0 = 1752800000000;

// ---------------------------------------------------------------------------
// A coherence device: real store + real mesh session + a WRONG wall clock + an
// observation log. `timeMeshDevice` gives the first three and taps nothing;
// `meshDevice` taps the wire and runs no skew. This needs both at once.
// ---------------------------------------------------------------------------

export type CoherenceDevice = {
  info: PeerInfo;
  store: TimeStore;
  session: MeshSession;
  skew_ms: number;
  /**
   * Event ids in the order this device FIRST became aware of them — an own append counts
   * at append time, a peer's event at first receipt over the wire.
   *
   * Deliberately reconstructed from the transport rather than read back out of the ledger:
   * `readAllEvents()`'s row order is a storage detail this oracle must not pin (`24 §3`),
   * and the claim under test is about the order events ARRIVED, which is the mesh's doing.
   */
  observed: string[];
};

/** Wraps a transport so every event id crossing it is noted at first sight. */
const observingTransport = (
  inner: MeshTransport,
  note: (ids: readonly string[]) => void,
): MeshTransport => ({
  start(handlers) {
    inner.start({
      onPeerVisible: (p) => handlers.onPeerVisible(p),
      onPeerLost: (id) => handlers.onPeerLost(id),
      onMessage: (from, message: ProtocolMessage) => {
        note(batchEventIds(message));
        handlers.onMessage(from, message);
      },
    });
  },
  stop() {
    inner.stop();
  },
  send(to, message) {
    inner.send(to, message);
  },
});

export const coherenceDevice = (
  sim: Sim,
  device_id: string,
  skew_ms: number,
  device_class: PeerInfo["device_class"] = "counter_electron",
): CoherenceDevice => {
  const info: PeerInfo = { device_id, device_class };
  const store = openStore({
    path: ":memory:",
    identity: meshIdentity(device_id),
  }) as unknown as TimeStore;
  const observed: string[] = [];
  const seen = new Set<string>();
  const note = (ids: readonly string[]): void => {
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      observed.push(id);
    }
  };
  const transport = observingTransport(sim.lan.attach(info), note);
  const session = createMeshSession({
    store: store as unknown as Parameters<typeof createMeshSession>[0]["store"],
    transport,
    // The device's own clock is wrong by `skew_ms` — its host app stamps this into
    // `device_created_at` and its mesh session reads it through the Clock seam (01-F45).
    clock: skewedClock(sim.clock, skew_ms) as Clock,
    device_class,
    token: "lan-token-stub", // admission is 01-F72's, over real sockets, in lan-admission.test.ts
  });
  return { info, store, session, skew_ms, observed };
};

/**
 * Ring something on this terminal: durable append with THIS device's own wrong clock,
 * then the `01-F15` fast-path notify. Returns the stored envelope.
 */
export const ringOn = (
  device: CoherenceDevice,
  typed: Record<string, unknown>,
): Record<string, unknown> & { id: string } => {
  const envelope = device.store.append(
    appendInput(meshIdentity(device.info.device_id), typed),
  ) as Record<string, unknown> & { id: string };
  // An own append is an observation: this terminal knew it before anyone sent it.
  device.observed.push(envelope.id);
  device.session.notifyAppended();
  return envelope;
};

export const closeAllDevices = (devices: readonly CoherenceDevice[]): void => {
  for (const d of devices) {
    d.session.stop();
    d.store.close();
  }
};

export const ledgerIdSet = (device: CoherenceDevice): Set<string> =>
  new Set((device.store as unknown as MergeStore).readAllEvents().map((e) => e.id));

export const projectionOf = (device: CoherenceDevice): FullProjection =>
  fullProjection(device.store as unknown as MergeStore);

export const projectionBytesOf = (device: CoherenceDevice): string =>
  canonicalJson(projectionOf(device));

/** The open-order row for `order_id`, or undefined — the surface a cashier reads. */
export const orderRow = (device: CoherenceDevice, order_id: string) =>
  projectionOf(device).orders.find((r) => r.order_id === order_id);

/** Line cells of an open-order row (`json_lines`), keyed by line_id. */
export const lineCells = (
  device: CoherenceDevice,
  order_id: string,
): Record<string, Record<string, unknown>> => {
  const row = orderRow(device, order_id);
  if (row === undefined) return {};
  return JSON.parse(row.json_lines) as Record<string, Record<string, unknown>>;
};

// ---------------------------------------------------------------------------
// Delivery-order divergence — the anti-vacuity instrument.
// ---------------------------------------------------------------------------

/**
 * True iff at least two devices became aware of the SAME event set in different orders.
 *
 * This is the assertion that stops every cross-device equality claim in this suite from
 * passing for free. If a change to the sim, the topology or the fan-out ever makes every
 * device observe one identical sequence, the coherence assertions stop testing
 * order-independence and start testing nothing — and this goes red and says so.
 */
export const deliveryOrdersDiverged = (devices: readonly CoherenceDevice[]): boolean =>
  new Set(devices.map((d) => d.observed.join(","))).size > 1;

/** Per-device observation sequences, for a failure message that names the topology. */
export const observedOrders = (devices: readonly CoherenceDevice[]): Record<string, string[]> =>
  Object.fromEntries(devices.map((d) => [d.info.device_id, [...d.observed]]));

// ---------------------------------------------------------------------------
// The scenario, parameterised by its id-naming function so the SAME logical set can be
// re-run under a bijective relabel (`01-F34`).
// ---------------------------------------------------------------------------

/** Names the nth appended event. Run 1 is forward; run 2 REVERSES lexicographic order. */
export type IdNamer = (index: number) => string;

const name = (n: number): string => `m-${String(n).padStart(3, "0")}`;

export const forwardIds = (): IdNamer => (i) => name(i);

/**
 * An ORDER-REVERSING bijection: the nth event of run 2 gets the name the (N−1−n)th event
 * of run 1 got. Every lexicographic id comparison therefore inverts, which is exactly what
 * `01-F34` demands and what plain convergence testing cannot see — "a min-id tiebreak
 * passes it while smuggling wall clock through the UUIDv7 prefix".
 */
export const reversingIds =
  (total: number): IdNamer =>
  (i) =>
    name(total - 1 - i);

/** φ: run-1 id ↦ run-2 id, for mapping a projection through the relabel. */
export const phi = (total: number): Map<string, string> => {
  const map = new Map<string, string>();
  const fwd = forwardIds();
  const rev = reversingIds(total);
  for (let i = 0; i < total; i++) map.set(fwd(i), rev(i));
  return map;
};

/**
 * The multi-terminal service scenario, scripted as (terminal index, payload) steps so a
 * test can drive it over any topology and any id naming.
 *
 * It deliberately contains the shapes where an order-dependent or id-comparing fold hides:
 *  - concurrent line-adds from two terminals onto one order (`01-F16`, `02-F11`)
 *  - a CONTESTED terminal pair on one line (two heads from one predecessor) — the place a
 *    tiebreak gets smuggled in, and the reason the relabel run exists
 *  - a supersession chain PLUS a concurrent assignment head (`table_assigned`)
 *  - agreed and divergent settlement attempt keys, a refund, and a settlement close —
 *    `02-F11`'s "settled on another [terminal]"
 */
export type Step = { terminal: number; typed: Record<string, unknown> };

export const SERVICE_ORDER = "O-rush";

export const serviceScript = (): Step[] => [
  // A starts the order (02-F11 "started on one terminal").
  { terminal: 0, typed: created(SERVICE_ORDER, { table_id: "T1" }) },
  // Concurrent line-adds from two terminals (01-F16).
  { terminal: 0, typed: lineAdded(SERVICE_ORDER, "L1") },
  { terminal: 1, typed: lineAdded(SERVICE_ORDER, "L2", { qty: 2, unit_price_paisa: 70000 }) },
  // A line walked into a CONTESTED terminal pair from one predecessor.
  { terminal: 0, typed: edge(SERVICE_ORDER, "L1", "confirmed", ["placed"]) },
  { terminal: 2, typed: edge(SERVICE_ORDER, "L1", "in_prep", ["confirmed"]) },
  { terminal: 1, typed: edge(SERVICE_ORDER, "L1", "ready", ["in_prep"]) },
  { terminal: 1, typed: edge(SERVICE_ORDER, "L1", "served", ["ready"]) },
  { terminal: 2, typed: edge(SERVICE_ORDER, "L1", "voided", ["ready"]) },
  // The order moves tables on one terminal while another moves it elsewhere.
  { terminal: 1, typed: tableAssigned(SERVICE_ORDER, "T4", { from: "T1" }) },
  { terminal: 2, typed: tableAssigned(SERVICE_ORDER, "T9", { from: "T1" }) },
  { terminal: 0, typed: confirmed(SERVICE_ORDER) },
  // Money, closed on a terminal that neither started nor extended the order.
  //
  // ⚠ THE SECOND CONFIRM BELOW IS LOAD-BEARING AND WAS ADDED BECAUSE A MUTANT SURVIVED.
  // With one `order.confirmed` in the set the confirm anchor has a single candidate, so
  // EVERY tiebreak — including one that ignores the branch stamp and compares envelope ids
  // — picks the same member and projects the same value. Measured: the min-id mutant
  // (`id < anchor.id` with the stamp comparison deleted) passed all six tests. That is the
  // guard-aimed-one-case-away failure, reproduced inside the suite written to catch it.
  //
  // Two confirms at DIFFERENT branch instants is the case that bites, and it bites only
  // under the relabel: forward naming makes id order agree with stamp order, so a min-id
  // fold is accidentally right in run 1 and picks the LATER-stamped confirm in run 2.
  { terminal: 2, typed: payment(SERVICE_ORDER, 185000, { attempt: "sa-K" }) },
  { terminal: 1, typed: payment(SERVICE_ORDER, 500, { attempt: "sa-D" }) },
  { terminal: 2, typed: payment(SERVICE_ORDER, 185000, { attempt: "sa-D" }) },
  { terminal: 2, typed: refund(SERVICE_ORDER, 20000, { attempt: "sa-ref", parent: "sa-K" }) },
  // The competing confirm: a second terminal confirms the same order LATER in branch time.
  // The anchor must stay the EARLIER one (`01-F43` makes "earliest" a real fact across a
  // branch on one clock), whichever way the envelope ids happen to sort.
  { terminal: 2, typed: confirmed(SERVICE_ORDER) },
  { terminal: 2, typed: settlementClosed(SERVICE_ORDER, { settlement_attempt_ids: ["sa-K"] }) },
];

/** Drive the script over a set of terminals, pinning each event's id via `namer`. */
export const runScript = (
  devices: readonly CoherenceDevice[],
  script: readonly Step[],
  namer: IdNamer,
  sim: Sim,
  settleMs = 400,
): void => {
  script.forEach((step, i) => {
    ringOn(must(devices[step.terminal], "terminal"), { id: namer(i), ...step.typed });
    sim.runFor(settleMs);
  });
};

/**
 * φ applied to the PROJECTION side. Ids are identity-only, so a projection legitimately
 * retains id REFERENCES (anomaly keys, parked membership); invariance means
 * projection(φ(S)) must byte-equal φ(projection(S)).
 */
export const mapFullProjection = (
  proj: FullProjection,
  map: ReadonlyMap<string, string>,
): FullProjection => {
  const m = (v: string) => map.get(v) ?? v;
  return {
    orders: proj.orders.map((row) => {
      const cells = JSON.parse(row.json_lines) as Record<
        string,
        { anomalies?: Record<string, string> }
      >;
      const mapped: Record<string, unknown> = {};
      for (const [lineId, cell] of Object.entries(cells)) {
        const anomalies: Record<string, string> = {};
        for (const [eventId, code] of Object.entries(cell.anomalies ?? {})) {
          anomalies[m(eventId)] = code;
        }
        mapped[lineId] = { ...cell, anomalies };
      }
      return { ...row, json_lines: canonicalJson(mapped) };
    }),
    queue: proj.queue.map((r) => ({ ...r })),
    parked_event_ids: proj.parked_event_ids.map(m).sort(),
  };
};
