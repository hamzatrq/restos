import type { LanMeshConfig } from "@restos/device-config";
import type { DeviceClass } from "@restos/domain";
import {
  createLanAdmission,
  createMeshSession,
  createWsLanTransport,
  type DeviceStore,
  type MeshSession,
  wallClock,
} from "@restos/sync-client";
import type { DeviceState } from "../shared/ipc";

/**
 * # `01-F12`/`01-F13`/`01-F15` — THE COUNTER RUNS THE BRANCH HUB
 *
 * This is the host `packages/sync-client/src/mesh-session.ts` had been owed since Wave 0. That file
 * carried `@unreached-owed NO HOST RUNS THE LAN MESH YET`, `hub-election.ts` and `transport-ws.ts`
 * carried the same, and `restaurant-os.md` puts the *"LAN-first sync mesh"* in **Wave 0** — the
 * oldest open item in the product. The mesh was built, property-tested and constructed by exactly
 * one thing in the repo: a gateway acceptance spike. `AGENTS.md`'s recurring defect, in its purest
 * form and at its largest scale.
 *
 * ## WHAT IT COSTS TO NOT HAVE ONE, WHICH IS WHY THIS IS NOT A NICE-TO-HAVE
 *
 * `apps/pass-kds/src/main/uplink.ts` states it against itself: without the mesh the cloud is *"the
 * ONLY path"* by which the counter's orders reach the pass screen, so **a branch whose internet
 * drops has a pass screen that stops learning about new orders while the counter goes on selling**.
 * That is `00 §5.1` and commandment 4 — no in-branch feature may require WAN — broken in effect,
 * and it is not a thing a screen can work around.
 *
 * ## WHY `counter_electron` IS NOT AN OPTION ON THIS FACTORY
 *
 * It is a property of the DEVICE, not a preference: `01-F13` ranks `counter_electron` FIRST among
 * the hub-eligible classes, so a Windows counter terminal is the branch's preferred hub, and
 * `main/sync.ts` already hardcodes the same value for the cloud session with the same reasoning.
 * Making it a parameter would move the one value the election turns on out of shipped code and into
 * whatever a caller happened to pass.
 *
 * ## WHY IT IS NOT FOLDED INTO `createUplink`
 *
 * `createUplink` returns `offline()` the moment `RESTOS_CLOUD_URL` is unset. A mesh built below
 * that early return would exist only on a device that has a WAN endpoint configured — commandment 4
 * inverted exactly, with the offline-first path made the one that needs the cloud.
 */

/** `00 §5.7`'s two mesh facts. `cloud` is `main/sync.ts`'s and is never decided here. */
export type LanMesh = {
  reachability: () => Pick<DeviceState, "lan" | "hub">;
  /**
   * Why this device is not meshing, or `null` when it is. `00 §5.7`: "no LAN configured" and
   * "configured, but this device has never been paired" are the two states an operator most
   * needs told apart, and both render as `lan: down`.
   */
  why?: string;
  /** `01-F15`'s host-app fast path: an event was durably appended — propagate now. */
  notifyAppended: () => void;
  stop: () => void;
};

/**
 * How often the host looks for events that arrived over the LAN, so the renderer re-reads.
 *
 * `mesh-session.ts` has no "events landed" callback and adding one is a change to a protected
 * package for a signal the host apps are the only consumers of — `main/sync.ts` reached the same
 * conclusion for the cloud session and polls the store the same way. This reads two in-memory
 * counters (`ingestStats()`), not the database, so 250 ms is affordable and leaves `03-N4`'s "< 1 s"
 * render budget most of its room.
 */
const ARRIVAL_POLL_MS = 250;

/**
 * The `hello` message carries `token: z.string().min(1)` (`packages/sync-protocol/src/messages.ts`),
 * so an EMPTY token fails `parseMessage` and the frame is dropped in a bare `catch` — a device that
 * dials, appears in `peers`, computes a hub, reports itself healthy and receives nothing, for ever,
 * with no error anywhere. This is the filler for a device that legitimately holds no cloud token
 * (`01-F47`): LAN-only tills exist, and a branch may run with the WAN never configured at all.
 *
 * ⚠ **This constant used to be `"lan-member-unauthenticated"`, and the name was accurate: LAN
 * admission was an open gap and this string was what a peer presented instead of a credential.**
 * It is not a credential now either — but it is no longer standing in for one. Admission happens
 * at the TLS handshake against the pinned roster (`01-F72`/`01-F74`) before this message exists,
 * so what rides here is only the cloud credential a hub may relay upward for renewal, and its
 * absence means "nothing to relay" rather than "nobody checked".
 */
const NO_CLOUD_TOKEN = "no-cloud-token-configured";

