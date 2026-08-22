// Oracle builders — TWO TILLS ON ONE BRANCH, over the LAN the product actually ships.
//
// Authored from `specs/01-kernel-sync.md` (01-F12, 01-F13, 01-F14, 01-F15, 01-F16, 01-F17,
// 01-F34, 01-F39, 01-F43, 01-F45, 01-F48, 01-F72, 01-F73, 01-F74, 01-F80, 01-F81),
// `specs/02-pos-app.md` (02-F11), `specs/26-merge-semantics.md`, `specs/00-platform-overview.md`
// §5.1/§5.4/§5.7 and `plans/saas-pivot/plan-of-record.md` (R2, R36) ONLY — never from an
// implementation (`24 §3` step 2: read-only to the implementing session).
//
// ⚠ **PROTECTED PATH (`20 §4.4`, commandment 10): `packages/sync-client`.**
//
// ── WHY THIS HARNESS EXISTS BESIDE `multi-terminal-builders.ts` ────────────────────────────────
//
// `multi-terminal-builders.ts` is a good oracle aimed at the wrong plane, and the measurement is
// exact rather than rhetorical. A `grep -a` of it and its suite for
// `createLanMesh|createWsLanTransport|createLanAdmission|setLanCredential|lanRoster` returns
// **0 hits in both files**. What it DOES reach is real: `createMeshSession`, `openStore` and the
// real fold engine — so the claim *"it references zero product-mesh symbols"* is too strong and
// is corrected here rather than repeated. What it attaches to is `sim.lan.attach`
// (`packages/testing/src/sim.ts`), an in-process `Map` of devices with **no socket, no TLS, no
// admission and no roster**, and it hands the session the literal `token: "lan-token-stub"`.
//
// So it proves the SESSION and the FOLDS. It cannot see the three things `01-F72`/`01-F73`/
// `01-F74` added underneath them, and it would be green before, during and after those landed.
// This harness swaps exactly one layer — the transport — for `createWsLanTransport` over real
// `wss` sockets, with `createLanAdmission` over a real `createLanRoster` inside a real store.
// Everything above it (session, folds, projections) is the same production code.
//
// ── WHAT IS SALVAGED FROM IT, WHICH IS MOST OF IT ─────────────────────────────────────────────
//
// The pure oracle INSTRUMENTS are imported rather than re-written — `serviceScript` (whose two
// competing confirms and contested terminal pair were built for exactly this hunt), `forwardIds`,
// `ringOn`, `deliveryOrdersDiverged`, `observedOrders`, and the projection readers
// (`projectionOf`, `orderRow`, `lineCells`), which is why `LanTill` below is deliberately
// structurally compatible with its `CoherenceDevice`. Re-deriving any of them would be a second
// interpretation of `01-F34`, which is the `03-F40` two-encodings defect wearing an oracle.
//
// What is NOT salvageable onto this plane is the relabel run itself (`phi`, `reversingIds`,
// `mapFullProjection`): it compares two runs that must differ ONLY in envelope ids, and a real
// socket's transit jitter moves `branch_created_at` between runs. That instrument needs
// `20 §2.4`'s virtual clock and stays where it is — `branch-lan-coherence.test.ts` reading R-4
// carries the measurement.
//
// ── ⚠ THE ONE THING THIS HARNESS PAPERS OVER, NAMED SO IT IS NOT DISCOVERED ────────────────────
//
// `pairByHand` below writes the LAN credential and the branch roster straight into the store.
// **That is not how a till comes to hold either of them, and nothing in the product does it.**
// Measured on this tree: `setLanCredential` has a declaration and an implementation and **zero
// shipping callers**; `lanRoster.apply` has **zero shipping callers** (`store.lanRoster` is read
// by `apps/*/src/main/mesh.ts` for `list()` and `ageMs()` and written by nobody). So on a default
// launch `createLanMesh` returns `unmeshed(...)` at the first gate it reaches, and every
// convergence claim in this file describes a state no restaurant can reach.
//
// `pairByHand` is therefore FIXTURE WIRING with a debt attached, and the debt is owned by
// `device-roster-distribution.test.ts` §S, which is RED. Without §S this file would be a third
// suite blessing a mesh nothing can enter — `AGENTS.md`'s recurring defect, committed by the
// oracle written to catch it. `01-F80` (pairing) and `01-F81` (`device_roster` as `01-F75`'s
// third resource) are the two FRs that close it.
//
// ── WHAT REAL SOCKETS COST, AND WHY IT IS PAID ────────────────────────────────────────────────
//
// Every assertion here already exists somewhere in this package over `sim.lan`
// (`mesh-scenarios.test.ts`, `branch-time-mesh.test.ts`, `journey-j3-hub-handover.test.ts`,
// `multi-terminal-coherence.test.ts`). Nothing below is a new CLAIM. What is new is the plane:
// these are the first assertions that a branch of tills coheres over mutual TLS, a roster-gated
// admission decision per handshake, and one `wss` socket per pair. The sim cannot fail the way a
// socket can, and `AGENTS.md` records nine layout defects found by launching the app and zero by
// the suites for exactly this reason.
//
// ⚠ **NOTHING HERE PINS `now` FOR A CERTIFICATE.** `createTestBranchPki` mints at the real clock
// and its own header records why: TLS validates a validity window against the SYSTEM clock and
// `20 §2.4`'s injected clock cannot reach it, so a fixture that pins `now` for certificates that
// must be VALID is a fixture with an expiry date. The clock skew this file injects
// (`skewedClock`) reaches the mesh session's `Clock` seam and **nothing else** — which is exactly
// the shape `01-F45` describes: a device whose own clock is years wrong still holds a certificate
// its machine's real clock accepts.

