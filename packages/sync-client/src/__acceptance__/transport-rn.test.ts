// ⚠ **IMPLEMENTER-AUTHORED.** `24 §3` puts the acceptance suites in another session's hands, and
// the storage-adapter oracle covers `18 §4`'s storage half. The RN CLOUD TRANSPORT that landed
// beside it — `transport-rn.ts` — is new, is on the same protected path, and had **zero assertions
// anywhere in this repository**. This file is the smallest set that stops it being decorative.
//
// ⚠ **PROTECTED PATH (`20 §4.4`, commandment 10): `packages/sync-client`. SENIOR REVIEW.**
//
// ── WHAT THIS CAN AND CANNOT SEE ───────────────────────────────────────────────────────────────
//
// CAN: the transport's own logic, against a fake socket with the exact WHATWG client surface React
// Native exposes — what it puts on the wire, what it does with a frame, and the up/down edges the
// cloud session's whole state machine hangs off.
//
// CANNOT: **a phone.** Nothing here loads Hermes and nothing here opens a real socket. `18 §12`
// gives React Native one tool (Maestro on the `00 §4` rig) and there is no rig. A green run here
// must never be quoted as *"the manager syncs"*.
//
// ── WHY THE FIRST TEST EXISTS, MEASURED ────────────────────────────────────────────────────────
//
// `cloud-session.ts:224` hardcodes `accepts_compression: true` — *"advertise that this BUILD can
// decode compressed frames"* — which was true of every host it had when it was written and is
// false on a phone: zstd is `node:zlib`, exactly the module Metro cannot resolve. Left uncorrected,
// the gateway GRANTS compression (`gateway.ts:462`), sends binary frames, and this transport drops
// them: the device connects, hellos, reports `connected: true`, and then silently receives nothing
// for ever. Reproduced end to end against a real `ws` server before the correction was written.
// It is the worst available failure mode — a console that looks synced and is not — and exactly
// one line refuses it.

import { encodeMessage, type ProtocolMessage, parseMessage } from "@restos/sync-protocol/messages";
import type { Clock, TimerId } from "@restos/sync-protocol/transport";
import { describe, expect, it } from "vitest";
import { createRnCloudTransport, type RnWebSocket } from "../transport-rn.js";

/** A socket with op-for-op the surface RN gives a JS caller, and nothing more. */
type FakeSocket = RnWebSocket & { sent: string[]; closed: boolean; open: () => void };

const OPEN = 1;
const CLOSED = 3;

const fakeSocket = (): FakeSocket => {
  const socket = {
    readyState: CLOSED,
    sent: [] as string[],
    closed: false,
    onopen: null as (() => void) | null,
    onmessage: null as ((event: { data: unknown }) => void) | null,
    onerror: null as (() => void) | null,
    onclose: null as (() => void) | null,
    send(data: string) {
      socket.sent.push(data);
    },
    close() {
      socket.closed = true;
    },
    open() {
      socket.readyState = OPEN;
      socket.onopen?.();
    },
  };
  return socket as unknown as FakeSocket;
};

/** No timers fire unless a test fires them — reconnect is scheduled, never awaited. */
const manualClock = (): Clock & { pending: (() => void)[] } => {
  const pending: (() => void)[] = [];
  return {
    pending,
    now: () => 0,
    setTimeout: (fn: () => void): TimerId => {
      pending.push(fn);
      return pending.length as unknown as TimerId;
    },
    clearTimeout: () => {},
  };
};

const HELLO: ProtocolMessage = {
  v: 2,
  kind: "hello",
  device_id: "device-manager",
  device_class: "manager",
  branch_id: "branch-1",
  token: "token-1",
  last_global_seq: 0,
  own_high_water: 0,
  accepts_compression: true,
};

