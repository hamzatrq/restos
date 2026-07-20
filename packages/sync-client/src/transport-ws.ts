// Real WebSocket transport adapters (T-01-06 contract (f); 01-F12/F15; resolves
// 01 §9.1 — plain WebSocket). Two adapters over the `ws` package (18 §14 registry)
// realizing the injected MeshTransport / CloudTransport seams declared once in
// @restos/sync-protocol (transport.ts) — consumed as-is, NO wire-message changes.
// PROTECTED PATH (20 §4.4): additive only — the mesh/cloud sessions, folds, and the
// store are untouched; these adapters only move already-encoded ProtocolMessages
// over real sockets. Node stands in for the Electron-main host at this rung (both
// LAN roles); RN gets the platform WebSocket client at the app wave.
//
// Determinism is NOT required here (real time, real sockets) — the sim leg's virtual
// clock owns that. All time still flows through the injected Clock so dial/reconnect
// retries are driven by the wallClock adapter (X10) and never by bare timers.
import type { AddressInfo } from "node:net";
import {
  type Clock,
  type CloudTransport,
  type CloudTransportHandlers,
  decodeMessage,
  encodeMessage,
  type MeshTransport,
  type PeerInfo,
  type ProtocolMessage,
  parseMessage,
  type TransportHandlers,
} from "@restos/sync-protocol";
import { type RawData, WebSocket, WebSocketServer } from "ws";

/** Default cloud reconnect cadence (contract (f)); a gateway that re-listens resumes. */
const DEFAULT_RECONNECT_MS = 1_000;
/** LAN dial-retry cadence — fast enough to reconnect to a respawned hub promptly (X10). */
const LAN_DIAL_RETRY_MS = 250;

/** ws delivers a received frame as Buffer | ArrayBuffer | Buffer[]; normalize to text. */
const rawToText = (raw: RawData): string =>
  Buffer.isBuffer(raw)
    ? raw.toString("utf8")
    : Array.isArray(raw)
      ? Buffer.concat(raw).toString("utf8")
      : Buffer.from(raw).toString("utf8");

// ── LAN transport ────────────────────────────────────────────────────────────
// Every socket payload is wrapped so a transport-level PeerInfo announce (out-of-band,
// NOT a PROTOCOL.md message — the closed set stays untouched, T-01-06 contract (f))
// and a wire ProtocolMessage share one connection, distinguished by `t`. A single
// WebSocket is used bidirectionally: the dialer and the acceptor both talk over it.
type LanFrame = { t: "announce"; peer: PeerInfo } | { t: "wire"; message: ProtocolMessage };