/**
 * `01-F13`'s hub-eligible class for THIS build.
 *
 * ⚠ **This comment used to say "declared ONCE and read twice below … the transport announces this
 * to peers and the session elects on it", with a mutation measurement attached. Both halves died
 * with `01-F72`:** the announce frame is deleted, so this constant is read exactly once, and a
 * peer's class now comes from the ROSTER (`01-F73` (b)) rather than from anything the peer says.
 *
 * That closed one two-writes-of-one-fact problem and opened another, which the `20 §4.4` review
 * lane caught and MEASURED: this build constant and the roster's row for this same device can
 * disagree, and under the deleted announce they could not. If the roster calls this device
 * `kitchen` while the build says `counter_electron`, `electHub` runs on different inputs at each
 * end — measured, each device elects the OTHER, so the branch gets no hub, no fan-out and no
 * error anywhere. `reconcileClass` below is what refuses that.
 */
const DEVICE_CLASS: DeviceClass = "counter_electron";

/**
 * `01-F13`/`01-F39` — refuse to mesh when this device's build disagrees with its own roster row.
 *
 * The roster is the authority (`01-F73` (b) put class there precisely so re-purposing a device
 * does not need a re-issued credential), so the honest options were "trust the roster over the
 * build" or "refuse". Refusing is chosen because the disagreement means one of the two is stale
 * and this device cannot tell which — and a device that silently adopts a class it was not built
 * for is `02-F31`'s tier confusion one layer down: a counter build serving as `kitchen` still
 * prints, still sells, and is now hub-ineligible on a branch that may have no other candidate.
 *
 * It is `01-F17`-safe by construction: this returns a REASON, the caller turns it into an
 * unmeshed device, and the till goes on selling with the degradation named (`00 §5.7`).
 *
 * A device absent from its own roster is NOT this failure — that is an unpaired or newly-revoked
 * device, which `admit` already refuses at every handshake, and refusing to construct the mesh
 * over it would give a revoked device a different observable state than `01-F48` specifies.
 */
const reconcileClass = (store: DeviceStore, built: DeviceClass): string | null => {
  const mine = store.lanRoster.list().find((entry) => entry.device_id === store.identity.device_id);
  if (mine === undefined) return null;
  return mine.device_class === built
    ? null
    : `this build is ${built} but the branch roster calls this device ${mine.device_class} — ` +
        "one of the two is stale, and meshing under a class the branch does not agree on gives " +
        "the branch no hub at all (01-F13/01-F39). Re-pair the device or correct the roster.";
};

