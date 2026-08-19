// ACCEPTANCE — external-audit **K-02** (`01-F12`, `01-F17`): **A MALFORMED LAN FRAME MUST NEVER
// CRASH THE TRANSPORT.** This is the only assertion of that property in the repo.
//
// ⚠ **PROTECTED PATH (`20 §4.4`, commandment 10): `packages/sync-client`.**
//
// It drives the REAL `createWsLanTransport` over a REAL socket (never the sim bus), so the guard
// covers the production `wireSocket()` path rather than a re-statement of it.
//
// ── WHAT `01-F72` DID TO THIS FILE, AND WHY IT IS A REPAIR RATHER THAN A REWRITE ────────────────
//
// This suite was authored against a plaintext `ws://` LAN whose peers introduced themselves with an
// `announce` frame. `01-F72` (August 2026) made the branch LAN mutually authenticated: the
// transport listens on `wss://` with `requestCert` and a fingerprint-pinned roster, and the
// `announce` frame is DELETED because identity now comes from the peer CERTIFICATE. Two
// consequences, both structural:
//
//   1. A plain `ws://` dial no longer reaches the message handler at all — it dies at `socket hang
//      up`, in the handshake, before a single malformed byte is delivered. The suite was RED and
//      the property it owns was guarded by NOTHING.
//   2. The last assertion required an **unauthenticated** client's `announce` to register peer
//      `"x"` — precisely the forgery `01-F72` (b) exists to stop. It is retired in §E, in the open,
//      never deleted (see §E's own note).
//
// **The property is unchanged and so is its point.** `01-F72` narrows WHO may send us a frame; it
// says nothing about WHAT they may send. A peer we have admitted — a real till, holding a real
// certificate, pinned in our own roster — can still send us rubbish: a half-flushed frame from a
// till whose power failed mid-write, a build one protocol version apart, a corrupted payload off a
// flaky shop Wi-Fi. `01-F17` is absolute about the consequence: **a sale is never blocked**, and a
// till that dies on a neighbour's bad frame is a till that has stopped selling. So every frame
// below now arrives over an ADMITTED mTLS socket, which is the only kind of socket that exists.
//
// ── THE AUTHORITIES, quoted ────────────────────────────────────────────────────────────────────
//
//   01-F12     "Devices in a branch discover each other on the LAN … and exchange events directly
//              while WAN is down."
//   01-F17     "A sale is never blocked" — not by inventory math, sync, or approval timeouts.
//   01-F72 (b) "The mechanism is mutual TLS, and the session's device identity is the PEER
//              CERTIFICATE's subject — never a `device_id` read from a frame."
//   01-F72 (e) "It never blocks a sale (`01-F17`, `00 §5.1`)."
//   00 §5.1    No in-branch feature may require WAN.
//
// ── THREE READINGS THIS SUITE PINS, stated so a reviewer can reject them rather than discover ───
//
//   R-1  **"Never crash" is asserted as "no exception escapes the `ws` message listener", and the
//        crash has TWO observable consequences — measured out-of-tree, not assumed** (`ws` 8.21.1,
//        Node 22.23.2, probe: a server-side `message` listener that throws on one frame). (i) The
//        exception reaches `process.on("uncaughtException")`; in an Electron main process, which
//        installs no such handler, that is the till dying. (ii) The receiver is left wedged: a
//        well-formed frame sent 200 ms later on the SAME socket was never processed, and the
//        socket neither errored nor closed. So this file asserts both — a recorder for (i) and a
//        real `ping` for (ii) — and races them, so a throwing handler is reported AS a crash in
//        milliseconds instead of as a ten-second timeout that attributes to nothing.
//        ⚠ The recorder SUPPRESSES the crash it records: with a listener registered Node does not
//        abort, so a recorded exception here is not a near miss, it is the process that would have
//        gone down. And note what the transport's own `ws.on("error", () => undefined)` does NOT
//        cover — this exception is not delivered as a socket error, so nothing swallows it.
//
//   R-2  **The peer is a raw `ws` client, not a second transport.** It presents a real certificate
//        and verifies nothing about the acceptor (`rejectUnauthorized: false`), because the
//        judgement under test is the acceptor's message handler and nothing else — and because a
//        malformed frame is by definition something our own encoder would never emit, so a rig
//        built out of our own transport could not send one.
//
//   R-3  **The ping is the clock.** Frames on one WebSocket are ordered, so a real `ping` sent
//        LAST and observed arriving proves every malformed frame before it was already processed.
//        That removes the sleep this file used to need, and it makes `messages` an exact-equality
//        assertion: anything the handler wrongly handed up would sit in front of the ping.
//
// ── MUTATION MATRIX (`20 §4.3`; AGENTS.md round-3 law) ─────────────────────────────────────────
//
// Reading a suite never detects a vacuous one, and this file was in effect vacuous for the whole
// window in which it could not open a socket. Measured against a COPY of `transport-ws.ts` in a
// scratchpad outside the repo (the in-tree file was byte-identical before and after — mutating a
// protected path in place is forbidden), each row the FULL file, 5 tests:
//
//   | mutant (exactly one branch of the message handler) | killed | via                          |
//   |----------------------------------------------------|--------|------------------------------|
//   | M1 throws on an unparseable frame                  | §A §D  | `uncaught` non-empty         |
//   | M2 throws on a discriminant-less frame (K-02's own fault) | §B | `uncaught` non-empty     |
//   | M3 throws on a bad `message` payload               | §C §D §E | `uncaught` non-empty       |
//   | M4 hands the unvalidated body up instead of dropping | §C §D §E | `messages` exact-equality |
//   | M5 re-adds the `announce` identity arm, CAREFULLY validated | §E | `visible` exact-equality |
//   | M6 drops the `t !== "wire"` discriminant check      | §B     | `messages` exact-equality    |
//   | **C1 CONTROL** — the same handler refactored into a `decodeLanFrame` helper, semantically
//   |   equivalent                                        | **0**  | —                            |
//
// M5 is the row that says the retirement in §E is an assertion rather than a comment: it
// reintroduces the deleted forgery *with* the type-validation a reviewer would ask for, which is
// `01-F72` (b)'s own "validating it harder would have kept a self-declared identity and made it
// look defended". M1–M3 kill in ~1 s rather than by a 10 s timeout because R-1 races the two
// consequences of a crash.

