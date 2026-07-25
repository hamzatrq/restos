// Acceptance-test builders — T-01-12 hub-relayed cloud uplink for WAN-less
// devices (DEC-SYNC-009, accepted; supersedes DEC-SYNC-004's per-device-only
// rule). Authored from specs/DECISIONS.md (DEC-SYNC-009, DEC-SYNC-005),
// specs/01-kernel-sync.md (01-F13 amended, 01-F9, 01-F8, 01-F1, 01-F37),
// packages/sync-protocol/PROTOCOL.md (push row, pending clause) and the T-01-12
// contract in plans/wave-0/kernel-tasks.md ONLY (24 §3 step 2: read-only to the
// implementing session). Kept apart from spike-builders.ts on purpose: this
// module models the one device shape T-01-06 could not — a device with NO cloud
// transport at all, whose only path to the cloud log is the branch hub.
//
// ── WHAT THIS ORACLE PINS (binding for the implementing session) ─────────────
// Outcomes, not mechanisms:
//   • A LAN-only device's events reach the cloud merged log via the hub relay,
//     carried verbatim — origin device_id/lamport_seq/payload untouched (01-F1:
//     attested, never re-authored).
//   • The origin learns its events were cloud-acked over the LAN and its outbox
//     drains (store.advanceTo is the ORIGIN's act on learning the cloud ack —
//     the hub never writes the origin's checkpoint; T-01-12 device-side ruling).
//     A LAN ack alone NEVER moves the cloud write-checkpoint (19 §5).
//   • Relay resumes across hub re-election with no gaps and no duplicates in
//     the merged log (id-dedupe + per-origin contiguity absorb overlap).
//   • A poison event relayed by the hub fills its origin's lamport slot at the
//     cloud (DEC-SYNC-005) — the origin's outbox never wedges on it.
//   • Relayed events come back to the pushing hub via origin-inclusive fan-out
//     with global_seq; adoption is ZERO fold work (the landed T-01-15
//     foldStats observable — reused, not re-pinned).
// Deliberately UNPINNED (implementer proposes; oracle pins in a follow-up):
//   the LAN wire shape of the relayed cloud ack (a new push_ack field or reuse —
//   any new wire kind/field is a PROTOCOL.md spec-review event), how the hub
//   selects relay candidates, and whether the ORIGIN itself ever learns
//   global_seq over LAN (not required by any FR today).
//
// ⚠ Files-touchable note for the planner (reported by this oracle): greening
// these scenarios requires the sim-cloud double (@restos/testing) to learn the
// DEC-SYNC-009 per-origin laws (its handlePush keys slots by conn.device_id
// today), but packages/testing is NOT in the T-01-12 files-touchable list —
// a contract gap, flagged in the oracle report, not silently worked around.

import type { DeviceClass } from "@restos/domain";
import type { PeerInfo } from "@restos/sync-protocol";
import type { MergedEvent, Sim, SimCloud } from "@restos/testing";
import type { AppendInput, DeviceStore, MeshSession } from "../index.js";
import { createMeshSession, openStore } from "../index.js";
import { spikeIdentity } from "./spike-builders.js";

/**
 * A device that has NEVER had WAN: real store + LAN mesh session only — no
 * cloud session, no cloud transport ever attached (the T-01-12 "tests owed"
 * shape: "a device with NO cloud transport at all"). Its events can reach the
 * cloud merged log only if the branch hub relays them (01-F13, DEC-SYNC-009).
 */
export type LanOnlyDevice = {
  info: PeerInfo;
  device_id: string;
  store: DeviceStore;
  mesh: MeshSession;
};

export const lanOnlyDevice = (
  sim: Sim,
  device_id: string,
  device_class: DeviceClass,
): LanOnlyDevice => {
  const store = openStore({ path: ":memory:", identity: spikeIdentity(device_id) });
  const mesh = createMeshSession({
    store,
    transport: sim.lan.attach({ device_id, device_class }),
    clock: sim.clock,
    device_class,
    token: "spike-lan-token", // LAN auth is a stub at this rung (01-F27)
  });
  mesh.start();
  return { info: { device_id, device_class }, device_id, store, mesh };
};

/** Durable append + LAN fast path — the only propagation a WAN-less device has. */
export const appendLan = (d: LanOnlyDevice, input: AppendInput) => {
  const envelope = d.store.append(input);
  d.mesh.notifyAppended();
  return envelope;
};

export const closeLan = (d: LanOnlyDevice): void => {
  d.mesh.stop();
  d.store.close();
};

/** The cloud-side merged view of one origin device, in merge order. */
export const mergedOf = (cloud: SimCloud, device_id: string): MergedEvent[] =>
  cloud.mergedStream().filter((m) => m.device_id === device_id);

/**
 * 01-F1 attestation check: the merged wire event minus the two cloud stamps
 * must deep-equal the origin's appended envelope minus its (null)
 * server_received_at — byte-fidelity of device_id, lamport_seq and payload.
 */
export const attestedBody = (m: MergedEvent): Record<string, unknown> => {
  const { server_received_at: _srv, global_seq: _gseq, ...body } = m as Record<string, unknown>;
  return body;
};

export const appendedBody = (envelope: Record<string, unknown>): Record<string, unknown> => {
  const { server_received_at: _srv, ...body } = envelope;
  return body;
};