import type { AddressInfo } from "node:net";
import { createServer } from "node:net";
import type { DeviceClass } from "@restos/domain";
import type { Clock, MeshTransport, PeerInfo, ProtocolMessage } from "@restos/sync-protocol";
import {
  createTestBranchPki,
  type TestBranchPki,
  type TestDevice,
} from "@restos/testing/lan-credentials";
import { expect } from "vitest";
import type { DeviceStore } from "../device-store.js";
import {
  createLanAdmission,
  createMeshSession,
  createWsLanTransport,
  type MeshSession,
  openStore,
  wallClock,
} from "../index.js";
import type { RosterEntry } from "../lan-roster.js";
import { appendInput, must } from "./builders.js";
import { BRANCH, batchEventIds, meshIdentity, ORG } from "./mesh-builders.js";
import type { Step } from "./multi-terminal-builders.js";
import { type IdNamer, ringOn as ringOnSimDevice } from "./multi-terminal-builders.js";
import { skewedClock, type TimeStore } from "./time-builders.js";

/** Every socket in this file is loopback: an acceptance suite must not open a port on the LAN. */
export const LOOPBACK = "127.0.0.1";

/**
 * ⚠ **THE TWO CONSTANTS THE MESH'S OWN TIMING IS BUILT ON, read from the module rather than
 * copied.** `HEARTBEAT_INTERVAL_MS` is 2 s and `HUB_LOSS_TIMEOUT_MS` is three of them; a suite
 * that hard-coded `2000` would go green against a build that changed them and silently stop
 * waiting long enough. Imported values, so a change to either moves this file with it.
 */
export {
  HEARTBEAT_INTERVAL_MS,
  HUB_LOSS_TIMEOUT_MS,
  REELECTION_BUDGET_MS,
} from "../mesh-session.js";

import { REELECTION_BUDGET_MS as REELECTION_BUDGET_MS_VALUE } from "../mesh-session.js";

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll until `predicate` holds. A timeout throws with the LABEL rather than dying as a generic
 * vitest timeout — every wait in this file is waiting on a PROPERTY (`01-F13` convergence,
 * `01-F15` propagation), and a negative result must read as that property failing.
 */