import {
  type MeshTransport,
  type PeerInfo,
  PROTOCOL_VERSION,
  type ProtocolMessage,
  type TransportHandlers,
} from "@restos/sync-protocol";
import { createTestBranchPki, type TestDevice } from "@restos/testing/lan-credentials";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createWsLanTransport, wallClock } from "../index.js";

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Fixtures — one branch, two devices, issued the way the gateway issues in production.
// ───────────────────────────────────────────────────────────────────────────────────────────────

/** Every socket here is loopback: an acceptance suite must not open a port on the LAN. */
const LOOPBACK = "127.0.0.1";

/**
 * `01-F72` — a LAN transport cannot be constructed without a credential, so this file needs a real
 * branch PKI to reach the malformed-frame path at all. The acceptor is the transport under test;
 * the till is the admitted peer that sends it rubbish.
 */
const PKI = await createTestBranchPki([
  { device_id: "hub-k02", device_class: "counter_electron" },
  { device_id: "till-k02", device_class: "counter_rn" },
]);

const deviceNamed = (device_id: string): TestDevice => {
  const found = PKI.devices.find((d) => d.device_id === device_id);
  if (found === undefined) throw new Error(`fixture has no device "${device_id}"`);
  return found;
};

const HUB = deviceNamed("hub-k02");
const TILL = deviceNamed("till-k02");

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Harness
// ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * R-1 — the crash detector. Every exception that escapes a listener lands here instead of killing
 * the process, and each test asserts it stayed empty.
 */
const uncaught: string[] = [];
const recordUncaught = (error: unknown): void => {
  uncaught.push(String(error));
};

beforeAll(() => {
  process.on("uncaughtException", recordUncaught);
});
afterAll(() => {
  process.off("uncaughtException", recordUncaught);
});

const transports: MeshTransport[] = [];
const sockets: WebSocket[] = [];

