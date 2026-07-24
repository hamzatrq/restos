# @restos/sync-protocol

The **wire contract** between a device and the cloud — and between devices on a LAN.
It is the single source of truth for what a RestOS sync message *is*: the zod message
schemas, the JSON codec, the additive zstd framing, and the transport interfaces that
sessions plug into. **Pure schema + codec — no I/O, no sockets, no session logic.** The
mesh and cloud sessions (in `sync-client`) and the gateway (`sync-gateway`) own all
behaviour; this package only decides what bytes are legal on the wire.

> **PROTECTED PATH (20 §4.4).** Owning spec: `specs/01-kernel-sync.md §8` + `20 §2.7`.
> Read the spec before touching anything here; senior review is mandatory (CODEOWNERS).
> The prose protocol spec is [`PROTOCOL.md`](./PROTOCOL.md) — direction, per-kind body
> notes, and the DEC-SYNC rationale live there and are **not** duplicated below.

## Where it sits

```
sync-client (device)  ──┐                        ┌──  sync-gateway (cloud)
   mesh + cloud session │  @restos/sync-protocol  │       gateway sessions
                        └──►  schemas + codec  ◄──┘
                             golden fixtures pin the wire
```

Both sides depend on this one package so they **encode and decode identically** — there
is no second copy of the schema to drift. The committed JSON files in
`src/__acceptance__/fixtures/` are the frozen wire contract: `sync-client` and
`sync-gateway` suites both read them, so any silent shape change fails a test on both
sides. Changing a fixture's semantics is a wire-contract change requiring a spec review
(`20 §2.7`), not a casual regenerate.

## File-by-file

| file | responsibility | key exports (from `index.ts`) |
|---|---|---|
| `src/messages.ts` | the closed message set (11 zod schemas), the wire envelope, and both codecs | `PROTOCOL_VERSION`, `messageSchemas`, `MESSAGE_KINDS`, `MessageKind`, `ProtocolMessage`, `WireEnvelope`, `parseMessage`, `encodeMessage`, `decodeMessage`, `encodeCompressed`, `decodeCompressed`, `UnknownMessageKindError` |
| `src/transport.ts` | the transport seams the mesh + cloud sessions plug into (types only) | `MeshTransport`, `CloudTransport`, `TransportHandlers`, `CloudTransportHandlers`, `PeerInfo`, `Clock`, `TimerId` |
| `src/index.ts` | the package barrel — re-exports the above; the only public surface | — |
| `PROTOCOL.md` | human-readable protocol spec (24-F8 artifact): direction, body, per-kind notes | — |

## `messages.ts` — the schema + codec

Every message is `{ v: 1, kind, ...body }`. `PROTOCOL_VERSION = 1`. Schemas are keyed by
`kind` in `messageSchemas` and combined into a zod **discriminated union** on `kind`.
`MESSAGE_KINDS` is the closed list; nothing outside it is a valid message.

**The 11 message kinds** (real names from `messageSchemas`):

| kind | one-line role |
|---|---|
| `hello` | device→server auth + resume: `device_id`, `device_class`, `branch_id`, `token`, `last_global_seq`, `own_high_water` |
| `hello_ack` | server→device: `session_id`, `hub`, `resume_from`, **`relay_authorized?`** |
| `push` | device→server own events (lamport order) + `watermark`; events are bare `EventEnvelope` (not yet cloud-stamped) |
| `push_ack` | server→device write-checkpoint: `acked_watermark`, **`origin_device_id?`** |
| `event_batch` | server→device merged stream: `WireEnvelope[]` (may carry cloud-assigned `global_seq`) |
| `catchup_request` | device→server range fetch: `from_global_seq` |
| `catchup_response` | server→device paged pull: `events`, `complete`, `next_from` |
| `quarantine_notice` | server→origin: `event_id`, `reason` (event excluded from folds, 01-F37) |
| `purge_command` | server→device revocation: `scope: "all"` (wipe + re-register, 01-F42) |
| `ping` / `pong` | session liveness heartbeat: `{ t }` (hub election uses discovery pings, not these) |

**`WireEnvelope`** = `EventEnvelope` (from `@restos/domain`) `.extend({ global_seq?: int })`.
`push` carries plain `EventEnvelope[]` (a device never stamps `global_seq`); `event_batch`
and `catchup_response` carry `WireEnvelope[]` because the cloud may have assigned
`global_seq` on merge (01-F3). `global_seq` is a delivery cursor + compaction watermark
only — **never** an ordering input (folds read no ordering metadata; `26`, DEC-PERF-001).

**Codec — plain JSON (T-01-02, frozen):**
- `parseMessage(unknown)` → checks `kind` is a known key first (else throws
  `UnknownMessageKindError`), then `union.parse`. Unknown keys are **stripped** by zod
  (reject-or-drop, 01-F40 — a client can never smuggle in an extra field).
- `encodeMessage(m)` → `JSON.stringify` (returns a `string`).
- `decodeMessage(text)` → `parseMessage(JSON.parse(text))`.