export const waitFor = async (
  label: string,
  predicate: () => boolean,
  timeout_ms = 20_000,
): Promise<void> => {
  const deadline = Date.now() + timeout_ms;
  for (;;) {
    if (predicate()) return;
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}`);
    await delay(20);
  }
};

/**
 * A free loopback port, learned by binding `0` and releasing it.
 *
 * ⚠ **The window between release and re-bind is real and it is the reason `boundPort` is
 * ASSERTED rather than assumed** (`lanBranch` below). `transport-ws.ts` swallows a bind failure
 * on purpose (`wss.on("error", () => undefined)`, for `01-F17`: nothing about the LAN may take
 * the till down) — so a lost race produces a till that reports itself meshing and holds no
 * socket, which is precisely the `00 §5.7` shape *"a fact whose being wrong looks like being
 * right"*. A suite that did not check would then measure a branch of solo tills and call it
 * convergence.
 */
const reservePort = async (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, LOOPBACK, () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });

export type BranchMember = { device_id: string; device_class: DeviceClass };

/**
 * One branch: a per-org issuer (`01-F73` (b)), a certificate per device, and a reserved loopback
 * port per device.
 *
 * `org_id`/`branch_id` are the store's own (`mesh-builders.ts`), so the certificate subject and
 * the ledger identity name the same tenant. Nothing in `transport-ws.ts` compares them today —
 * it pins the `CN` to `device_id` and resolves the rest through the roster — but a fixture whose
 * certificate says one org while its ledger says another would be blessing an isolation gap
 * (`00 §5.4`, `01-F71`) it has no business blessing.
 */
export type LanBranch = {
  pki: TestBranchPki;
  members: readonly BranchMember[];
  portOf: (device_id: string) => number;
  deviceOf: (device_id: string) => TestDevice;
  /** `01-F74` (a)'s four facts, for every member. `revoked` marks, it does not remove. */
  rosterEntries: (revoked?: readonly string[]) => RosterEntry[];
};

export const lanBranch = async (members: readonly BranchMember[]): Promise<LanBranch> => {
  const pki = await createTestBranchPki([...members], { org_id: ORG, branch_id: BRANCH });
  const ports = new Map<string, number>();
  for (const member of members) ports.set(member.device_id, await reservePort());
  const deviceOf = (device_id: string): TestDevice =>
    must(
      pki.devices.find((d) => d.device_id === device_id),
      `branch fixture has no device "${device_id}"`,
    );
  return {
    pki,
    members,
    deviceOf,
    portOf: (device_id) =>
      must(ports.get(device_id), `branch fixture reserved no port for "${device_id}"`),
    /**
     * ⚠ **A DEPARTURE IS A MARKED ENTRY AND NEVER AN ABSENCE** (`01-F81` (a), `01-F75`). A
     * revoked device stays in the artifact with its revocation field set, because *"an id that
     * simply vanished from the artifact is a change a delta has no way to state"*. This fixture
     * therefore takes `revoked` and never `omit`, so no test in this file can accidentally
     * exercise the removal shape the FR forbids on the wire.
     */
    rosterEntries: (revoked = []) =>
      pki.devices
        .filter((d) => members.some((m) => m.device_id === d.device_id))
        .map((d) => ({
          device_id: d.device_id,
          device_class: d.device_class,
          cert_sha256: d.cert_sha256,
          revoked: revoked.includes(d.device_id),
        })),
  };
};

/**
 * A till on the branch wire: real store, real credential, real roster, real mutual-TLS transport,
 * real mesh session, real folds — and an observation log of the order events ARRIVED in.
 *
 * Structurally a `CoherenceDevice` (`multi-terminal-builders.ts`), which is what lets this file
 * reuse that oracle's instruments — `deliveryOrdersDiverged`, `observedOrders`, `ledgerIdSet`,
 * `projectionOf`, `projectionBytesOf`, `orderRow`, `lineCells` — instead of writing a second set
 * that could disagree with them.
 */
export type LanTill = {
  info: PeerInfo;
  store: TimeStore;
  session: MeshSession;
  skew_ms: number;
  observed: string[];
  /** The port the listen socket ACTUALLY bound, or `null` while it has not. */
  boundPort: () => number | null;
  /** This till's own (wrong) wall clock. */
  deviceNow: () => number;
  /** Branch time as this till computes it (`01-F43`): device clock + offset. */
  branchNow: () => number;
  stop: () => void;
};

/** Wraps a transport so every event id crossing it is noted at FIRST sight (`01-F34` evidence). */
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

/**
 * ⚠ **FIXTURE WIRING WITH A DEBT — see this file's header.** A till holds a LAN credential
 * because `01-F80`'s pairing put one there, and a branch roster because `01-F81`'s
 * `device_roster` artifact arrived over `01-F75`'s frame. Neither path exists, so this writes
 * both directly. The `01-F74` (d) distinction is preserved even here: this is a roster that was
 * RECEIVED (`ageMs` is a number, not `null`), because a never-received roster is the state
 * `createLanMesh` refuses at and is a different test.
 */
export const pairByHand = (
  store: DeviceStore,
  branch: LanBranch,
  device_id: string,
  opts: { revoked?: readonly string[] } = {},
): void => {
  store.setLanCredential(branch.deviceOf(device_id).credential);
  const applied = store.lanRoster.apply(
    { kind: "snapshot", version: 1, entries: branch.rosterEntries(opts.revoked) },
    Date.now(),
  );
  // The fixture asserts its own setup. A silently refused roster would make every admission below
  // refuse for a reason that has nothing to do with the property under test — which is how a
  // security suite reports a green that means "nobody could connect".
  expect(applied, `${device_id}: the fixture's roster must apply`).toEqual({
    applied: true,
    version: 1,
  });
};

