// Regression guard — external-audit K-02 (01-F12), real-socket LAN transport. The
// createWsLanTransport message handler must never crash on a malformed frame, and
// must never hand an unvalidated PeerInfo up as a visible peer. This drives the
// REAL adapter over a REAL `ws` socket (not the sim bus) so the guard covers the
// production wireSocket() path.
//
// The fault the fix closes: the handler dereferenced frame.t / frame.peer.device_id
// without first proving frame is a discriminant-bearing object with a well-typed
// peer. A parseable non-object ("null", "[]", "42"), a discriminant-less "{}", or an
// announce with a malformed peer would throw inside the ws 'message' listener —
// an uncaught exception that crashes the transport host.
//
// Pre-fix: sending "null" throws (`'t' in null` / reading device_id of undefined)
// inside the listener → uncaught → the run dies, RED. Post-fix: each malformed
// frame is dropped, no peer registers, and a subsequent VALID announce still
// registers — proving the handler stayed alive and selective, GREEN.
import type { PeerInfo, TransportHandlers } from "@restos/sync-protocol";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createWsLanTransport, wallClock } from "../index.js";

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolve once a WebSocket has opened (or reject if it errors first). */
const opened = (ws: WebSocket): Promise<void> =>
  new Promise((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

describe("K-02 malformed LAN frames never crash the ws transport (01-F12)", () => {
  it("01-F12: null/array/number/discriminant-less/bad-peer frames are dropped without onPeerVisible, and a subsequent valid announce still registers", async () => {
    const self: PeerInfo = { device_id: "hub-k02", device_class: "counter_electron" };
    const visible: PeerInfo[] = [];
    const handlers: TransportHandlers = {
      onPeerVisible: (peer) => visible.push(peer),
      onPeerLost: () => undefined,
      onMessage: () => undefined,
    };

    // Bind on an ephemeral port; read the actual port back via on_listening.
    let resolvePort: (port: number) => void = () => undefined;
    const portReady = new Promise<number>((resolve) => {
      resolvePort = resolve;
    });
    const transport = createWsLanTransport({
      self,
      listen_port: 0,
      peers: [],
      clock: wallClock,
      on_listening: (port) => resolvePort(port),
    });

    let client: WebSocket | null = null;
    cleanup = () => {
      client?.close();
      transport.stop();
    };

    transport.start(handlers);
    const port = await portReady;

    client = new WebSocket(`ws://127.0.0.1:${port}`);
    client.on("error", () => undefined); // swallow the close-time error like the adapter does
    await opened(client);

    // Every malformed frame the fix must survive: a parseable non-object, a
    // discriminant-less object, and an announce with an unusable peer.
    const malformed = ["null", "[]", "42", "{}", '{"t":"announce","peer":{}}'];
    for (const frame of malformed) client.send(frame);
    await delay(100); // bounded real-time wait for the socket round-trips

    expect(visible).toHaveLength(0); // no malformed frame ever produced a visible peer

    // A well-formed announce over the SAME still-alive socket registers normally.
    client.send('{"t":"announce","peer":{"device_id":"x","device_class":"counter_rn"}}');
    await delay(100);

    expect(visible.map((p) => p.device_id)).toEqual(["x"]);
    expect(visible[0]?.device_class).toBe("counter_rn");
  });
});