const nonEmpty = (raw: string | undefined): string | null => {
  const trimmed = (raw ?? "").trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * A mesh that never meshes, for a device with no LAN configured.
 *
 * A real object rather than a `null`, for `createUplink`'s reason: a single-terminal branch is a
 * device whose mesh reports itself down, not a device missing a component — and `01-F17` means it
 * sells all day either way. This is the ONE honest constant pair in this file; every other answer
 * below is computed.
 */
const unmeshed = (why: string): LanMesh => ({
  // `00 §5.7` — the REASON is carried so the boot line can name it. Both facts stay `down`
  // because both are true: this device is on no branch wire and in contact with no hub.
  reachability: () => ({ lan: "down", hub: "down" }),
  why,
  notifyAppended: () => {},
  stop: () => {},
});

export const createLanMesh = (opts: {
  store: DeviceStore;
  /** `resolveLanMesh(process.env)`. Absent ⇒ no mesh — the T1 single-till branch (`01-F17`). */
  lan: LanMeshConfig | null | undefined;
  /** Called when events arrive over the LAN, so the renderer re-reads. Carries no data. */
  onChanged: () => void;
}): LanMesh => {
  const { store, lan, onChanged } = opts;
  if (lan === null || lan === undefined) return unmeshed("no LAN configured");

  /**
   * `01-F72` (d) — **fail closed, and closed is SILENT rather than degraded.** A device with no
   * pairing-issued credential does not listen and does not dial. There is no unauthenticated mode
   * to fall back to, because an unauthenticated mode is exactly what shipped: this file used to
   * hand the transport the literal string `"lan-member-unauthenticated"` and open a read-write
   * port onto the branch money ledger on every interface.
   *
   * `01-F72` (e) — and it never blocks a sale. An unpaired device is a solo till: it persists
   * locally (`01-F2`) and drains to cloud when it has WAN. What it loses is the branch LAN, and
   * `00 §5.7` requires that loss to be NAMED rather than left looking like a quiet branch.
   */
  const credential = store.lanCredential();
  if (credential === null) return unmeshed("not paired — no LAN credential (01-F73)");

  /**
   * `01-F72` (d)'s OTHER half — *"a host that cannot present a credential, **or cannot read a
   * roster**, does not listen and does not dial"*. Found by the admission suite's author: the
   * credential half was enforced and this one was not, so a device with no roster bound a
   * listener, dialled every peer and refused all of them.
   *
   * That was fail-closed in EFFECT and dishonest in report: the strip said `degraded`
   * ("configured, and nobody answered"), which is the description of a branch whose other
   * devices are switched off — not of a device that has never been told who its branch is.
   * `00 §5.7` is about exactly that difference.
   *
   * ⚠ A never-received roster is `01-F74` (d)'s **absent**, which refuses. An OLD roster is not:
   * it admits, because refusing the LAN because the internet is down is the offline-first breach
   * `00 §5.1` forbids in its first sentence. `ageMs` returning `null` is the one case here.
   */
  if (store.lanRoster.ageMs(Date.now()) === null) {
    return unmeshed("no branch roster received yet — this device knows of no peers (01-F74)");
  }

  const classConflict = reconcileClass(store, DEVICE_CLASS);
  if (classConflict !== null) return unmeshed(classConflict);

  /**
   * The port the socket ACTUALLY bound, or `null` while it has not.
   *
   * ⚠ **`transport-ws.ts` swallows a bind failure** — `wss.on("error", () => undefined)`, correctly,
   * because `01-F17` says nothing about the LAN may take the till down. The cost is that a port
   * already in use (a second instance, a stale process) produces a device that reports itself
   * meshing and holds no socket at all. `00 §5.7` is exactly about facts whose being wrong looks
   * like being right, so `lan` stays `down` until this fires: what was CONFIGURED is on the boot
   * line, what BOUND is on the strip, and they are different claims.
   */
  let boundPort: number | null = null;

  const transport = createWsLanTransport({
    // `01-F12` places discovery ON THE LAN. Passed explicitly rather than defaulted so the two
    // ends of one branch read the same declaration (`@restos/device-config`) and cannot drift.
    listen_host: lan.listen_host,
    listen_port: lan.listen_port,
    peers: lan.peers.map((peer) => ({ ...peer })),
    clock: wallClock,
    // `01-F72` — REQUIRED. There is no unauthenticated construction of this transport, which is
    // the whole point: the credential cannot be forgotten, only absent, and absent is handled
    // above by not building a mesh at all.
    admission: createLanAdmission(credential, store.lanRoster),
    on_listening: (port) => {
      boundPort = port;
    },
  });

  const session: MeshSession = createMeshSession({
    store,
    transport,
    clock: wallClock,
    device_class: DEVICE_CLASS,
    token: nonEmpty(process.env.RESTOS_DEVICE_TOKEN) ?? NO_CLOUD_TOKEN,
  });
  session.start();

  let lastIngested = store.ingestStats().events_ingested;
  const tick = setInterval(() => {
    const ingested = store.ingestStats().events_ingested;
    if (ingested === lastIngested) return;
    lastIngested = ingested;
    onChanged();
  }, ARRIVAL_POLL_MS);

  return {
    /**
     * `00 §5.7` — three facts, each of which is TRUE, and a constant is not a report in either
     * direction. A hardcoded `"ok"` is the same defect as the hardcoded `"down"` this replaces,
     * with the sign flipped and the consequence worse: the strip would promise a branch LAN that
     * does not exist.
     *
     * `lan` is *"is this device actually on the branch wire"* — the socket bound AND at least one
     * other device is visible. `peers` is the transport's live socket set, so a peer leaves it when
     * its socket closes. `degraded` rather than `down` for a bound socket with nobody on it,
     * because "you configured a mesh and nobody answered" and "you configured no mesh" are the two
     * states an operator most needs told apart.
     *
     * `hub` is *"does this branch have a hub I am in contact with"*. Serving as hub (or `solo`,
     * which `HUB-ELECTION.md` defines as acting as hub for later joiners) is `ok` — this device IS
     * the answer. As a follower it is `ok` only while the elected hub is still on the visible peer
     * set, i.e. while a live socket to it exists; an adopted hub that has gone is `degraded`.
     */
    reachability: () => {
      const status = session.status();
      const serving = status.state === "hub" || status.state === "solo";
      const hubVisible =
        status.hub_id !== null && status.peers.some((p) => p.device_id === status.hub_id);
      return {
        lan: boundPort === null ? "down" : status.peers.length > 0 ? "ok" : "degraded",
        hub: serving || hubVisible ? "ok" : "degraded",
      };
    },

    /**
     * `01-F15` — *"an event reaches all connected branch devices < 1 s p95"*, and this is the call
     * that makes it a fast path rather than a heartbeat. Without it `mesh-session.ts` still
     * delivers, on its 2 s window re-fan: measured at **1519 ms** for a single order, uniformly
     * distributed over the beat. `main/index.ts` calls it from the same `notifyChanged` funnel every
     * append path already goes through — the funnel `main/sync.ts` names as owed for the cloud half.
     */
    notifyAppended: () => session.notifyAppended(),

    stop: () => {
      clearInterval(tick);
      // Releases the listening socket and every dial timer. Bound to `will-quit`: a leak here holds
      // the hub port past shutdown and the next launch of the till cannot bind it.
      session.stop();
    },
  };
};