export const createWsLanTransport = (config: {
  self: PeerInfo;
  listen_port: number;
  peers: { device_id: string; host: string; port: number }[];
  clock: Clock;
  on_listening?: (port: number) => void;
}): MeshTransport => {
  const { self, listen_port, peers, clock } = config;

  let handlers: TransportHandlers | null = null;
  let running = false;
  let server: WebSocketServer | null = null;
  // The live socket to reach each peer, keyed by its ANNOUNCED device_id.
  const peerSockets = new Map<string, WebSocket>();
  // Every open/pending socket (dialed or accepted) — closed en masse on stop().
  const liveSockets = new Set<WebSocket>();
  // Per-socket remote device_id, learned when its announce frame lands.
  const socketDevice = new Map<WebSocket, string>();
  const dialTimers = new Set<ReturnType<Clock["setTimeout"]>>();

  const announceFrame = JSON.stringify({ t: "announce", peer: self } satisfies LanFrame);

  const wireSocket = (ws: WebSocket, redial: (() => void) | null): void => {
    liveSockets.add(ws);
    ws.on("message", (raw: RawData) => {
      let frame: unknown;
      try {
        frame = JSON.parse(rawToText(raw));
      } catch {
        return; // an unparseable frame never crashes the transport
      }
      // A parseable non-object (null, array, number) or a discriminant-less frame is
      // dropped, never dereferenced — a malformed LAN frame must never crash (K-02, 01-F12).
      if (frame === null || typeof frame !== "object" || Array.isArray(frame) || !("t" in frame)) {
        return;
      }
      const kind = (frame as { t: unknown }).t;
      if (kind === "announce") {
        const peer = (frame as { peer?: unknown }).peer;
        if (
          peer === null ||
          typeof peer !== "object" ||
          typeof (peer as { device_id?: unknown }).device_id !== "string" ||
          typeof (peer as { device_class?: unknown }).device_class !== "string"
        ) {
          return; // an unvalidated PeerInfo announce is dropped, never trusted
        }
        const info = peer as PeerInfo;
        socketDevice.set(ws, info.device_id);
        peerSockets.set(info.device_id, ws);
        handlers?.onPeerVisible(info);
        return;
      }
      if (kind !== "wire") return;
      const from = socketDevice.get(ws);
      if (from === undefined) return;
      let message: ProtocolMessage;
      try {
        message = parseMessage((frame as { message?: unknown }).message);
      } catch {
        return; // a malformed wire message is dropped, never handed up (K-02)
      }
      handlers?.onMessage(from, message);
    });
    // 'error' is always followed by 'close' for ws — swallow so Node doesn't throw.
    ws.on("error", () => undefined);
    ws.on("close", () => {
      liveSockets.delete(ws);
      const device_id = socketDevice.get(ws);
      socketDevice.delete(ws);
      if (device_id !== undefined && peerSockets.get(device_id) === ws) {
        peerSockets.delete(device_id);
        handlers?.onPeerLost(device_id); // visibility loss (socket closed)
      }
      if (redial !== null && running) redial();
    });
  };

  const dialPeer = (peer: { device_id: string; host: string; port: number }): void => {
    if (!running) return;
    const ws = new WebSocket(`ws://${peer.host}:${peer.port}`);
    const redial = (): void => {
      const timer = clock.setTimeout(() => {
        dialTimers.delete(timer);
        dialPeer(peer); // retry on drop / refused connection (01-F12 fallback dial loop)
      }, LAN_DIAL_RETRY_MS);
      dialTimers.add(timer);
    };
    ws.on("open", () => ws.send(announceFrame)); // announce our identity on connect
    wireSocket(ws, redial);
  };

  return {
    start(h) {
      if (running) return;
      running = true;
      handlers = h;
      // Node's net server sets SO_REUSEADDR by default, so the freed port rebinds
      // promptly after a SIGKILL+respawn (X10) — the listen socket the contract needs.
      const wss = new WebSocketServer({ port: listen_port, host: "127.0.0.1" });
      server = wss;
      wss.on("connection", (ws: WebSocket) => {
        ws.send(announceFrame); // announce to the dialer, then talk bidirectionally
        wireSocket(ws, null); // accepted sockets never redial — the dialer owns retry
      });
      wss.on("error", () => undefined);
      wss.on("listening", () => config.on_listening?.((wss.address() as AddressInfo).port));
      for (const peer of peers) dialPeer(peer);
    },

    stop() {
      if (!running) return;
      running = false;
      handlers = null; // no onPeerLost / onMessage after stop
      for (const timer of dialTimers) clock.clearTimeout(timer);
      dialTimers.clear();
      for (const ws of liveSockets) ws.close();
      liveSockets.clear();
      peerSockets.clear();
      socketDevice.clear();
      server?.close();
      server = null;
    },

    send(to, message) {
      const ws = peerSockets.get(to);
      if (ws === undefined || ws.readyState !== WebSocket.OPEN) return; // fire-and-forget
      ws.send(JSON.stringify({ t: "wire", message } satisfies LanFrame));
    },
  };
};

// ── Cloud transport ──────────────────────────────────────────────────────────
// Dials the gateway /sync route; onUp on open, onDown on close/error, timer-based
// reconnect through the injected Clock so a gateway that closes and re-listens on the
// same port is resumed (re-hello + catchup). Wire codec is the sync-protocol codec —
// the exact frames the gateway's ws adapter (services/sync-gateway/src/server.ts)
// encodes/decodes.
export const createWsCloudTransport = (config: {
  url: string;
  clock: Clock;
  reconnect_ms?: number;
}): CloudTransport => {
  const { url, clock } = config;
  const reconnectMs = config.reconnect_ms ?? DEFAULT_RECONNECT_MS;

  let handlers: CloudTransportHandlers | null = null;
  let running = false;
  let socket: WebSocket | null = null;
  let signaledUp = false; // whether onUp is currently outstanding (drives a single onDown)
  let reconnectTimer: ReturnType<Clock["setTimeout"]> | null = null;

  const scheduleReconnect = (): void => {
    if (!running || reconnectTimer !== null) return;
    reconnectTimer = clock.setTimeout(() => {
      reconnectTimer = null;
      dial();
    }, reconnectMs);
  };

  const dial = (): void => {
    if (!running) return;
    const ws = new WebSocket(url);
    socket = ws;
    ws.on("open", () => {
      if (!running || socket !== ws) return;
      signaledUp = true;
      handlers?.onUp(); // the cloud session hellos here
    });
    ws.on("message", (raw: RawData) => {
      if (!running || socket !== ws) return;
      let message: ProtocolMessage;
      try {
        message = decodeMessage(rawToText(raw));
      } catch {
        return;
      }
      handlers?.onMessage(message);
    });
    ws.on("error", () => undefined); // 'close' follows and drives onDown + reconnect
    ws.on("close", () => {
      if (socket === ws) socket = null;
      if (signaledUp) {
        signaledUp = false;
        handlers?.onDown();
      }
      scheduleReconnect(); // resume when the gateway re-listens
    });
  };

  return {
    start(h) {
      if (running) return;
      running = true;
      handlers = h;
      dial();
    },

    stop() {
      if (!running) return;
      running = false;
      if (reconnectTimer !== null) {
        clock.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      const ws = socket;
      socket = null;
      signaledUp = false;
      handlers = null;
      ws?.close();
    },

    send(message) {
      if (socket === null || socket.readyState !== WebSocket.OPEN) return; // dropped while down
      socket.send(encodeMessage(message));
    },
  };
};