afterEach(() => {
  // Transports first, so their listen sockets and timers are gone before the raw peers close.
  for (const transport of transports.splice(0)) transport.stop();
  for (const socket of sockets.splice(0)) socket.close();
  uncaught.length = 0;
});

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll until `predicate` holds. A timeout throws with the LABEL rather than dying as a generic
 * vitest timeout — a negative result here means the transport stopped serving, and it must read
 * as that rather than as "slow".
 */
const waitFor = async (
  label: string,
  predicate: () => boolean,
  timeout_ms = 10_000,
): Promise<void> => {
  const deadline = Date.now() + timeout_ms;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(10);
  }
  throw new Error(`timed out waiting for ${label}`);
};

type Recorder = {
  readonly visible: PeerInfo[];
  readonly lost: string[];
  readonly messages: { from: string; message: ProtocolMessage }[];
  readonly handlers: TransportHandlers;
};

const recorder = (): Recorder => {
  const visible: PeerInfo[] = [];
  const lost: string[] = [];
  const messages: { from: string; message: ProtocolMessage }[] = [];
  return {
    visible,
    lost,
    messages,
    handlers: {
      onPeerVisible: (peer) => {
        visible.push(peer);
      },
      onPeerLost: (device_id) => {
        lost.push(device_id);
      },
      onMessage: (from, message) => {
        messages.push({ from, message });
      },
    },
  };
};

type Fuzzer = {
  readonly rec: Recorder;
  /** Send one raw frame — text or binary — up the admitted socket. */
  send(frame: string | Buffer): void;
};

/**
 * A started transport with an ADMITTED peer holding an open socket to it (R-2).
 *
 * The fixture asserts its own setup: if admission ever stopped working, every "nothing was handed
 * up" assertion below would pass for a reason that has nothing to do with malformed frames.
 */
const admittedPeer = async (): Promise<Fuzzer> => {
  const rec = recorder();
  let resolvePort: (port: number) => void = () => undefined;
  const bound = new Promise<number>((resolve) => {
    resolvePort = resolve;
  });
  const transport = createWsLanTransport({
    admission: PKI.admissionFor(HUB.device_id),
    listen_host: LOOPBACK,
    listen_port: 0,
    peers: [],
    clock: wallClock,
    on_listening: (port) => resolvePort(port),
  });
  transports.push(transport);
  transport.start(rec.handlers);
  const port = await bound;

  const ws = new WebSocket(`wss://${LOOPBACK}:${port}`, {
    cert: TILL.credential.cert,
    key: TILL.credential.key,
    rejectUnauthorized: false, // R-2 — the acceptor's judgement is the only one under test
  });
  sockets.push(ws);
  ws.on("error", () => undefined); // swallow the close-time error like the adapter does
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  await waitFor("the transport to admit the fuzzing peer", () => rec.visible.length > 0);
  expect(rec.visible).toEqual([{ device_id: TILL.device_id, device_class: TILL.device_class }]);

  return { rec, send: (frame) => ws.send(frame) };
};

const ping = (t: number): string =>
  JSON.stringify({ t: "wire", message: { v: PROTOCOL_VERSION, kind: "ping", t } });

/**
 * R-3 — the liveness control every case below ends with, and without it none of them prove
 * anything: an empty `messages` is also what a transport that closed the socket, crashed the
 * handler, or never wired one produces. A real `ping` sent last must arrive, from the CERTIFIED
 * identity, with nothing in front of it.
 */
const expectStillServing = async (fuzz: Fuzzer, t: number): Promise<void> => {
  fuzz.send(ping(t));
  // Whichever comes first: the ping (healthy) or a recorded crash (R-1). Racing them is not a
  // convenience — waiting on the ping alone reports a crashed handler as a timeout, which reads
  // like a slow test and names nothing.
  await waitFor(
    `the admitted socket to still carry a real message (ping ${t})`,
    () => fuzz.rec.messages.length > 0 || uncaught.length > 0,
  );
  // R-1 — the crash itself, FIRST, because it is the most specific symptom and carries the
  // exception's own text.
  expect(uncaught).toEqual([]);
  expect(fuzz.rec.messages).toEqual([
    { from: TILL.device_id, message: { v: PROTOCOL_VERSION, kind: "ping", t } },
  ]);
  // The socket survived: no eviction, no re-admission, and the peer never changed identity.
  expect(fuzz.rec.lost).toEqual([]);
  expect(fuzz.rec.visible).toEqual([
    { device_id: TILL.device_id, device_class: TILL.device_class },
  ]);
};

