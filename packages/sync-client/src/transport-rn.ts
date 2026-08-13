/**
 * # The React-Native cloud transport — a `CloudTransport` over the platform WebSocket
 *
 * ⚠ **PROTECTED PATH (`20 §4.4`, commandment 10) — SENIOR REVIEW.**
 *
 * `transport-ws.ts`' own header has anticipated this file since T-01-06: *"Node stands in for the
 * Electron-main host at this rung (both LAN roles); **RN gets the platform WebSocket client at the
 * app wave**"*. This is that. It realises the same injected `CloudTransport` seam declared once in
 * `@restos/sync-protocol`, moves the same already-encoded `ProtocolMessage`s, and changes no wire
 * message.
 *
 * ## Why a phone gets the CLOUD path and not the LAN mesh (`05-F29`, `01-F15`)
 *
 * `createWsLanTransport` is a WebSocket **server** on `ws` plus `node:net` — React Native has a
 * client only, and no phone can accept an inbound socket on a shop LAN anyway. `05-F29` already
 * ruled the manager onto the cloud path; `05 §8`'s manager is off the premises as often as on it,
 * which is the case the rule is actually about. **This is not a `00 §5.1` breach:** that law is
 * about *in-branch* features, and the branch's own tills keep running on the LAN mesh whether or
 * not the manager's phone can see anything.
 *
 * ## Why the framing is always PLAIN
 *
 * The `hello` this transport carries never advertises `accepts_compression`, so
 * `negotiateCompression` yields `undefined` at both ends and no frame is ever zstd. That is not a
 * degradation invented here — it is the anti-stranding property `negotiateCompression` documents
 * (either side declining yields plain JSON for the life of the connection), and it is what lets
 * the whole kernel bundle for Hermes: zstd is `node:zlib`, which Metro cannot resolve.
 * `01-F14`'s catch-up budget is stated over 4G for a TILL restoring a branch stream; a manager's
 * console reads a queue that is already small. If that ever stops being true the answer is a real
 * RN compressor, not a `node:` import.
 *
 * ## What is NOT covered by any suite in this repository
 *
 * The socket. `18 §12` gives RN one tool (Maestro on the `00 §4` rig) and there is no rig, so no
 * assertion here or anywhere else proves a phone connects to a gateway. The `socket` factory is a
 * REQUIRED argument rather than a default reach for `globalThis.WebSocket` precisely so that this
 * file's logic — dial, reconnect, up/down edges, frame decode — is exercisable from Node against
 * a real server, and so that `seams:check` Rule B has nothing optional to go unsupplied.
 */
import type {
  Clock,
  CloudTransport,
  CloudTransportHandlers,
  ProtocolMessage,
} from "@restos/sync-protocol";
// The PORTABLE subpath, and it must stay that way: `@restos/sync-protocol`'s root entry reaches
// `compression.ts` and with it `node:zlib`, which Metro cannot resolve. See that file's header.
import { decodeMessage, encodeMessage } from "@restos/sync-protocol/messages";

/** Default cloud reconnect cadence — the same value `transport-ws.ts` uses, for the same reason. */
const DEFAULT_RECONNECT_MS = 1_000;

/** `WebSocket.OPEN`, as a literal: the platform constant is not reachable through the port type. */
const OPEN = 1;

/**
 * The slice of the WHATWG `WebSocket` React Native implements. Declared structurally so this
 * module depends on no platform typing: `apps/manager` is typechecked by its own program with
 * RN's globals, `packages/sync-client` by the root program with Node's, and the two disagree
 * about almost every DOM type.
 */
export type RnWebSocket = {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
};

export const createRnCloudTransport = (config: {
  url: string;
  clock: Clock;
  /** `(url) => new WebSocket(url)` on a phone. Injected — see the coverage note in the header. */
  socket: (url: string) => RnWebSocket;
  reconnect_ms?: number;
}): CloudTransport => {
  const { url, clock, socket: connect } = config;
  const reconnectMs = config.reconnect_ms ?? DEFAULT_RECONNECT_MS;

  let handlers: CloudTransportHandlers | null = null;
  let running = false;
  let live: RnWebSocket | null = null;
  /** Whether `onUp` is outstanding, so exactly one `onDown` follows it (mirrors `transport-ws.ts`). */
  let signaledUp = false;
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
    const ws = connect(url);
    live = ws;
    ws.onopen = () => {
      if (!running || live !== ws) return;
      signaledUp = true;
      handlers?.onUp(); // the cloud session hellos here
    };
    ws.onmessage = (event) => {
      if (!running || live !== ws) return;
      // RN delivers a text frame's payload as a string. A binary frame cannot arrive on this
      // connection: compression is never negotiated, so the gateway sends text only — and a
      // non-string payload is DROPPED rather than coerced, exactly as `transport-ws.ts` drops an
      // undecodable frame. A malformed frame must never take the session down (01-F17).
      if (typeof event.data !== "string") return;
      let message: ProtocolMessage;
      try {
        message = decodeMessage(event.data);
      } catch {
        return;
      }
      handlers?.onMessage(message);
    };
    ws.onerror = () => undefined; // `onclose` follows and drives onDown + reconnect
    ws.onclose = () => {
      if (live === ws) live = null;
      if (signaledUp) {
        signaledUp = false;
        handlers?.onDown();
      }
      scheduleReconnect(); // resume when the gateway re-listens
    };
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
      const ws = live;
      live = null;
      signaledUp = false;
      handlers = null;
      ws?.close();
    },

    send(message) {
      if (live === null || live.readyState !== OPEN) return; // dropped while down, as on the WS side
      // ⚠ **THE TRANSPORT OWNS FRAMING, SO IT CORRECTS THE ADVERTISEMENT IT CANNOT HONOUR.**
      // `cloud-session.ts:224` hardcodes `accepts_compression: true` with the comment *"advertise
      // that this BUILD can decode compressed frames"* — true of every host it had when it was
      // written, and false here: decoding zstd is `node:zlib`, which is exactly what this platform
      // cannot load. Leaving it would make the gateway grant compression (`gateway.ts:462`) and
      // send binary frames this transport drops, so the device would connect, hello, and then
      // silently receive nothing — the worst available failure.
      //
      // Corrected HERE rather than by adding an option to `createCloudSession` because
      // DEC-SYNC-010 puts the negotiation in the transport by design (`transport-ws.ts` reads this
      // same field off the same outbound hello to decide whether a grant may be honoured), and
      // because advertising LESS is always safe — that is `negotiateCompression`'s own
      // anti-stranding property, not a new rule.
      const framed =
        message.kind === "hello" ? { ...message, accepts_compression: false } : message;
      live.send(encodeMessage(framed));
    },
  };
};