**Codec — compressed framing (T-01-16, additive, NEW):**
- `encodeCompressed(m)` → `zstdCompressSync(utf8(encodeMessage(m)))` → `Uint8Array`.
- `decodeCompressed(bytes)` → `decodeMessage(utf8(zstdDecompressSync(bytes)))`.
- It is zstd of the **exact** plain-codec bytes, so the framing is **transparent**:
  `decodeCompressed(encodeCompressed(m))` deep-equals `m` for every kind, and a compressed
  frame decodes to the same `ProtocolMessage` the plain path produces. The plain codec is
  **byte-for-byte untouched** (T-01-02 golden fixtures must not drift). zstd is Node's
  built-in (`node:zlib`, synchronous — no new dependency; `18 §14`).
- Motivation: the catch-up transfer is part of the <60 s-on-4G budget, not an
  optimisation (`26 §6.4`, `01 §5` "JSON + zstd batch compression").
- **Follow-up (out of scope here):** *which* framing a connection uses is negotiated
  per-connection at the transport layer — DEC-SYNC-010 candidate. This package ships the
  codec pair + its transparency only; no negotiation logic lives here.

## `transport.ts` — the transport seam

Interfaces only (no implementation): sessions inject a transport and receive callbacks.
Declared **once here** so `sync-client` and the `@restos/testing` sim share one type and
cannot drift; no wire message or fixture changes (additive, 20 §2.7).

- **`MeshTransport`** — injected LAN transport: `start(handlers)`, `stop()`,
  `send(to, message)`. `send` is **fire-and-forget** (delivery not guaranteed; mesh
  correctness rests on event-id dedupe + re-push, 01-F8). Sim-only at this rung; real
  mDNS/WebSocket adapters are a later task.
- **`CloudTransport`** — injected device↔gateway uplink: `start`, `stop`,
  `send(message)`. `send` while up is fire-and-forget; sends while down are dropped
  (re-push on `onUp` + id-dedupe absorb the loss).
- **`TransportHandlers`** — `onPeerVisible(PeerInfo)`, `onPeerLost(device_id)`,
  `onMessage(from, message)`.
- **`CloudTransportHandlers`** — `onUp()`, `onDown()`, `onMessage(message)`.
- **`PeerInfo`** = `{ device_id, device_class }` (discovery announcement, 01-F12).
- **`Clock`** — the time seam (`now`, `setTimeout`, `clearTimeout`, `TimerId`): a
  wall-clock adapter in prod, a deterministic virtual clock in the sim (20 §2.4).

## Invariants

1. **Additive-only under `v: 1`.** New optional fields/kinds are allowed; a breaking
   change bumps `v` and ships an N−1 reader (`00 §6`). Every change on this branch has
   been additive.
2. **The closed message set is authoritative.** `MESSAGE_KINDS` / the discriminated union
   are the whole vocabulary; an unknown `kind` throws `UnknownMessageKindError`.
3. **Golden fixtures must not drift.** `src/__acceptance__/fixtures/*.json` is the
   committed contract shared by client + gateway; changing a fixture's semantics is a
   spec-review event (`20 §2.7`), never a casual edit.
4. **The plain JSON codec is byte-stable.** `encodeMessage`/`decodeMessage` are frozen by
   the T-01-02 fixtures; the zstd pair is a separate additive framing that must never
   alter them.
5. **No ordering metadata is authored here.** `global_seq` is a cursor/watermark only;
   folds read none of it (`26`, DEC-PERF-001).

## What's new (Wave 0)

- **T-01-16 — compressed framing.** `encodeCompressed` / `decodeCompressed`: transparent
  zstd over the plain JSON bytes (`01 §5`, `26 §6.4`). Plain codec byte-identical.
- **T-01-12 — hub-relayed uplink (DEC-SYNC-009, supersedes DEC-SYNC-004).** Additive wire
  fields: `push_ack.origin_device_id?` (names the ORIGIN device a relay/relayed-cloud ack
  describes) and `hello_ack.relay_authorized?` (the client-side gate for relaying a
  WAN-less peer's events). One origin per relay push. See `PROTOCOL.md`.
- **T-01-09 — device auth.** `relay_authorized` is composed **server-side** — the token's
  `hub_relay` claim AND an unrevoked, hub-eligible registry row (claim alone or registry
  alone grants nothing). The `token` field stays an opaque JWT string; auth claims such as
  `hub_relay` and `expires_at` live **inside** that string (jose-verified server-side),
  not as top-level wire fields. `purge_command` gained no ack kind — revocation redelivery
  is at-least-once by re-send (the message set stays closed).

All three landed **additive under `v: 1`** — no `v` bump, no fixture-semantics drift.

## Layout

```
src/
  index.ts        barrel (public surface)
  messages.ts     schemas + envelope + both codecs
  transport.ts    transport / clock interfaces
  __acceptance__/ oracle suites (read-only to implementers) + committed fixtures/
PROTOCOL.md       human-readable protocol spec
```