/**
 * ⚠ **DIAL-DOWN, and it is a decision rather than a convenience.** Each till dials only the
 * members declared BEFORE it, so a pair is joined by exactly ONE socket. Dialling both ways
 * leaves two sockets per pair — `peerSockets` keeps the last, both keep delivering, and
 * `onPeerLost` fires only for the one that happens to be in the map. That is not a defect in the
 * transport (`01-F12` says nothing about who dials), but it makes a hub-loss assertion
 * nondeterministic, and a flaky security suite is one that gets re-run until it is green.
 *
 * Visibility is still MUTUAL: `wireSocket` fires `onPeerVisible` on the acceptor as well as the
 * dialler, so every till sees every other and `electHub` runs on one peer set branch-wide.
 */
const peersFor = (
  branch: LanBranch,
  device_id: string,
): { device_id: string; host: string; port: number }[] => {
  const index = branch.members.findIndex((m) => m.device_id === device_id);
  return branch.members
    .slice(0, index < 0 ? 0 : index)
    .map((m) => ({ device_id: m.device_id, host: LOOPBACK, port: branch.portOf(m.device_id) }));
};

export const lanTill = (
  branch: LanBranch,
  device_id: string,
  opts: { skew_ms?: number; revoked?: readonly string[]; token?: string } = {},
): LanTill => {
  const member = must(
    branch.members.find((m) => m.device_id === device_id),
    `branch fixture has no member "${device_id}"`,
  );
  const skew_ms = opts.skew_ms ?? 0;
  const info: PeerInfo = { device_id, device_class: member.device_class };
  const store = openStore({ path: ":memory:", identity: meshIdentity(device_id) });
  pairByHand(store, branch, device_id, {
    ...(opts.revoked === undefined ? {} : { revoked: opts.revoked }),
  });

  const observed: string[] = [];
  const seen = new Set<string>();
  const note = (ids: readonly string[]): void => {
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      observed.push(id);
    }
  };

  let boundPort: number | null = null;
  const credential = must(
    store.lanCredential(),
    `${device_id}: the store must hold the credential the fixture just wrote`,
  );
  const transport = observingTransport(
    createWsLanTransport({
      listen_host: LOOPBACK,
      listen_port: branch.portOf(device_id),
      peers: peersFor(branch, device_id),
      clock: wallClock,
      // `01-F72` — the REAL admission seam: this device's credential plus its own roster's
      // decision, assembled by the same factory both Electron hosts call.
      admission: createLanAdmission(credential, store.lanRoster),
      on_listening: (port) => {
        boundPort = port;
      },
    }),
    note,
  );

  const clock: Clock = skew_ms === 0 ? wallClock : (skewedClock(wallClock, skew_ms) as Clock);
  const session = createMeshSession({
    store,
    transport,
    clock,
    device_class: member.device_class,
    /**
     * `01-F72` (a)/(b): the `hello` token is NOT the LAN credential and never was — admission
     * happened at the handshake, before this frame exists. What rides here is the CLOUD token a
     * hub may relay upward for renewal (`01-F47`), and its content is irrelevant to every
     * assertion in this file. Named to say so, rather than left as a stub that reads like a
     * credential.
     */
    token: opts.token ?? "cloud-token-not-under-test",
  });

  const timeStore = store as unknown as TimeStore;
  const deviceNow = (): number => Date.now() + skew_ms;
  return {
    info,
    store: timeStore,
    session,
    skew_ms,
    observed,
    boundPort: () => boundPort,
    deviceNow,
    branchNow: () => deviceNow() + timeStore.branchTimeStatus().offset_ms,
    stop: () => {
      session.stop();
      store.close();
    },
  };
};

