// Acceptance tests — T-01-19: the CLIENT half of the per-connection compression
// negotiation (DEC-SYNC-010), driven over a REAL WebSocket against a stub gateway.
//
// SPEC SOURCE (24 §3 step 2 — authored from spec text, implementation not seen):
//   • specs/DECISIONS.md DEC-SYNC-010 (**accepted**): "compression is negotiated per
//     connection at `hello`/`hello_ack`, opt-in from both ends … a peer that does not
//     advertise it receives plain JSON forever, so the negotiation can never strand an
//     older device."
//   • plans/wave-0/t-01-19-compression-wiring.md traps: never infer support from a
//     successful decode; never compress before the ack.
//
// ── ORACLE-PROPOSED SEAM (binding; reported for the implementer):
//   1. `cloud-session.ts` sendHello advertises `accepts_compression: true` — the device
//      end of the opt-in. Without it the feature is dead code and the 26 §6.4 catch-up
//      transfer budget never sees compression.
//   2. `transport-ws.ts` createWsCloudTransport holds the FRAME CODEC — one per live
//      socket, never above it: the session speaks ProtocolMessages and must not learn
//      about framing. The transport learns the negotiation from the messages already
//      passing through it — the outbound `hello` it forwards (did WE advertise?) and the
//      inbound `hello_ack` (did the gateway GRANT?) — so no new config key is needed and
//      a reconnect re-negotiates from scratch, which is what "per connection" means.
//   3. Text frame = plain JSON; binary frame = zstd. The `ws` layer already reports which
//      (`isBinary`), so nothing sniffs a zstd magic number.
//
// STATUS at authoring time (verified by running this file against the pre-T-01-19 tree):
//   RED (missing behavior): the granted-connection test, the per-connection re-negotiation
//   test, and the session-advertises-in-hello test — today the cloud transport encodes
//   every outbound frame with encodeMessage and decodes every inbound one with
//   decodeMessage(rawToText(raw)), and the session's hello carries no advertisement.
//   GREEN REGRESSION GUARDS (green today, must STAY green — they are the anti-stranding
//   half of DEC-SYNC-010, which an implementation can only break): the un-granted and
//   never-advertised connections stay plain in both directions and refuse a compressed
//   frame; the hello frame itself is plain text.

import type { AddressInfo } from "node:net";
import {
  type CloudTransportHandlers,
  decodeCompressed,
  decodeMessage,
  encodeCompressed,
  encodeMessage,
  type ProtocolMessage,
} from "@restos/sync-protocol";
import { createSim } from "@restos/testing";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket as WsSocket } from "ws";
import { createCloudSession, createWsCloudTransport, openStore, wallClock } from "../index.js";
import { identity, peerEnvelope } from "./builders.js";

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (what: string, ready: () => boolean, timeoutMs = 3_000): Promise<void> => {
  const started = Date.now();
  while (!ready()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await delay(10);
  }
};

/** A frame as it actually arrived at the gateway: text (plain JSON) or binary (zstd). */
type Frame = { binary: boolean; text: string; bytes: Uint8Array };

/** Minimal stub gateway: records inbound frames with their text/binary nature. */
const startStubGateway = async () => {
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
  const port = (wss.address() as AddressInfo).port;
  const frames: Frame[] = [];
  const sockets: WsSocket[] = [];
  wss.on("connection", (ws: WsSocket) => {
    sockets.push(ws);
    ws.on("error", () => undefined);
    ws.on("message", (data: Buffer, isBinary: boolean) => {
      frames.push({
        binary: isBinary,
        text: Buffer.from(data).toString("utf8"),
        bytes: Uint8Array.from(data),
      });
    });
  });
  return {
    url: `ws://127.0.0.1:${port}`,
    frames,
    sockets,
    /** The live socket (the most recent connection) — after a redial this is the new one. */
    live: (): WsSocket => {
      const ws = sockets.at(-1);
      if (ws === undefined) throw new Error("no gateway connection yet");
      return ws;
    },
    sendPlain: (message: ProtocolMessage): void => {
      const ws = sockets.at(-1);
      if (ws === undefined) throw new Error("no gateway connection yet");
      ws.send(encodeMessage(message)); // text frame
    },
    sendCompressed: (message: ProtocolMessage): void => {
      const ws = sockets.at(-1);
      if (ws === undefined) throw new Error("no gateway connection yet");
      ws.send(Buffer.from(encodeCompressed(message))); // binary frame
    },
    close: (): void => {
      for (const ws of sockets) ws.close();
      wss.close();
    },
  };
};

type Stub = Awaited<ReturnType<typeof startStubGateway>>;

