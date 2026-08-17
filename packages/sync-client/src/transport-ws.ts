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
import { createHash, X509Certificate } from "node:crypto";
import { createServer as createHttpsServer, type Server as HttpsServer } from "node:https";
import type { AddressInfo } from "node:net";
import {
  type Clock,
  type CloudTransport,
  type CloudTransportHandlers,
  createFrameCodec,
  type FrameCodec,
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
/**
 * Retry cadence after an ADMISSION refusal, as distinct from a connection failure.
 *
 * ⚠ Found and MEASURED by the `20 §4.4` review lane: a peer whose roster and ours disagree
 * redialled at `LAN_DIAL_RETRY_MS` for ever — 20 `onPeerVisible`/`onPeerLost` pairs in 5 s at the
 * acceptor, which is ~8 `recompute()`/`electHub` runs a second on the Electron main process,
 * indefinitely, from one mis-rostered device. Roster skew is ORDINARY (a newly paired peer, a
 * rotated certificate, a revocation applied at one end first), so this is a normal state and not
 * an exotic one.
 *
 * The two cases want different cadences and that is the whole point: a REFUSED connection means
 * "not up yet", where 250 ms is right and the peer is expected imminently; a REFUSED ADMISSION
 * means "we disagree about who you are", which no amount of retrying fixes — it is fixed by a
 * roster update, and a roster update calls `revalidate` and re-dials anyway. Backing off does not
 * delay recovery; it stops a disagreement being a busy-loop.
 */
const LAN_ADMISSION_RETRY_MS = 5_000;
/**
 * Every interface, because `01-F12` places discovery ON THE LAN and a branch's devices are separate
 * machines. Not exported, and deliberately not shared with `@restos/device-config`'s
 * `DEFAULT_LAN_LISTEN_HOST`: this package is the kernel and must not depend on the app-host
 * configuration layer. The two shipped hosts always pass `listen_host` explicitly (it comes out of
 * `resolveLanMesh`), so this value is the answer for a caller that supplies nothing — today only
 * the T-01-06 spike — and never the one a till runs on.
 */
const DEFAULT_LISTEN_HOST = "0.0.0.0";

/** ws delivers a received frame as Buffer | ArrayBuffer | Buffer[]; normalize to text. */
const rawToText = (raw: RawData): string =>
  Buffer.isBuffer(raw)
    ? raw.toString("utf8")
    : Array.isArray(raw)
      ? Buffer.concat(raw).toString("utf8")
      : Buffer.from(raw).toString("utf8");

/** Raw ws payload as bytes — the binary half of the T-01-19 framing distinction. */
const toBytes = (raw: RawData): Uint8Array =>
  Buffer.isBuffer(raw)
    ? new Uint8Array(raw)
    : Array.isArray(raw)
      ? new Uint8Array(Buffer.concat(raw))
      : new Uint8Array(Buffer.from(raw as ArrayBuffer));

// ── LAN transport ────────────────────────────────────────────────────────────
// A single mutually-authenticated WebSocket per peer, used bidirectionally: the dialer and the
// acceptor both talk over it. Every payload is a wire ProtocolMessage — the PROTOCOL.md closed set
// stays untouched (T-01-06 contract (f)) and this adapter still adds no message kind.
//
// (This paragraph used to describe an out-of-band `PeerInfo` announce sharing the connection with
// wire messages, "distinguished by `t`". See `LanFrame` for why that frame is gone.)
/**
 * The one frame kind left on this wire.
 *
 * ⚠ **The `announce` frame is GONE (`01-F72` (b), August 2026).** It carried
 * `{device_id, device_class}` and the transport believed it: `socketDevice.set(ws, info.device_id)`
 * meant a peer's identity was whatever it typed, and `device_class` — which `01-F39` makes hub
 * eligibility turn on — was self-declared, so anything on the shop Wi-Fi could announce itself
 * `counter_electron` and win the election. Both facts now come from the peer CERTIFICATE and the
 * roster it is pinned in, established during the TLS handshake before a byte of application data
 * moves. Deleting the frame is the fix; validating it harder would have kept a self-declared
 * identity and made it look defended.
 *
 * The discriminant survives with exactly one member so the shape can grow again without a format
 * change. Identity does not come through it and may never again.
 */
type LanFrame = { t: "wire"; message: ProtocolMessage };

/**
 * `01-F73` — this device's own LAN credential. All three are PEM.
 *
 * The private key is generated on-device at pairing and never leaves it, so this type is only
 * ever populated from local storage — nothing in this package transmits `key`, and nothing may.
 */
export type LanCredential = {
  readonly cert: string;
  readonly key: string;
  /** The org's LAN issuer (`01-F73` (b)) — the chain half of `01-F74` (c)'s two-part test. */
  readonly ca: string;
};

/**
 * `01-F74` — the admission seam.
 *
 * **Required, never optional**, and that is the load-bearing property of this whole change: an
 * optional credential is a credential a host can forget, and a host forgetting it is precisely
 * what shipped (both Electron apps passed the literal `"lan-member-unauthenticated"`). A required
 * parameter makes an unauthenticated LAN transport *unconstructable* rather than merely
 * discouraged — which is also why it is not the kind of seam `seams:check` Rule B can miss.
 */
export type LanAdmission = {
  readonly credential: LanCredential;
  /**
   * The decision, given the lowercase-hex SHA-256 of the peer certificate's DER. `null` refuses.
   * Backed by `lan-roster.ts`; declared here as a function so this module depends on the
   * *decision*, never on the store that makes it.
   */
  admit(cert_sha256: string): PeerInfo | null;
  /**
   * `01-F74` (e) — *"the authority drops the peer's session on applying it rather than at that
   * peer's next voluntary contact"*. Called when the roster has changed; the transport re-runs
   * `admit` for every live socket and closes the ones now refused.
   *
   * **Required, for the same reason `credential` is.** An optional eviction hook is one a host
   * forgets, and the failure is invisible: everything keeps working, revocation just silently
   * stops taking effect until a restart. That is `01-F48`'s bound quietly becoming unbounded —
   * the shape of the very defect this FR was written against. Returns its unsubscribe.
   */
  subscribe(listener: () => void): () => void;
};

/** Lowercase hex SHA-256 of a DER certificate — the roster's key on both sides of the wire. */
const fingerprintOf = (der: Buffer): string => createHash("sha256").update(der).digest("hex");

/**
 * The `CN` of a certificate's subject, parsed from the DER.
 *
 * ⚠ **NOT `getPeerCertificate().subject.CN`, and that is a measurement rather than a preference.**
 * Node's legacy peer-certificate object mis-splits a multi-attribute DN: for a certificate whose
 * subject is `CN=b,OU=branch-test,O=org-test` it reports `{ CN: "b,OU=branch-test", O: "org-test" }`
 * — the `CN` silently carries the next attribute with it. A comparison against that field is
 * therefore false for every real certificate this product issues, which is a fail-CLOSED bug and
 * so would have looked like "authentication is working" while refusing the whole branch.
 * `X509Certificate` is the modern parser and returns one attribute per line.
 */
const subjectCommonName = (der: Buffer): string | null => {
  try {
    const line = new X509Certificate(der).subject
      .split("\n")
      .find((entry) => entry.startsWith("CN="));
    return line === undefined ? null : line.slice(3);
  } catch {
    // Unparseable DER cannot be trusted, and it must not throw into the handshake path
    // (`01-F17`): a peer that can crash the till by presenting a malformed certificate is a
    // worse defect than the one this check closes.
    return null;
  }
};

/**
 * The authenticated identity behind a socket, or `null` to refuse.
 *
 * ⚠ **`getPeerCertificate()` returns `{}` — not `undefined` — when there is no peer certificate**,
 * so a truthiness check on the object admits an anonymous peer. The `raw` buffer is what is
 * actually tested here, and its absence is a refusal.
 */
const peerFromSocket = (
  socket: { getPeerCertificate?: (d?: boolean) => { raw?: Buffer } | null },
  admission: LanAdmission,
): { peer: PeerInfo; fingerprint: string } | null => {
  const der = socket.getPeerCertificate?.()?.raw;
  if (der === undefined || der.length === 0) return null;
  const fingerprint = fingerprintOf(der);
  const peer = admission.admit(fingerprint);
  if (peer === null) return null;
  /**
   * `01-F72` (b) says the session's identity is the PEER CERTIFICATE's subject, and the roster
   * lookup alone does not read it — so `device_id` was written twice (the `CN` the issuer signed,
   * and the roster row beside the fingerprint) with nothing comparing them. Found by the
   * `20 §4.4` review lane, and it is the same two-writes-of-one-fact this change cites to justify
   * keeping `device_class` OUT of the certificate.
   *
   * The cost of the mismatch is not cosmetic: a roster builder that mis-joins one fingerprint to
   * another device's row makes this transport attribute one till's `push` and `event_batch` to a
   * different origin — `01-F3` attribution and `01-F8`'s per-origin checkpoint both wrong,
   * permanently, in an append-only ledger (`01-F1`), with every gate green.
   *
   * Refusing rather than preferring one: the two disagree, this device cannot know which is
   * right, and admitting under either is admitting an identity nobody vouched for twice.
   */
  if (subjectCommonName(der) !== peer.device_id) return null;
  return { peer, fingerprint };
};

/**
 * ⚠ `self` is GONE (August 2026). Its only use was building the `announce` frame, which is
 * deleted — this device's identity now reaches a peer as its CERTIFICATE, which the peer
 * resolves through its own roster. Keeping the field would have meant a device still declaring
 * an identity nobody reads, and the next reader would reasonably assume something used it.
 */
export const createWsLanTransport = (config: {
  listen_port: number;
  /**
   * The interface to bind the listen socket to. Defaults to every interface (`0.0.0.0`) because
   * `01-F12` places discovery **on the LAN**.
   *
   * ⚠ **PROTECTED PATH CHANGE, August 2026 (`20 §4.4` — review lane).** This argument did not
   * exist and the bind was the literal `"127.0.0.1"`, which made the whole LAN leg unreachable from
   * any other machine: measured with a control, a `127.0.0.1` listener refuses a connection to its
   * own host's LAN IPv4 with `ECONNREFUSED` while the identical listener on `0.0.0.0` accepts it.
   * Nothing caught it because the only construction of this transport was a spike that runs every
   * "device" as a child process of one box, where loopback is indistinguishable from a LAN. A
   * branch's counter and its pass screen are always two machines, so `01-F13`'s star could not
   * form.
   *
   * The change is additive: every existing call site keeps working, and the DEFAULT is the LAN
   * rather than loopback on purpose — a default of `127.0.0.1` would silently reproduce the defect
   * in the next host that forgets the argument, and the failure mode is a mesh that starts, reports
   * itself listening, and is never reached.
   *
   * ⚠ Binding every interface is only safe **because** admission is mutual TLS against a pinned
   * roster (`01-F72`). Before that, this default put an unauthenticated read-write port onto the
   * branch money ledger on every interface. The two lines belong together and must move together.
   */
  listen_host?: string;
  peers: { device_id: string; host: string; port: number }[];
  clock: Clock;
  /** `01-F72`/`01-F74`. REQUIRED — see `LanAdmission`. */
  admission: LanAdmission;
  on_listening?: (port: number) => void;
}): MeshTransport => {
  const { listen_port, peers, clock, admission } = config;
  const listenHost = config.listen_host ?? DEFAULT_LISTEN_HOST;
  const { cert, key, ca } = admission.credential;

  let handlers: TransportHandlers | null = null;
  let running = false;
  let server: WebSocketServer | null = null;
  let httpsServer: HttpsServer | null = null;
  // The live socket to reach each peer, keyed by its CERTIFIED device_id.
  const peerSockets = new Map<string, WebSocket>();
  // Every open/pending socket (dialed or accepted) — closed en masse on stop().
  const liveSockets = new Set<WebSocket>();
  const dialTimers = new Set<ReturnType<Clock["setTimeout"]>>();
  /**
   * Live sockets and the WHOLE admission verdict each was adopted under — the fingerprint it was
   * pinned on and the identity that pin resolved to.
   *
   * ⚠ **The verdict, not just the fingerprint, and a probe is why.** This held the fingerprint
   * alone, so `revalidate` re-asked only *"is this certificate still admissible"*. `applyDelta`
   * deliberately supports handing one certificate from a retired `device_id` to a new one
   * (removals run before upserts precisely so that is expressible), and after such a delta the
   * live socket was KEPT while `admit` had begun answering with a different device: measured, a
   * ping arriving after the delta was attributed to a `device_id` the roster no longer contained
   * at all, while a FRESH handshake with the same certificate was refused. That asymmetry is the
   * `01-F3`/`01-F8` mis-attribution the CN check exists to prevent, surviving a roster change —
   * one till's events landing under another origin's identity, permanently, in an append-only
   * ledger. `device_class` had the same shape: captured at admission, never refreshed, so
   * `electHub` could run on a class `01-F39` no longer assigns.
   */
  const socketAdmission = new Map<WebSocket, { fingerprint: string; peer: PeerInfo }>();
  let unsubscribeRoster: (() => void) | null = null;

  /**
   * `01-F74` (e). Re-ask admission for every live socket and close the refused ones — a device
   * revoked mid-service loses its session now, not at its next voluntary contact.
   *
   * The peer's own `close` handler does the bookkeeping and fires `onPeerLost`, so the session
   * learns about it through the path it already handles. That is why this needs no session
   * change at all: eviction and an unplugged network cable look identical from above, which is
   * exactly right — both mean "that device is no longer reachable on this branch".
   */
  const revalidate = (): void => {
    for (const [ws, adopted] of [...socketAdmission]) {
      const now = admission.admit(adopted.fingerprint);
      // Refused outright, OR still admissible under a DIFFERENT identity or class than the one
      // this socket was adopted under. The second is not a weaker case than the first: a session
      // whose identity changed underneath it is attributing events to the wrong origin, which is
      // worse than one that was simply cut off.
      if (
        now === null ||
        now.device_id !== adopted.peer.device_id ||
        now.device_class !== adopted.peer.device_class
      ) {
        ws.close();
      }
    }
  };

  /**
   * Adopt an ADMITTED socket. Called only after the peer's certificate has been resolved through
   * the roster, so `peer` is certified and `wireSocket` never learns an identity from the wire.
   */
  const wireSocket = (
    ws: WebSocket,
    peer: PeerInfo,
    fingerprint: string,
    redial: (() => void) | null,
  ): void => {
    liveSockets.add(ws);
    socketAdmission.set(ws, { fingerprint, peer });
    peerSockets.set(peer.device_id, ws);
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
      if ((frame as { t: unknown }).t !== "wire") return;
      let message: ProtocolMessage;
      try {
        message = parseMessage((frame as { message?: unknown }).message);
      } catch {
        return; // a malformed wire message is dropped, never handed up (K-02)
      }
      // `from` is the CERTIFIED identity. Nothing in the frame can change it, which is what
      // closes the forged-origin class across every session arm at once (`01-F72` (b)).
      handlers?.onMessage(peer.device_id, message);
    });
    // 'error' is always followed by 'close' for ws — swallow so Node doesn't throw.
    ws.on("error", () => undefined);
    ws.on("close", () => {
      liveSockets.delete(ws);
      socketAdmission.delete(ws);
      if (peerSockets.get(peer.device_id) === ws) {
        peerSockets.delete(peer.device_id);
        handlers?.onPeerLost(peer.device_id); // visibility loss (socket closed)
      }
      if (redial !== null && running) redial();
    });
    handlers?.onPeerVisible(peer);
  };

  const dialPeer = (peer: { device_id: string; host: string; port: number }): void => {
    if (!running) return;
    const ws = new WebSocket(`wss://${peer.host}:${peer.port}`, {
      cert,
      key,
      ca: [ca],
      /**
       * A branch LAN has no DNS and no stable hostnames — devices are reached by IP out of
       * `@restos/device-config`. Hostname verification would therefore fail on every legitimate
       * connection, and the identity check it would have performed is done properly below,
       * against the roster, on the certificate itself. Skipping it here is not a weakening: a
       * hostname proves nothing about a device, and the fingerprint proves everything.
       *
       * ⚠ **THE CAST IS LOAD-BEARING AND THE PUBLISHED TYPE IS WRONG.** `@types/ws` declares
       * this returning `boolean`; Node's `tls` treats ANY truthy return as the verification
       * ERROR. Returning `true` to satisfy the type therefore refuses every connection —
       * measured on a real `wss` server: with `() => true` both a rostered peer and an
       * unrostered one failed identically, `ECONNRESET` at the acceptor, which reads as a
       * network fault rather than as a type mistake. `undefined` is the correct runtime value;
       * the cast moves the lie to the TYPE, where it is visible, instead of to the behaviour.
       */
      checkServerIdentity: (() => undefined) as unknown as (s: string, c: unknown) => boolean,
    });
    const redial = (afterRefusal = false): void => {
      const timer = clock.setTimeout(
        () => {
          dialTimers.delete(timer);
          dialPeer(peer); // retry on drop / refused connection (01-F12 fallback dial loop)
        },
        afterRefusal ? LAN_ADMISSION_RETRY_MS : LAN_DIAL_RETRY_MS,
      );
      dialTimers.add(timer);
    };
    /**
     * The upgrade response carries the TLS socket, which is where the SERVER's certificate is.
     * The dialer authenticates the acceptor here — `01-F72` says *mutually*, and a client that
     * only proved itself would happily hand its branch's events to any listener holding a
     * roster-issued cert for some other device.
     *
     * ⚠ `configured` peers name a `device_id`; this deliberately does NOT check that the
     * certified id equals it. A branch that re-images a till gets a new `device_id`
     * (`01-N5`/`01-F64`) while `device-config` may still name the old one, and refusing there
     * would take the LAN down over a configuration lag. The roster is the authority on WHO may
     * be admitted; the peer list is only where to look.
     */
    let certified: { peer: PeerInfo; fingerprint: string } | null = null;
    ws.on("upgrade", (res: { socket: unknown }) => {
      certified = peerFromSocket(res.socket as Parameters<typeof peerFromSocket>[0], admission);
    });
    ws.on("open", () => {
      if (certified === null) {
        // Refused: the acceptor is not in this device's roster. Closing rather than throwing —
        // 01-F17: nothing about the LAN may take the till down. The close handler backs off.
        ws.close();
        return;
      }
      wireSocket(ws, certified.peer, certified.fingerprint, redial);
    });
    // A handshake the acceptor refuses lands here (its fatal alert), never in `open`. Both
    // outcomes must redial: a peer that was revoked may be re-admitted, and a peer that was
    // simply not up yet certainly will be.
    ws.on("error", () => undefined);
    ws.on("close", () => {
      // `certified === null` covers both refusal directions: this device refused the acceptor
      // (above), and the acceptor refused this device — which under TLS 1.3 arrives as a fatal
      // alert AFTER our handshake completed, so it reaches us as a close and never as an `open`
      // (`01-F72` (e·i)). Both are disagreements, not outages, and both back off.
      if (certified === null && running) redial(true);
    });
  };

  return {
    start(h) {
      if (running) return;
      running = true;
      handlers = h;
      // Node's net server sets SO_REUSEADDR by default, so the freed port rebinds
      // promptly after a SIGKILL+respawn (X10) — the listen socket the contract needs.
      //
      // `requestCert` + `rejectUnauthorized` are the CHAIN half of `01-F74` (c); the roster
      // fingerprint pin below is the other half, and neither may be dropped as redundant. The
      // chain alone admits anything the issuer ever signed, including a device revoked an hour
      // ago — there is no CRL on a branch LAN and there is not going to be.
      const https = createHttpsServer({
        cert,
        key,
        ca: [ca],
        requestCert: true,
        rejectUnauthorized: true,
      });
      httpsServer = https;
      const wss = new WebSocketServer({ server: https });
      server = wss;
      wss.on("connection", (ws: WebSocket, req: { socket: unknown }) => {
        const peer = peerFromSocket(req.socket as Parameters<typeof peerFromSocket>[0], admission);
        if (peer === null) {
          ws.close(); // not in the roster, or revoked in it — accepted sockets never redial
          return;
        }
        wireSocket(ws, peer.peer, peer.fingerprint, null); // the dialer owns retry
      });
      wss.on("error", () => undefined);
      // A refused handshake reaches the HTTPS server, not the ws server. Swallowed for
      // `01-F17`'s reason and because it is the EXPECTED path for an unrostered device: an
      // attacker on the shop Wi-Fi must not be able to crash the till by dialling it.
      https.on("tlsClientError", () => undefined);
      https.on("error", () => undefined);
      https.on("listening", () => config.on_listening?.((https.address() as AddressInfo).port));
      https.listen(listen_port, listenHost);
      // 01-F74 (e): a roster change re-asks admission for every live socket.
      unsubscribeRoster = admission.subscribe(revalidate);
      for (const peer of peers) dialPeer(peer);
    },

    stop() {
      if (!running) return;
      running = false;
      handlers = null; // no onPeerLost / onMessage after stop
      unsubscribeRoster?.();
      unsubscribeRoster = null;
      for (const timer of dialTimers) clock.clearTimeout(timer);
      dialTimers.clear();
      for (const ws of liveSockets) ws.close();
      liveSockets.clear();
      peerSockets.clear();
      socketAdmission.clear();
      server?.close();
      server = null;
      httpsServer?.close();
      httpsServer = null;
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
  /**
   * @unreached-by-design A TUNING DEFAULT, not a capability. `DEFAULT_RECONNECT_MS` is the right
   * value for every host we have, and an unsupplied default is only a defect when omitting it
   * silently drops a REQUIREMENT — which is `createSpooler({ store })`'s case (`03-F4`'s crash
   * clause) and not this one. The distinction is the reason this opt-out exists per property.
   */
  reconnect_ms?: number;
}): CloudTransport => {
  const { url, clock } = config;
  const reconnectMs = config.reconnect_ms ?? DEFAULT_RECONNECT_MS;

  let handlers: CloudTransportHandlers | null = null;
  let running = false;
  let socket: WebSocket | null = null;
  let signaledUp = false; // whether onUp is currently outstanding (drives a single onDown)
  // PER-CONNECTION framing (DEC-SYNC-010, T-01-19), owned BELOW the session and reset
  // on every dial. Learned from messages already passing through this transport — the
  // outbound hello's advertisement and the inbound ack's grant — so there is no config
  // key and no new seam. `advertised` is what makes the opt-in mutual on this side: a
  // grant we never asked for is ignored rather than trusted.
  let advertised = false;
  let codec: FrameCodec = createFrameCodec(undefined);
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
    // Reset the negotiation on EVERY dial — that is what "per connection" means: a
    // redial re-negotiates rather than inheriting a grant the new peer may not honour.
    advertised = false;
    codec = createFrameCodec(undefined);
    ws.on("open", () => {
      if (!running || socket !== ws) return;
      signaledUp = true;
      handlers?.onUp(); // the cloud session hellos here
    });
    ws.on("message", (raw: RawData, isBinary: boolean) => {
      if (!running || socket !== ws) return;
      let message: ProtocolMessage;
      try {
        // The TRANSPORT's own text/binary distinction carries the framing — the frame's
        // contents never do. Sniffing the zstd magic number would make the wire format
        // depend on the message rather than the handshake, and a peer that can decode
        // a compressed frame today may not after a rollback.
        message = codec.decode(isBinary ? toBytes(raw) : rawToText(raw));
      } catch {
        return;
      }
      // Adopt the grant only if WE advertised: both ends opt in, so a grant we never
      // asked for is ignored rather than trusted.
      if (message.kind === "hello_ack" && advertised && message.compression !== undefined) {
        codec = createFrameCodec(message.compression);
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
      // Note what WE advertised, so an unsolicited grant can be ignored above.
      if (message.kind === "hello") advertised = message.accepts_compression === true;
      const frame = codec.encode(message);
      // `string` ⇒ text frame, `Uint8Array` ⇒ binary. ws infers this from the argument
      // type, which is exactly the distinction the receiving end reads back off
      // `isBinary` — one contract, both directions.
      socket.send(frame);
    },
  };
};
