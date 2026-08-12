import type { LanMeshConfig } from "@restos/device-config";
import type { DeviceClass } from "@restos/domain";
import {
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
 * ⚠ **AN EMPTY TOKEN SILENTLY EXCLUDES THIS DEVICE FROM ITS OWN BRANCH.**
 *
 * `hello` carries `token: z.string().min(1)` (`packages/sync-protocol/src/messages.ts`), so an
 * empty one fails `parseMessage` and `transport-ws.ts` drops the frame in a bare `catch`. The
 * device then dials, announces, appears in `peers`, computes a hub, reports `{lan: "ok", hub: "ok"}`
 * — and receives **nothing, forever, with no error anywhere**. It was measured, on this shape, by
 * the session that wrote this file's acceptance suite.
 *
 * So an unconfigured `RESTOS_DEVICE_TOKEN` must not become `""`. It becomes this, and that invents
 * no admission policy: the corpus does not rule on LAN admission at all, and `mesh-session.ts`'s
 * own hello arm *"inspects no token"* — this is a wire-schema minimum, not a credential. Where the
 * device HAS a token (`01-F47`, including a silently renewed one) `mesh-session.ts` prefers it over
 * whatever is passed here. **LAN peer authentication is an open gap and is reported, not invented.**
 */
const LAN_HELLO_PLACEHOLDER = "lan-member-unauthenticated";

/**
 * `01-F13`'s first-ranked hub-eligible class, declared ONCE and read twice below.
 *
 * ⚠ **It has to be one declaration, and a mutant is why.** The transport announces this to peers and
 * the session elects on it, so it is written in two places in this file — and changing only ONE of
 * them leaves a device that announces itself as a counter and elects as a kitchen. Measured: that
 * mutant fails six delivery assertions and **passes the election assertion**, because the election
 * reads the announce. Two writes of one fact disagreeing silently is `01-F60`'s enabled-set drift
 * inside a single function.
 */
const DEVICE_CLASS: DeviceClass = "counter_electron";

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
const unmeshed = (): LanMesh => ({
  reachability: () => ({ lan: "down", hub: "down" }),
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
  if (lan === null || lan === undefined) return unmeshed();

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
    self: { device_id: store.identity.device_id, device_class: DEVICE_CLASS },
    // `01-F12` places discovery ON THE LAN. Passed explicitly rather than defaulted so the two
    // ends of one branch read the same declaration (`@restos/device-config`) and cannot drift.
    listen_host: lan.listen_host,
    listen_port: lan.listen_port,
    peers: lan.peers.map((peer) => ({ ...peer })),
    clock: wallClock,
    on_listening: (port) => {
      boundPort = port;
    },
  });

  const session: MeshSession = createMeshSession({
    store,
    transport,
    clock: wallClock,
    device_class: DEVICE_CLASS,
    token: nonEmpty(process.env["RESTOS_DEVICE_TOKEN"]) ?? LAN_HELLO_PLACEHOLDER,
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