describe("K-02 malformed LAN frames never crash the ws transport (01-F12, 01-F17)", () => {
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // §A — UNPARSEABLE. The frame is not JSON at all.
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  it("01-F12 / 01-F17: unparseable frames — truncated JSON, plain text, empty, invalid UTF-8 — are dropped, and the socket keeps serving", async () => {
    const fuzz = await admittedPeer();

    // A till whose power failed mid-write sends a truncated frame; a flaky link delivers bytes
    // that are not UTF-8 at all. Both reach `JSON.parse` and neither may reach the handler.
    fuzz.send("{");
    fuzz.send('{"t":"wire","message":{"v":1,"kind":"pin');
    fuzz.send("not json at all");
    fuzz.send("");
    fuzz.send(Buffer.from([0xff, 0xfe, 0x00, 0x80])); // invalid UTF-8, as a BINARY frame

    await expectStillServing(fuzz, 4201);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // §B — PARSEABLE, BUT NOT A FRAME. The audited fault: `frame.t` dereferenced before proving
  // `frame` is a discriminant-bearing object. Every shape the original suite fuzzed is here.
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  it("01-F12 / 01-F17: parseable non-objects and discriminant-less objects are dropped without being dereferenced", async () => {
    const fuzz = await admittedPeer();

    // `null` is the one that produced the original crash: `'t' in null` throws.
    for (const frame of [
      "null",
      "[]",
      "42",
      '"a string"',
      "true",
      "{}",
      '{"peer":{"device_id":"x","device_class":"counter_rn"}}',
      '{"t":null}',
      '{"t":42}',
      '{"t":["wire"]}',
      '{"t":"wire ","message":{"v":1,"kind":"ping","t":1}}', // near-miss discriminant
      '{"t":"announce","peer":{}}', // the deleted frame kind, with an unusable peer
      // A PERFECTLY VALID message under a discriminant this wire does not define. `LanFrame` keeps
      // its discriminant "so the shape can grow again without a format change" — which is only
      // true if a frame kind nobody has defined yet is refused today rather than routed as `wire`.
      '{"t":"announce","message":{"v":1,"kind":"ping","t":9}}',
    ]) {
      fuzz.send(frame);
    }

    await expectStillServing(fuzz, 4202);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // §C — A WELL-FORMED FRAME WHOSE `message` IS RUBBISH. **New under `01-F72`**: the payload the
  // old suite malformed lived on the `announce` frame, which no longer exists, so the only
  // payload an admitted peer can now send is a `wire` one — and this is where a version skew, a
  // corrupted body or a hostile admitted device lands.
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  it("01-F12 / 01-F17: a well-formed wire frame carrying a rubbish message is dropped, never handed up as a ProtocolMessage", async () => {
    const fuzz = await admittedPeer();

    for (const frame of [
      '{"t":"wire"}', // no message at all
      '{"t":"wire","message":null}',
      '{"t":"wire","message":42}',
      '{"t":"wire","message":"ping"}',
      '{"t":"wire","message":[]}',
      '{"t":"wire","message":{}}', // no `kind` — nothing to route on
      '{"t":"wire","message":{"v":1,"kind":"not_a_kind"}}', // outside PROTOCOL.md's closed set
      '{"t":"wire","message":{"v":1,"kind":"ping"}}', // the RIGHT kind, missing its `t`
      '{"t":"wire","message":{"v":999,"kind":"ping","t":1}}', // a build a protocol version apart
      '{"t":"wire","message":{"v":1,"kind":"push","batch":"not-a-batch"}}', // plausible, wrong body
    ]) {
      fuzz.send(frame);
    }

    // Exactly nothing reached the session, and `expectStillServing`'s exact-equality is where that
    // is asserted — R-3, because a bare `messages` check HERE could pass simply by running before
    // the frames arrived. A handler that "helpfully" forwarded the unvalidated body would put a
    // shape no fold can read into the ingest path; `01-F17` says a sale is never blocked, and an
    // unparsed payload arriving as a `ProtocolMessage` is one way that breaks.
    await expectStillServing(fuzz, 4203);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // §D — OVERSIZED. Also new under `01-F72`: an admitted peer's frame is not size-bounded by
  // anything this transport configures, so "the till dies on a big frame" is reachable from one
  // misbehaving device on the branch.
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  it("01-F12 / 01-F17: an oversized frame — parseable or not — is dropped rather than crashing or wedging the socket", async () => {
    const fuzz = await admittedPeer();

    const MIB = 1024 * 1024;
    fuzz.send("x".repeat(MIB)); // 1 MiB of nothing: unparseable and large
    fuzz.send(JSON.stringify({ t: "wire", message: { v: 2, kind: "ping", pad: "p".repeat(MIB) } }));
    fuzz.send(JSON.stringify({ t: "wire", message: "m".repeat(MIB) }));

    await expectStillServing(fuzz, 4204);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // §E — THE RETIRED ASSERTION.
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  it("01-F72 (b) — RETIRED AND REPLACED: an `announce` frame from an ADMITTED peer names nobody; identity is the certificate's", async () => {
    // ⚠ **RETIRED AND REPLACED, August 2026 — read this before restoring anything.** This row
    // used to send, from an UNAUTHENTICATED client,
    //
    //     {"t":"announce","peer":{"device_id":"x","device_class":"counter_rn"}}
    //
    // and require the transport to register a visible peer `"x"` of class `counter_rn` — the
    // "subsequent VALID announce still registers" half of the original K-02 test, which existed to
    // prove the handler had stayed alive and SELECTIVE rather than gone deaf.
    //
    // `01-F72` (b) overruled it in terms: *"the session's device identity is the PEER
    // CERTIFICATE's subject — never a `device_id` read from a frame"*. The `announce` frame is
    // deleted (`transport-ws.ts`'s `LanFrame`), and the assertion as written required exactly the
    // forgery the FR was written against: anything on the shop Wi-Fi naming itself
    // `counter_electron` — `01-F39`'s highest-ranked hub class — and winning the election.
    //
    // It is kept and inverted rather than deleted, because a green test defending an overruled
    // rule is this corpus's own worked failure (`catalog-pricing.test.ts:394`), and because
    // deleting it would have retired the SELECTIVITY half of K-02 along with it. What the frame
    // may no longer do is now asserted here; where the property it used to protect lives now:
    //
    //   • that identity comes from the certificate, and `device_class` from the roster —
    //     `lan-admission.test.ts` §A (which rosters each peer under a class its certificate does
    //     not carry, so a transport reading either from a frame fails it);
    //   • that an unrostered, foreign-issuer, expired, revoked or CN-mismatched peer is refused —
    //     `lan-admission.test.ts` §B–§H.
    //
    // Neither of those is this file's property, and this file must not grow a second opinion
    // about them. What is asserted below is K-02's: the frame is DROPPED, not believed.
    const fuzz = await admittedPeer();

    fuzz.send('{"t":"announce","peer":{"device_id":"x","device_class":"counter_rn"}}');
    // …and the same forgery under the surviving discriminant, which is the shape a re-introduced
    // arm would most plausibly take.
    fuzz.send('{"t":"wire","peer":{"device_id":"x","device_class":"counter_electron"}}');
    fuzz.send('{"t":"announce","peer":{"device_id":"hub-k02","device_class":"counter_electron"}}');

    await expectStillServing(fuzz, 4205);

    // Explicit, because `expectStillServing`'s equality is easy to read past: no forged identity
    // ever became visible, and the traffic that DID arrive is attributed to the certified peer.
    expect(fuzz.rec.visible.map((p) => p.device_id)).toEqual([TILL.device_id]);
    expect(fuzz.rec.messages.map((m) => m.from)).toEqual([TILL.device_id]);
  });
});