/** A hello as the device sends it. Cast, not parsed: the advertisement must reach the
 * transport verbatim (parseMessage strips it until the schema lands — file
 * sync-protocol/__acceptance__/compression-negotiation.test.ts owns that pin). */
const helloFrom = (extra: Record<string, unknown> = {}): ProtocolMessage =>
  ({
    v: 2,
    kind: "hello",
    device_id: "dev-z1",
    device_class: "counter_electron",
    branch_id: "br-z1",
    token: "acceptance-token",
    last_global_seq: 0,
    own_high_water: 0,
    ...extra,
  }) as unknown as ProtocolMessage;

const ackWith = (extra: Record<string, unknown> = {}): ProtocolMessage =>
  ({
    v: 2,
    kind: "hello_ack",
    session_id: "sess-z1",
    hub: false,
    resume_from: 0,
    ...extra,
  }) as unknown as ProtocolMessage;

const ping = (t: number): ProtocolMessage => ({ v: 2, kind: "ping", t });

const eventBatch = (): ProtocolMessage =>
  ({
    v: 2,
    kind: "event_batch",
    events: [{ ...peerEnvelope(identity(), 0), global_seq: 1 }],
  }) as unknown as ProtocolMessage;

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

/** Start the real cloud transport against the stub and wait for the socket to open. */
const connect = async (stub: Stub, reconnect_ms = 50) => {
  const received: ProtocolMessage[] = [];
  let ups = 0;
  const transport = createWsCloudTransport({ url: stub.url, clock: wallClock, reconnect_ms });
  cleanup = () => {
    transport.stop();
    stub.close();
  };
  transport.start({
    onUp: () => {
      ups += 1;
    },
    onDown: () => undefined,
    onMessage: (message) => received.push(message),
  });
  await waitFor("the cloud socket to open", () => ups > 0);
  await waitFor("the gateway to accept the connection", () => stub.sockets.length > 0);
  return { transport, received, ups: () => ups };
};