/**
 * Start every till and wait until each has BOUND its listen socket.
 *
 * The bind check is the assertion `transport-ws.ts`'s swallowed bind error makes necessary: a
 * till that failed to bind still dials, still elects, still reports peers — and is unreachable.
 * Waiting on `boundPort` rather than on a sleep is what turns that from an invisible flake into a
 * named failure.
 */
export const startBranch = async (tills: readonly LanTill[]): Promise<void> => {
  for (const till of tills) till.session.start();
  for (const till of tills) {
    await waitFor(
      `${till.info.device_id} to BIND its listen socket — a swallowed bind error (transport-ws.ts) produces a till that reports itself meshing and holds no socket`,
      () => till.boundPort() !== null,
      10_000,
    );
  }
};

/** Every till's mesh state, for a failure message that names the topology rather than a boolean. */
export const meshStates = (
  tills: readonly LanTill[],
): Record<string, { state: string; hub_id: string | null; peers: string[] }> =>
  Object.fromEntries(
    tills.map((t) => {
      const status = t.session.status();
      return [
        t.info.device_id,
        {
          state: status.state,
          hub_id: status.hub_id,
          peers: status.peers.map((p) => p.device_id).sort(),
        },
      ];
    }),
  );

/** Wait until every till names the SAME hub — `01-F13`'s "every device computes the same winner". */
export const awaitOneHub = async (
  tills: readonly LanTill[],
  budget_ms = 20_000,
): Promise<string> => {
  const agreed = (): string | null => {
    const hubs = new Set(tills.map((t) => t.session.status().hub_id));
    if (hubs.size !== 1) return null;
    const [only] = [...hubs];
    return only ?? null;
  };
  try {
    await waitFor(
      `one agreed hub across ${tills.length} tills (01-F13)`,
      () => agreed() !== null,
      budget_ms,
    );
  } catch (cause) {
    // The topology, not a boolean: which till thinks what, and who each can see. A hub-agreement
    // failure with no peer sets in it sends the reader to the wrong layer.
    throw new Error(`${(cause as Error).message} — saw ${JSON.stringify(meshStates(tills))}`);
  }
  return must(agreed(), "one agreed hub");
};

/**
 * Wait until the surviving tills agree on a serving device that is NOT `previous`.
 *
 * ⚠ **`awaitOneHub` alone is the wrong instrument here and it cost a red run.** The survivors go
 * on naming the dead device until they notice it is gone, so "they all agree" is satisfied by the
 * corpse — the handover has not happened and the assertion after it would be comparing branch
 * time against itself. `01-F13` calls the thing being waited for *"re-election on hub loss"*, and
 * this is the predicate that actually expresses it.
 */
export const awaitServingChange = async (
  tills: readonly LanTill[],
  previous: string,
  budget_ms = REELECTION_BUDGET_MS_VALUE,
): Promise<string> => {
  const agreed = (): string | null => {
    const hubs = new Set(tills.map((t) => t.session.status().hub_id));
    if (hubs.size !== 1) return null;
    const [only] = [...hubs];
    return only === null || only === undefined || only === previous ? null : only;
  };
  try {
    await waitFor(
      `the surviving tills to agree on a serving device other than ${previous} (01-F13)`,
      () => agreed() !== null,
      budget_ms,
    );
  } catch (cause) {
    throw new Error(`${(cause as Error).message} — saw ${JSON.stringify(meshStates(tills))}`);
  }
  return must(agreed(), "a new serving device");
};

