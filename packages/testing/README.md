# @restos/testing

**Owning spec: `specs/20-testing-correctness.md`.** Read it before touching anything here.

Deterministic simulation harness for the sync engine. It is **test infrastructure, not
shipped product** — no app imports it, only `__acceptance__` suites do.

## What this package is

A **virtual LAN + virtual cloud** that lets the sync engine (`@restos/sync-client`) be
exercised with **no real sockets, no Postgres, no wall-clock timing**. Everything runs on a
single-threaded virtual clock driven by a seeded RNG: same seed + same script ⇒ deep-equal
`trace()`. Convergence, partition/heal, hub-election, catch-up, and quarantine scenarios all
become reproducible, millisecond-free unit tests.

**Why an auditor should care:** this is the **sim leg** of the `DEC-TEST-002` dual-gate. The
gate is *sim + real-process smoke* — the sim leg proves protocol behaviour reproducibly here;
a follow-on real-core leg (`20 §2.7`) re-runs the same transcripts against the real gateway
core to pin this harness to reality (the "XP transcript parity" check). Both legs must agree.
If this harness is wrong, the sim-leg tests are green against a fiction.

## Files

| File | Responsibility | Key exports |
|---|---|---|
| `src/index.ts` | Public surface (barrel). | `createSim`, `createSimCloud`, and their types |
| `src/sim.ts` | Virtual clock + virtual LAN: deterministic scheduler, message delivery, drop/partition/duplicate policy, timer control. | `createSim`, `Sim`, `SimLan`, `TraceEntry` |
| `src/sim-cloud.ts` | In-memory cloud double mirroring the landed `sync-gateway`'s laws, over the transport seam only. | `createSimCloud`, `SimCloud`, `MergedEvent`, `CloudTranscriptEntry`, `SimCloudState`, `CATCHUP_PAGE_SIZE`, `WAN_LATENCY_MS` |

`package.json`: private, no build (`"scaffold stub"`), deps `@restos/domain` +
`@restos/sync-protocol` only. Self-tests live in `src/__acceptance__/`.

## Surface — `sim.ts` (virtual clock + LAN)

`createSim({ seed })` returns a `Sim`. One `mulberry32(seed)` is the **sole** randomness
source; there is no `Date.now`/`Math.random` anywhere. A single priority queue executes tasks
in strict `(due, schedule-seq)` order — timers and deliveries interleave deterministically.

- **Advance time:** `run()` (drain to quiescence), `runFor(ms)` (advance exactly `ms`),
  `runToQuiescence({ maxVirtualMs })` → `true` if idle before budget, `false` if work remains.
  `now()` reads virtual time; `trace()` returns the ordered `TraceEntry[]` (timer fires +
  actual deliveries) — the reproducibility fingerprint.
- **The Clock seam** (`sim.clock`) is what the mesh consumes: `now` / `setTimeout` /
  `clearTimeout`. Cancelled timers never fire and never enter the trace.
- **A device joins:** `sim.lan.attach(peer)` → a `MeshTransport`; its `start(handlers)`
  triggers `onPeerVisible` diffing. Visibility changes are scheduled *through the queue*
  (never re-entrant).
- **Topology:** `partition(...groups)` (an **unlisted device is isolated**), `heal()`,
  `disconnect(id)` / `reconnect(id)`.
- **Wire policy:** `policy({ latency:[min,max], dropRate, duplicateRate })`. Note the fixed
  per-send RNG draw order: **drop → latency → duplicate → duplicate-latency**. Sends to an
  unreachable peer are dropped at *send* time (nothing queued — a healed partition never
  resurrects cross-cut messages); reachability is re-checked again at *delivery* time.
- **Codec on every hop:** each send `encodeMessage`s and each delivery `decodeMessage`s
  independently, so the `T-01-02` codec is exercised on every hop and duplicates are
  independent decoded copies.

## Surface — `sim-cloud.ts` (the gateway double)