describe("T-01-19 / DEC-SYNC-010: the cloud transport negotiates compression PER CONNECTION", () => {
  it("DEC-SYNC-010: the hello frame is always PLAIN TEXT (it is the message that establishes what the peer can read) and carries the advertisement verbatim", async () => {
    const stub = await startStubGateway();
    const { transport } = await connect(stub);

    transport.send(helloFrom({ accepts_compression: true }));
    await waitFor("the hello to reach the gateway", () => stub.frames.length > 0);

    const [first] = stub.frames;
    if (first === undefined) throw new Error("unreachable: length asserted above");
    expect(first.binary).toBe(false); // trap 2: nothing is compressed before the ack
    const hello = JSON.parse(first.text) as Record<string, unknown>;
    expect(hello.kind).toBe("hello");
    expect(hello.accepts_compression).toBe(true);
  });

  it("DEC-SYNC-010: BOTH ends opted in ⇒ after the ack the transport sends compressed BINARY frames and accepts compressed inbound frames, deep-equal", async () => {
    const stub = await startStubGateway();
    const { transport, received } = await connect(stub);

    transport.send(helloFrom({ accepts_compression: true }));
    await waitFor("the hello", () => stub.frames.length > 0);
    stub.sendPlain(ackWith({ compression: "zstd" })); // the grant — itself plain
    await waitFor("the hello_ack to be delivered", () => received.length > 0);

    // Inbound: a compressed frame on a granted connection is delivered, transparently.
    const batch = eventBatch();
    stub.sendCompressed(batch);
    await waitFor("the compressed event_batch", () => received.length > 1);
    expect(received[1]).toEqual(decodeMessage(encodeMessage(batch)));

    // Outbound: the next frame is a BINARY zstd frame the gateway decodes deep-equal.
    transport.send(ping(1_752_800_000_000));
    await waitFor("the outbound ping", () => stub.frames.length > 1);
    const outbound = stub.frames[1];
    if (outbound === undefined) throw new Error("unreachable: length asserted above");
    expect(outbound.binary).toBe(true);
    expect(decodeCompressed(outbound.bytes)).toEqual(ping(1_752_800_000_000));
  });

  it("DEC-SYNC-010: the gateway did NOT grant (ack without `compression`) ⇒ plain JSON forever — outbound stays text and an inbound compressed frame is REFUSED, never sniffed", async () => {
    const stub = await startStubGateway();
    const { transport, received } = await connect(stub);

    transport.send(helloFrom({ accepts_compression: true }));
    await waitFor("the hello", () => stub.frames.length > 0);
    stub.sendPlain(ackWith()); // an OLD gateway: no compression key at all
    await waitFor("the hello_ack", () => received.length > 0);

    // Trap 1: a decodable compressed frame must NOT be accepted on an un-negotiated
    // connection — support comes from the contract, not from a successful decode.
    stub.sendCompressed(eventBatch());
    await delay(150);
    expect(received).toHaveLength(1); // the ack only; the compressed frame was refused

    // …and the connection is still alive: a PLAIN frame right after still lands.
    const batch = eventBatch();
    stub.sendPlain(batch);
    await waitFor("the plain event_batch", () => received.length > 1);
    expect(received[1]).toEqual(decodeMessage(encodeMessage(batch)));

    // Outbound stays plain text for the life of the connection.
    transport.send(ping(7));
    await waitFor("the outbound ping", () => stub.frames.length > 1);
    const outbound = stub.frames[1];
    if (outbound === undefined) throw new Error("unreachable: length asserted above");
    expect(outbound.binary).toBe(false);
    expect(decodeMessage(outbound.text)).toEqual(ping(7));
  });

  it("DEC-SYNC-010: WE did not advertise ⇒ a grant we never asked for is IGNORED (opt-in from BOTH ends; a rolled-back device must not be handed frames it cannot read)", async () => {
    const stub = await startStubGateway();
    const { transport, received } = await connect(stub);

    transport.send(helloFrom()); // no accepts_compression — the un-updated / declining device
    await waitFor("the hello", () => stub.frames.length > 0);
    stub.sendPlain(ackWith({ compression: "zstd" })); // a gateway granting anyway
    await waitFor("the hello_ack", () => received.length > 0);

    transport.send(ping(9));
    await waitFor("the outbound ping", () => stub.frames.length > 1);
    const outbound = stub.frames[1];
    if (outbound === undefined) throw new Error("unreachable: length asserted above");
    expect(outbound.binary).toBe(false); // still plain: we never opted in

    stub.sendCompressed(eventBatch());
    await delay(150);
    expect(received).toHaveLength(1); // the ack only
  });

  it("DEC-SYNC-010: negotiation is PER CONNECTION — after a drop and redial the fresh socket starts PLAIN again until its own hello_ack grants", async () => {
    const stub = await startStubGateway();
    const { transport, received, ups } = await connect(stub);

    transport.send(helloFrom({ accepts_compression: true }));
    await waitFor("the hello", () => stub.frames.length > 0);
    stub.sendPlain(ackWith({ compression: "zstd" }));
    await waitFor("the hello_ack", () => received.length > 0);
    transport.send(ping(1));
    await waitFor("the compressed ping", () => stub.frames.length > 1);
    expect(stub.frames[1]?.binary).toBe(true); // granted on connection #1

    // The gateway drops the connection; the transport redials (contract (f)).
    stub.live().close();
    await waitFor("the redial", () => ups() > 1 && stub.sockets.length > 1);
    const beforeRedialFrames = stub.frames.length;

    // Connection #2 has granted nothing yet: every frame it carries must be plain.
    transport.send(ping(2));
    await waitFor("the post-redial ping", () => stub.frames.length > beforeRedialFrames);
    const outbound = stub.frames[beforeRedialFrames];
    if (outbound === undefined) throw new Error("unreachable: length asserted above");
    expect(outbound.binary).toBe(false); // per-connection state, not per-device
    expect(decodeMessage(outbound.text)).toEqual(ping(2));

    // …and a compressed inbound frame on the fresh connection is refused.
    const beforeInbound = received.length;
    stub.sendCompressed(eventBatch());
    await delay(150);
    expect(received).toHaveLength(beforeInbound);
  });
});

describe("T-01-19 / DEC-SYNC-010: the device advertises compression in its cloud hello", () => {
  it("DEC-SYNC-010/26 §6.4: the cloud session's hello carries accepts_compression: true — the device end of the opt-in, without which the catch-up transfer is never compressed", () => {
    const sim = createSim({ seed: 1 });
    const id = identity();
    const store = openStore({ path: ":memory:", identity: id });
    const sent: ProtocolMessage[] = [];
    let handlers: CloudTransportHandlers | null = null;
    const session = createCloudSession({
      store,
      transport: {
        start: (h) => {
          handlers = h;
        },
        stop: () => undefined,
        send: (message) => sent.push(message),
      },
      clock: sim.clock,
      device_class: "counter_electron",
      token: "cloud-token-stub",
    });
    session.start();
    if (handlers === null) throw new Error("the session never started its transport");
    (handlers as { onUp: () => void }).onUp(); // the socket opened → the session hellos
    session.stop();

    const hello = sent.find((m) => m.kind === "hello") as Record<string, unknown> | undefined;
    expect(hello).toBeDefined();
    expect(hello?.accepts_compression).toBe(true);
  });
});