const started = (): {
  socket: FakeSocket;
  clock: ReturnType<typeof manualClock>;
  seen: ProtocolMessage[];
  ups: number;
  downs: number;
} & {
  transport: ReturnType<typeof createRnCloudTransport>;
} => {
  const socket = fakeSocket();
  const clock = manualClock();
  const seen: ProtocolMessage[] = [];
  const state = { ups: 0, downs: 0 };
  const transport = createRnCloudTransport({
    url: "ws://gateway.invalid/sync",
    clock,
    socket: () => socket,
  });
  transport.start({
    onUp: () => {
      state.ups += 1;
    },
    onDown: () => {
      state.downs += 1;
    },
    onMessage: (message) => {
      seen.push(message);
    },
  });
  return {
    socket,
    clock,
    seen,
    transport,
    get ups() {
      return state.ups;
    },
    get downs() {
      return state.downs;
    },
  };
};

describe("DEC-SYNC-010 — the RN transport never advertises a codec it cannot decode", () => {
  it("rewrites the session's hardcoded accepts_compression to false on the wire", () => {
    const h = started();
    h.socket.open();
    h.transport.send(HELLO);

    expect(h.socket.sent).toHaveLength(1);
    const wire = parseMessage(JSON.parse(h.socket.sent[0] as string));
    expect(wire.kind).toBe("hello");
    // The one assertion this file exists for. `true` here means the gateway grants zstd and this
    // device receives binary frames it will drop, for ever, while reporting itself connected.
    expect(wire.kind === "hello" && wire.accepts_compression).toBe(false);
  });

  it("CONTROL: it does not rewrite any OTHER message", () => {
    // Without this, a transport that mangled everything — or sent nothing at all — would pass.
    const h = started();
    h.socket.open();
    const catchup: ProtocolMessage = { v: 2, kind: "catchup_request", from_global_seq: 7 };
    h.transport.send(catchup);
    expect(JSON.parse(h.socket.sent[0] as string)).toEqual(catchup);
  });
});

describe("01-F17 — a frame the device cannot read never takes the session down", () => {
  it("drops a binary frame and an unparseable one, and keeps delivering afterwards", () => {
    const h = started();
    h.socket.open();
    // A binary frame: what a gateway that granted compression would send. RN hands it over as
    // something that is not a string.
    h.socket.onmessage?.({ data: new Uint8Array([40, 181, 47, 253]) });
    h.socket.onmessage?.({ data: "{ not json" });
    h.socket.onmessage?.({ data: JSON.stringify({ v: 2, kind: "no_such_kind" }) });
    expect(h.seen).toEqual([]);

    const ack: ProtocolMessage = {
      v: 2,
      kind: "hello_ack",
      session_id: "s1",
      hub: false,
      resume_from: 0,
    };
    h.socket.onmessage?.({ data: encodeMessage(ack) });
    expect(h.seen).toEqual([ack]);
  });
});

describe("the transport's edges — what the cloud session's state machine hangs off", () => {
  it("signals up on open, down once on close, and schedules exactly one reconnect", () => {
    const h = started();
    expect(h.ups).toBe(0); // constructing a socket is not being connected
    h.socket.open();
    expect(h.ups).toBe(1);

    h.socket.onclose?.();
    expect(h.downs).toBe(1);
    expect(h.clock.pending).toHaveLength(1); // resumes when the gateway re-listens

    // A close with no preceding open must NOT fire onDown — the session would tear down state it
    // never built, and `transport-ws.ts` guards the same way with the same flag.
    h.socket.onclose?.();
    expect(h.downs).toBe(1);
  });

  it("drops a send while the socket is not OPEN rather than throwing", () => {
    // `01-F17`: the outbox is durable, so a message lost here is re-drained on reconnect. Throwing
    // would propagate into `append()`'s caller.
    const h = started();
    expect(() => h.transport.send(HELLO)).not.toThrow();
    expect(h.socket.sent).toEqual([]);
  });

  it("stop() closes the socket and silences every later edge", () => {
    const h = started();
    h.socket.open();
    h.transport.stop();
    expect(h.socket.closed).toBe(true);
    h.socket.onmessage?.({ data: encodeMessage(HELLO) });
    h.socket.onclose?.();
    expect(h.seen).toEqual([]);
    expect(h.downs).toBe(0);
  });
});