`createSimCloud({ sim })` is an **in-memory stand-in for the landed `sync-gateway`**, so the
sim leg can drive `createCloudSession` without Docker/Postgres. WAN links use a **fixed
`WAN_LATENCY_MS` (50), no RNG** (the sim's seeded randomness stays LAN-side) and are
**reliable-or-down** — loss manifests as `onDown`, never a silent in-connection drop.

`transportFor(id)` yields a per-device `CloudTransport`; `cut()`/`heal()` (global WAN
outage), `cutFor(id)`/`healFor(id)` (one link); inspectors `state()`, `mergedStream()`,
`transcript()`.

**Mirrored gateway laws** (the double reproduces these on purpose):

- `global_seq` **dense from 1** in arrival order (per-org counter).
- **Dedupe by event id** (`01-F8`) — a stored id skips; its slot is already filled.
- **Stop-at-gap contiguity, tracked per ORIGIN device** — the *envelope's* `device_id`, not
  the session's (`DEC-SYNC-009`/`T-01-12`: a hub session relays WAN-less peers' events
  verbatim). One origin per push; the scalar `push_ack` answers that origin, carrying
  `origin_device_id` when relayed.
- `hello_ack.resume_from = acked_watermark + 1` (0 when none). **No `push_ack`** when nothing
  is contiguously persisted.
- Post-commit fan-out as **one `event_batch` including the origin**, both cloud stamps
  (`server_received_at` + `global_seq`) merged into each wire event (`01-F9`/`01-F34`).
- Catch-up: exclusive cursor, ascending, pages of `CATCHUP_PAGE_SIZE` (500 — kept equal to
  the gateway's; `next_from` echoes the cursor on an empty page).
- **`storage_reject`:** any string containing `U+0000` quarantines the envelope verbatim,
  fills the origin's slot, consumes **no** `global_seq` (`DEC-SYNC-005`), and sends a
  `quarantine_notice` to the *pushing* session (`01-F37`).

**Deliberately NOT mirrored — auditor, read this:** the double does **not** verify
signatures and has **no device registry**. Auth (identity/schema/divergence quarantine
classes, JWS signature + registry) **stays gateway-only**, tested separately at `T-01-07`/
`T-01-09`. `relayAuthorized()` only *reads* JWS claims (middle segment) for the `hub_relay`
flag and treats an opaque non-JWS token as relay-capable so the sim can exercise relay
without the auth machinery. This is the **double-drift trap**: because the double mirrors a
*subset*, a divergence in any mirrored law would make sim-leg tests pass falsely — which is
exactly what the real-core XP-parity leg exists to catch.

## Invariants

1. **Determinism.** No `Date.now`, no `Math.random`; one seeded `mulberry32`; single-threaded
   `(time, seq)` execution. Session ids are a counter (`cloud:<id>:<n>`), not `newId()`. Same
   seed + script ⇒ deep-equal `trace()`.
2. **No double-drift.** Every mirrored law above must stay byte-identical to the landed
   gateway's; the committed XP transcript (a plain signed token with no `hub_relay` claim
   produces no `relay_authorized`) must stay byte-identical to the real gateway's output.
3. **Seam-only, no cycles.** Consumes only `@restos/sync-protocol` (transport) + `sim.clock`
   + `@restos/domain` types — never `sync-client`.

## How the auditor should read it

Treat this as **the yardstick, not the thing measured**. Its green tests are only as
trustworthy as the double's fidelity to the real gateway. So:

- Verify each **mirrored law** in `sim-cloud.ts` against the gateway spec (`T-01-07`, `01-F8/
  F9/F34/F37`, `DEC-SYNC-005/009`) — a subtle mismatch here silently weakens every sim-leg
  suite that depends on it.
- Confirm the **auth boundary** holds: this double must *not* mirror signature/registry, and
  it does not — that separation is intentional, not an omission to fix.
- Trust the **XP transcript parity** leg (`20 §2.7`) as the backstop that pins this harness to
  the real core; if that leg is absent or stale, the sim leg stands on an unchecked double.
