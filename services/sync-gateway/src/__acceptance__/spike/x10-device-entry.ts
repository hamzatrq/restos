// X10 — device child entrypoint (T-01-06 real-core leg, contract (g) "X10"; DEC
// block point 2). ONE real device host: real SQLite file + real LAN WebSocket mesh
// (hub serves / followers dial) + real cloud WebSocket to the gateway. Driven by the
// orchestrator over IPC (x10-ipc.ts is the binding contract). Node stands in for the
// Electron main / RN host at this rung (T-01-06 assumption 1).
//
// RED MARKER (intended until the impl lands contract (f)): the two WS adapters
// createWsLanTransport / createWsCloudTransport are the impl surface
// (packages/sync-client/src/transport-ws.ts). Until they are exported from
// @restos/sync-client this module fails at import — "does not provide an export
// named 'createWsLanTransport'" — the child never reaches ready, and X10 fails RED.
// Everything else this file uses (openStore, createMeshSession, createCloudSession,
// wallClock) is LANDED. So the RED is precisely the missing adapters, nothing else.
//
// WS adapter surfaces the impl MUST provide (satisfying the MeshTransport /
// CloudTransport seams in @restos/sync-protocol; T-01-06 contract (f)):
//
//   createWsLanTransport({
//     self: PeerInfo,                  // this device's id + class (discovery announce)
//     listen_port: number,             // 0 = ephemeral; the hub reads it back
//     peers: { device_id, host, port }[],   // manual-IP DIAL directory (01-F12 fallback)
//     clock: Clock,                    // dial-retry timers (wallClock at this rung)
//     on_listening?: (port: number) => void, // fired with the bound port after start()
//   }): MeshTransport
//     — hub LISTENS on listen_port and accepts follower sockets; followers DIAL every
//       directory peer and RETRY on drop (visible = connectable → onPeerVisible with
//       the peer's PeerInfo exchanged out-of-band; lost = socket closed → onPeerLost).
//       Wire ProtocolMessages flow as onMessage(from, message); the PeerInfo announce
//       is a transport-level frame, NOT a PROTOCOL.md message (the set stays closed).
//
//   createWsCloudTransport({
//     url: string,                     // the gateway /sync route
//     clock: Clock,                    // reconnect timer (wallClock)
//     reconnect_ms?: number,           // default 1000
//   }): CloudTransport
//     — dials `url`; onUp on open, onDown on close/error, reconnect on the clock timer
//       (so a gateway that goes away and re-listens on the same port is resumed).

import {
  createCloudSession,
  createMeshSession,
  createWsCloudTransport,
  createWsLanTransport,
  openStore,
  wallClock,
} from "@restos/sync-client";
import type { PeerInfo } from "@restos/sync-protocol";
import { type ChildReport, type ParentCommand, parseArgv } from "./x10-ipc.js";

const send = (message: unknown): void => {
  process.send?.(message);
};

const main = (): void => {
  const cfg = parseArgv(process.argv.slice(2));
  const self: PeerInfo = { device_id: cfg.device_id, device_class: cfg.device_class };

  const store = openStore({
    path: cfg.db,
    identity: { org_id: cfg.org, branch_id: cfg.branch, device_id: cfg.device_id },
  });

  // First-local-sighting wall clock (evidence only, never asserted — DEC-TEST-002:
  // wall-clock is D3). A light poll of the ledger records when each id first appears.
  const firstSeen = new Map<string, number>();
  const recordFirstSeen = (): void => {
    const now = Date.now();
    for (const e of store.readAllEvents()) if (!firstSeen.has(e.id)) firstSeen.set(e.id, now);
  };
  const poller = setInterval(recordFirstSeen, 25);

  let lanPort: number | undefined;
  let readySent = false;
  const sendReady = (): void => {
    if (readySent) return;
    readySent = true;
    send({ type: "ready", device_id: cfg.device_id, lan_port: lanPort });
  };

  const lanTransport = createWsLanTransport({
    self,
    listen_port: cfg.lan_role === "hub" ? cfg.lan_port : 0,
    peers: cfg.lan_peers,
    clock: wallClock,
    on_listening: (port: number) => {
      lanPort = port;
      if (cfg.lan_role === "hub") sendReady(); // hub is ready once its LAN port is bound
    },
  });
  const cloudTransport = createWsCloudTransport({ url: cfg.cloud_url, clock: wallClock });

  const mesh = createMeshSession({
    store,
    transport: lanTransport,
    clock: wallClock,
    device_class: cfg.device_class,
    token: cfg.token,
  });
  const cloud = createCloudSession({
    store,
    transport: cloudTransport,
    clock: wallClock,
    device_class: cfg.device_class,
    token: cfg.token,
  });

  mesh.start();
  cloud.start();
  recordFirstSeen(); // reopened store may already hold a durable ledger (respawn)
  if (cfg.lan_role === "follower") sendReady(); // followers dial; no bind to await

  const sendReport = (): void => {
    recordFirstSeen();
    const st = store.status();
    const meshSt = mesh.status();
    const report: ChildReport = {
      type: "report",
      device_id: cfg.device_id,
      ledger: store
        .readAllEvents()
        .map((e) => ({ id: e.id, device_id: e.device_id, lamport_seq: e.lamport_seq })),
      fold_digest: JSON.stringify({
        orders: store.openOrders(),
        queue: store.kitchenQueue(),
        parked: store.parked(),
      }),
      status: {
        own_high_water: st.own_high_water,
        acked_watermark: st.acked_watermark,
        last_global_seq: st.last_global_seq,
        queue_depth: st.queue_depth,
      },
      quarantined: [...cloud.status().quarantined],
      mesh: { state: meshSt.state, hub_id: meshSt.hub_id },
      first_seen: [...firstSeen.entries()],
    };
    send(report);
  };

  let closing = false;
  const shutdown = (code: number): void => {
    if (closing) return;
    closing = true;
    clearInterval(poller);
    try {
      mesh.stop();
      cloud.stop();
      store.close();
    } finally {
      process.exit(code);
    }
  };

  process.on("message", (raw: unknown) => {
    const msg = raw as ParentCommand;
    try {
      switch (msg.cmd) {
        case "append": {
          if (msg.hold === true) {
            // Print-in-progress: freeze BEFORE the ledger write (print-then-record,
            // T-01-06 assumption 5). SIGKILL lands here → no kot.printed is ever
            // appended → the killed device's ledger stays gap-free (01-F2).
            send({ type: "holding", event_id: msg.event.id });
            return;
          }
          const envelope = store.append(msg.event);
          mesh.notifyAppended(); // 01-F15 fast path — LAN
          cloud.notifyAppended(); // and cloud
          recordFirstSeen();
          send({ type: "appended", event_id: envelope.id, lamport_seq: envelope.lamport_seq });
          return;
        }
        case "report":
          sendReport();
          return;
        case "shutdown":
          shutdown(0);
          return;
      }
    } catch (error) {
      send({ type: "fatal", message: error instanceof Error ? error.message : String(error) });
    }
  });

  process.on("SIGTERM", () => shutdown(0));
};

try {
  main();
} catch (error) {
  // A startup failure AFTER imports resolve (bad argv, store open) is reported so the
  // orchestrator surfaces it. An import-time failure (missing WS adapters) crashes
  // before this runs — that stderr IS the RED signal.
  send({ type: "fatal", message: error instanceof Error ? error.message : String(error) });
  process.exit(1);
}
