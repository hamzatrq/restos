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
import type { z } from "zod";
import type { FactSchema } from "../shared/ipc";

type Fact = z.infer<typeof FactSchema>;

/**
 * # `01-F12`/`01-F13`/`01-F15` — THIS SCREEN JOINS THE BRANCH MESH
 *
 * `uplink.ts`'s header is titled *"HOW THE COUNTER'S ORDERS REACH THIS SCREEN — AND THE HONEST
 * ANSWER IS 'OVER THE WAN'"*, and it ends: *"That is a `00 §5.1` violation in effect and it is NOT
 * closed by this app."* This file is the half of the fix that lives here; the other half is
 * `apps/pos-electron/src/main/mesh.ts`, and neither closes it alone.
 *
 * A cook now sees the counter's orders with the internet cable pulled, which is what `01-F15`
 * always said — *"an event reaches all connected branch devices < 1 s p95 … order state changes ride
 * this path"* — and what nothing in the product had ever done.
 *
 * ## `kitchen`, AND IT IS NOT A PARAMETER
 *
 * `01-F39`'s own name for *"pass screen / KDS station, doc 03"*, hardcoded exactly as `uplink.ts`
 * hardcodes it for the cloud session and for the same reason: it is a property of the DEVICE. It is
 * also the value `01-F13`'s election turns on, and the single most plausible slip when this file and
 * the counter's are written in one session is copying `counter_electron` into it. That would win the
 * election on any branch whose till has a higher device id, take hub duty away from the terminal
 * `01-F13` names as preferred, and make the KITCHEN the branch time authority (`01-F43`) and the
 * branch's cloud uplink (`DEC-SYNC-009`) — on the device a deployment deliberately keeps off the
 * internet.
 *
 * ## THIS SCREEN IS HUB-ELIGIBLE, SO IT IS NOT INERT WHEN IT BOOTS FIRST
 *
 * `01-F39` puts `kitchen` inside the hub-eligible set and `HUB-ELECTION.md` says *"Cold start:
 * single eligible device → `solo` (acts as hub for later joiners)"*. A pass screen powered on before
 * the till therefore serves the branch until the till arrives and outranks it, rather than waiting.
 */

/** `00 §5.7`'s two mesh facts. `cloud` is `uplink.ts`'s and is never decided here. */
export type LanMesh = {
  reachability: () => { lan: Fact; hub: Fact };
  /**
   * Why this device is not meshing, or absent when it is. `00 §5.7`: "no LAN configured" and
   * "configured, but this device has never been paired" are the two states an operator most
   * needs told apart, and both render as `lan: down`.
   */
  why?: string;
  /** `01-F15`'s host-app fast path: an event was durably appended — propagate now. */
  notifyAppended: () => void;
  stop: () => void;
};

/**
 * How often the host looks for events that arrived over the LAN, so the queue re-reads.
 *
 * `mesh-session.ts` has no "events landed" callback and adding one is a change to a protected
 * package for a signal the host apps are the only consumers of — `uplink.ts` reached the same
 * conclusion for the cloud session. This reads an in-memory counter (`ingestStats()`) and not the
 * database, so 250 ms is affordable and it is four times sharper than the age tick beside it.
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
 * `01-F39`'s own name for *"pass screen / KDS station, doc 03"*, declared ONCE and read twice below.
 *
 * ⚠ **It has to be one declaration, and a mutant is why.** The transport announces this to peers and
 * the session elects on it. Changing only ONE leaves a screen that announces itself as a kitchen and
 * elects as a counter: measured, that mutant fails four delivery assertions and **passes the
 * election assertion**, because the election reads the announce. Two writes of one fact disagreeing
 * silently is `01-F60`'s enabled-set drift inside a single function.
 */
const DEVICE_CLASS: DeviceClass = "kitchen";

const nonEmpty = (raw: string | undefined): string | null => {
  const trimmed = (raw ?? "").trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * A mesh that never meshes, for a screen with no LAN configured — the honest state of a pass screen
 * whose branch has not been wired yet, and the one place in this file where a constant IS the whole
 * truth about a device.
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
  /** `resolveLanMesh(process.env)`. Absent ⇒ no mesh; the screen still runs (`01-F17`). */
  lan: LanMeshConfig | null | undefined;
  /** Called when events arrive over the LAN, so the queue re-reads. Carries no data. */
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
   * The port the socket ACTUALLY bound, or `null` while it has not.
   *
   * ⚠ **`transport-ws.ts` swallows a bind failure** — `wss.on("error", () => undefined)`, correctly,
   * because `01-F17` says nothing about the LAN may take a screen off the wall. The cost is that a
   * port already in use produces a device that reports itself meshing and holds no socket at all.
   * `00 §5.7` is exactly about facts whose being wrong looks like being right — and on this surface
   * the wrong answer is an empty queue, which is what a quiet kitchen looks like. What was
   * CONFIGURED is on the boot line; what BOUND is on the strip.
   */
  let boundPort: number | null = null;

  const transport = createWsLanTransport({
    // `01-F12` places discovery ON THE LAN, and this screen must be dialable: it is hub-eligible,
    // so on a branch whose till is off it is the one serving.
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
     * `00 §5.7` — facts, not constants, in either direction. A hardcoded `"ok"` here is worse than
     * the hardcoded `"down"` it replaces: it would tell a cook the branch LAN is carrying his
     * tickets while he stands in front of an empty screen.
     *
     * `lan` is *"is this screen actually on the branch wire"* — the socket bound AND at least one
     * other device is visible. `peers` is the transport's live socket set. `degraded` rather than
     * `down` for a bound socket with nobody on it, because a configured mesh with no peer and no
     * mesh at all are the two states an operator most needs told apart.
     *
     * `hub` is *"does this branch have a hub I am in contact with"*: serving as hub or `solo` is
     * `ok`, and as a follower `ok` only while the elected hub is still on the visible peer set.
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
     * `01-F15`'s fast path, and on this device it carries the ready-mark and the handover back to
     * the counter (`03-F16`/`03-F52`) rather than orders forward. Without it those edges wait for
     * `mesh-session.ts`'s 2 s window re-fan — measured at 1519 ms for a single event. `main/index.ts`
     * calls it from the `notifyChanged` funnel every append path here already goes through.
     */
    notifyAppended: () => session.notifyAppended(),

    stop: () => {
      clearInterval(tick);
      // Releases the listening socket and every dial timer, so a relaunch can rebind the port.
      session.stop();
    },
  };
};