/**
 * Wait until the branch's tills hold MORE THAN ONE distinct branch-time offset (`01-F43`).
 *
 * ⚠ **THE OBVIOUS PREDICATE — "every till stamps `branch` rather than `branch_provisional`" —
 * IS SATISFIED INSTANTLY AND MEANS NOTHING HERE, and that is a measurement.** `mesh-session.ts`
 * computes `eligible = electHub([self]) === self.device_id`, which is TRUE for every
 * hub-eligible class (`01-F39`) whether or not that device will end up serving, and `start()`
 * then calls `setBranchTimeOffset` on it — so a `counter_electron` that is about to become a
 * FOLLOWER stamps `branch` with offset 0 from boot, before it has heard any hub. Waiting on the
 * basis therefore returns before a single offset has been measured, and every event on the
 * branch carries one identical stamp. Measured exactly that way: the min-id mutant survived.
 *
 * What this waits for instead is the state `01-F43` actually describes — each device holding its
 * OWN measured offset against the serving device's clock. It is only meaningful when the tills
 * were built with DIFFERENT `skew_ms`, which is why the caller asserts that too.
 */
export const awaitDistinctBranchOffsets = async (
  tills: readonly LanTill[],
  budget_ms = 20_000,
): Promise<void> => {
  await waitFor(
    "the tills to hold DIFFERENT branch-time offsets — until the first heartbeat every hub-eligible till holds 0 and every stamp on the branch is identical (01-F43)",
    () => new Set(tills.map((t) => t.store.branchTimeStatus().offset_ms)).size > 1,
    budget_ms,
  );
};

/** The `branch_created_at` this till holds for every event of `type` — `01-F43`'s stamp. */
export const stampsOfType = (till: LanTill, type: string): { id: string; stamp: number }[] =>
  till.store
    .readAllEvents()
    .filter((e) => (e as unknown as { type: string }).type === type)
    .map((e) => ({
      id: e.id,
      stamp: (e as unknown as { branch_created_at: number }).branch_created_at,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

export const ledgerIds = (till: LanTill): Set<string> =>
  new Set(till.store.readAllEvents().map((e) => e.id));

/** Wait until every till holds exactly `ids` — the delivery precondition every claim rests on. */
export const awaitBranchHolds = async (
  tills: readonly LanTill[],
  ids: readonly string[],
  budget_ms = 30_000,
): Promise<void> => {
  const want = [...ids].sort();
  await waitFor(
    `every till to hold the whole branch stream (${want.length} events, 01-F8/01-F14/01-F15) — held: ${JSON.stringify(
      Object.fromEntries(tills.map((t) => [t.info.device_id, ledgerIds(t).size])),
    )}`,
    () => tills.every((t) => JSON.stringify([...ledgerIds(t)].sort()) === JSON.stringify(want)),
    budget_ms,
  );
};

/**
 * Ring something on this till: durable append with THIS till's own wrong clock, then `01-F15`'s
 * fast-path notify. The same act `multi-terminal-builders.ts`'s `ringOn` performs, and delegated
 * to it so the two suites cannot drift on what "a cashier rang this" means.
 */
export const ringOn = (
  till: LanTill,
  typed: Record<string, unknown>,
): Record<string, unknown> & { id: string } =>
  ringOnSimDevice(till as unknown as Parameters<typeof ringOnSimDevice>[0], typed);

/** Append with no id override, letting the store mint one (`01-F5`). */
export const ringNamed = (till: LanTill, id: string, typed: Record<string, unknown>) =>
  ringOn(till, { id, ...typed });

export const closeBranch = (tills: readonly LanTill[]): void => {
  for (const till of tills) {
    try {
      till.stop();
    } catch {
      // A till already stopped by the test under way (a hub kill) must not fail the teardown of
      // the ones that are still up — otherwise one assertion's cleanup masks another's failure.
    }
  }
};

/**
 * Drive a script over real sockets, one step at a time.
 *
 * `settle_ms` is deliberately SHORT and deliberately not zero. Zero would ring every event into
 * one tick and give the fan-out nothing to reorder, which is the fixture-answers-its-own-question
 * failure; long enough to fully converge between steps would hand every till one identical
 * sequence, which is the same failure with the sign flipped. Every test that compares projections
 * across tills asserts `deliveryOrdersDiverged` and says so.
 */
export const runScriptOverLan = async (
  tills: readonly LanTill[],
  script: readonly Step[],
  namer: IdNamer,
  settle_ms = 120,
): Promise<string[]> => {
  const ids: string[] = [];
  for (const [index, step] of script.entries()) {
    const id = namer(index);
    ringNamed(must(tills[step.terminal], `script names terminal ${step.terminal}`), id, step.typed);
    ids.push(id);
    await delay(settle_ms);
  }
  return ids;
};

export { appendInput, delay };
