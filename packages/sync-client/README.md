# @restos/sync-client

The **device-side sync engine**: the durable append-only event store, the
merge-semantics fold engine, the LAN mesh with an elected hub, and the cloud
uplink session. This is where **offline-first** actually lives — a sale is
persisted locally and acked to the UI before any network sees it, and the
device converges with its peers and the cloud without ever waiting on WAN.

> **PROTECTED PATH (20 §4.4).** Owning spec: `specs/01-kernel-sync.md`. Read it
> (and the routing table in the repo `AGENTS.md`) before touching anything here.
> Behavior changes cite a resolving FR ID; senior review is mandatory (CODEOWNERS).
> Folds must stay pure / commutative / idempotent — property tests are not optional.

This README is a **map for a cold reader**. The two deep design docs it points to
are the source of truth for their areas: [`FOLDS.md`](./FOLDS.md) (fold registry)
and [`HUB-ELECTION.md`](./HUB-ELECTION.md) (mesh state machine). See the caveats at
the end — both docs predate the code in places.

---

## 1. The mental model (read this before the file list)

If you are strong on fullstack but light on distributed systems, these six ideas
are the whole package. Everything else is plumbing around them.

**1. Append-only ledger.** The device stores events, never rows-you-mutate. A
correction is a *new* linked event, never an in-place edit or delete (01-F1). The
`events` table is this device's own authored stream; `peer_events` is everyone
else's, learned over the mesh or cloud. Nothing ever `UPDATE`s or `DELETE`s an
event row.

**2. Folds are materialized views over that ledger.** "What orders are open?",
"what's in the kitchen queue?" are not stored as authoritative state — they are
*computed* from the event set and cached in SQLite tables (`orders`, `queue`,
`parked`). A fold is a pure function `events → view`. Wipe the tables, replay the
events, you get byte-identical tables back. That is the reopen self-heal.

**3. The merge engine converges WITHOUT a total order — the big T-01-15 result.**
Two devices offline apply the same events in different orders (or a child arrives
before its parent). They must still land on identical views. The old engine did
this with a universal comparator that imposed an order; it has been *deleted*. The
new engine (`folds/merge.ts`) gives **every projected field its own merge rule** —
set-union, unique-keyed sum, monotone OR, a supersedes-DAG head-set, an explicitly
rendered "contested" set — each of which is order-independent by construction. The
engine reads **no ordering metadata at all**: no `global_seq`, no `lamport_seq`, no
device clock, no id comparison. This is 01-F34 (rewritten) and `specs/26`. Read
[`FOLDS.md`](./FOLDS.md) and §4 below. The invariant is verified not by "replay in
two orders and diff" (a min-id tiebreak passes that while smuggling a wall clock
through UUIDv7 id prefixes) but by **bijective id-relabeling + sequence/clock
injection invariance** — see `merge-invariance.test.ts`, the heart of the suite.

**4. `global_seq` is a delivery cursor, not a business arbiter.** The cloud
assigns each merged event a global sequence number. It answers exactly two
questions: "how far has this device caught up?" (a pull cursor) and, later, "what
can compaction prune?" (a watermark). It is stored in a **sidecar** table keyed by
event id, never mirrored onto the event row, and the fold engine never reads it.
Adopting a `global_seq` for an already-stored event is a sidecar insert with
**zero fold work** — this is the property the work-counters exist to prove.

**5. LAN mesh with an elected hub.** On a branch LAN, devices discover each other
and *deterministically* elect one hub (highest device-class rank, lowest id on a
tie). No consensus rounds — every device runs the same pure `electHub` on the same
visible-peer set and picks the same winner. Followers push their events to the hub;
the hub fans them out to the other followers. Two hubs after a partition is *safe*
(both only relay append-only events; heal is set-union + id-dedupe).

**6. The hub relays WAN-less devices to the cloud (DEC-SYNC-009).** The normal
deployment gives internet to *only* the counter terminal. A LAN-only waiter tablet
has no cloud session of its own — so the hub, which does have WAN, relays that
origin's events upward *verbatim* (unchanged device_id / lamport_seq / payload) and
propagates the cloud's per-origin ack back over the LAN. The origin advances its
own outbox checkpoint on hearing that ack; the hub never advances it. This
*supersedes* the old DEC-SYNC-004 no-proxy rule.

---

## 2. File-by-file

| file | responsibility | key exports |
|---|---|---|
| `index.ts` | Package entry — re-exports the device-side surface. | (barrel) |
| `device-store.ts` | The durable store + outbox + ingest seams + relay seam. SQLite. | `openStore`, `DeviceStore`, `PageItem`/`PageResult`, `IngestStats`, `DivergentDuplicateError`, `AckBeyondAppendedError` |
| `folds/merge.ts` | The merge-semantics fold engine (per-field rules, projections). | `createMergeEngine`, `MergeEngine`, `OpenOrderRow`, `KitchenQueueRow`, `ParkedRow`, `DropPlan`, `FoldStats`, `billedEffectiveFromJsonLines` |
| `fold-engine.ts` | Pure subpath `@restos/sync-client/fold-engine` — re-exports `folds/merge.ts` **only**, so the gateway's Auditor can refold with the *real* engine without loading the `better-sqlite3` native addon (T-01-11). | (re-export of merge) |
| `cloud-session.ts` | One device's WAN uplink: push, catch-up, live fan-in, relay drain. | `createCloudSession`, `CloudSession`, `CLOUD_PUSH_BATCH_MAX` |
| `mesh-session.ts` | The LAN mesh: solo/follower/candidate/hub machine, heartbeats, relay. | `createMeshSession`, `MeshSession`, `HEARTBEAT_*`, `HUB_LOSS_TIMEOUT_MS`, `HELLO_TIMEOUT_MS` |
| `hub-election.ts` | Pure winner function over the visible peer set. | `electHub` |
| `transport-ws.ts` | Real `ws`-package adapters realizing the injected transport seams. | `createWsLanTransport`, `createWsCloudTransport` |
| `wall-clock.ts` | Production `Clock` adapter (wraps `Date.now`/`setTimeout`). | `wallClock` |

Time and sockets are **always injected** (the `Clock` / `MeshTransport` /
`CloudTransport` seams from `@restos/sync-protocol`). The sessions schedule nothing
against the real clock directly — the sim leg supplies a virtual clock, the WS
adapters supply the wall clock. That is what makes the sessions deterministically
testable.

---

## 3. Major components

### `device-store.ts` — the store (~1000 lines, the spine)

`openStore({ path, identity }): DeviceStore` opens a SQLite database with
`journal_mode = WAL` (multi-handle reads + crash recovery) and, load-bearingly,
`synchronous = FULL` — **the plug-pull durability law outranks throughput**
(00 §5.2). Every write path below is one SQLite transaction; a validation failure
rolls back with *nothing* persisted.

Tables: `events` (own ledger, `lamport_seq UNIQUE`), `peer_events` (others', dedupe
by id, `UNIQUE(device_id, lamport_seq)`), `sync_state` (single-row write-checkpoint:
`acked_watermark`, `last_global_seq`), `global_seq_map` (the cloud-order sidecar),
`audit_chain` (this device's own audit HEAD), and the fold tables `orders` / `queue`
/ `parked`.

Key methods:

- **`append(input): EventEnvelopeT`** — the *only* way own events enter. Assigns the
  next gap-free `lamport_seq` and persists **before** returning (01-F2 / 01-F3):
  return *is* the durable-write ack the UI trusts. Re-appending a stored id is
  idempotent *only* for byte-identical retries; divergent content throws and the
  stored row is untouched (01-F8). For audit events it stamps the store-owned
  `prev_audit_hash` chain link inside the same transaction (01-F5).

- **`ingest(envelope, { global_seq? }): { stored }`** — the single-event branch-stream
  seam. Validates through the domain registry (nothing persists on failure, 01-F4),
  rejects cross-identity events (01-F9), dedupes by id. A duplicate id with
  *divergent* device-authored content throws **`DivergentDuplicateError`** rather
  than silently accepting it (that would leave two devices disagreeing under one id
  forever, 01-F34). A carried `global_seq` on a duplicate is adopted into the sidecar
  with zero fold work.

- **`ingestBatch(events): { appended, deduped, rejected }`** — one transaction for the
  whole batch; per-event failures roll back to a savepoint and are *counted*, not
  thrown. The valid remainder still lands. Used by the mesh (a `push`/`event_batch`
  frame is many events).

- **`ingestPage(items): readonly PageResult[]`** — **the three-ingest-seams answer to
  T-01-16.** Persists + projects a *whole catch-up page in ONE transaction (one
  fsync)*, but each item runs as a nested savepoint, so **per-event failure
  granularity is preserved**. Returns one ordered result per item —
  `{ ok: true, stored }` or `{ ok: false, error }` — so the caller computes the
  contiguous landed prefix and *passes* a `DivergentDuplicateError` instead of
  wedging the pull. Why it exists: the pre-batch cloud loop did one `ingest` (one
  fsync) *per event* — 10,000 fsyncs for a full catch-up. Naively wrapping the loop
  in a transaction would re-open a fixed bug; `ingestPage` batches the fsync while
  keeping the exact per-event pass/stop behavior (`26 §6.4`, and its load-bearing
  warning).

- **`assignGlobalSeq(event_id, global_seq)`** — sidecar-only adoption of cloud order
  for a stored event. **Zero fold work, zero state change** — `global_seq` is a
  delivery cursor, never a business arbiter (rewritten 01-F34). Idempotent on the
  same value; a divergent value, an unknown event, or a seq already held by another
  event is protocol corruption and throws loud.

- **`retentionDrop(keys)`** — the outer-layer key-set shrink (keys `order:<id>` /
  `line:<order>:<line>`). `engine.planDrop` computes the whole drop **purely** (a
  malformed key or an *open* order — no `settlement_closed` — rejects the entire call
  with nothing changed, 01-F42/01-F17). Then all SQL commits, and only *after* durable
  success does the in-memory lattice + session dropped-key memory mutate. **Not durable
  across reopen yet** — see §6.

- **`foldStats(): FoldStats` and `ingestStats(): IngestStats`** — the honesty
  work-counters. `foldStats.events_folded` is the *real* quantity (row-writes are a
  proxy an O(N) engine could game); it proves `global_seq` adoption does **O(1)**, not
  O(ledger), fold work. `ingestStats.commits` proves "one transaction per catch-up
  page" — otherwise "batched the fsync" is not black-box assertable. These are the
  T-01-14/T-01-15 counter mandate carried into T-01-16.

- **Relay seam** (`requestRelayDrain` / `onRelayDrainRequested` / `cancelRelayDrain` /
  `noteRelayedCloudAck` / `relayedCloudAck` / `noteRelayedQuarantineNotice` /
  `relayedQuarantineNotices`) — **volatile, in-memory** cross-plane signals between
  this device's mesh session (LAN) and cloud session (WAN). The store handle carries
  them only because it is the one object both sessions share. Never persisted: a
  restarted hub re-relays from zero and id-dedupe + per-origin acks absorb the overlap
  (DEC-SYNC-009, T-01-12).

- `readAllEvents()` returns own ∪ peer, sorted by `(device_id, lamport_seq)` — so
  per-origin order holds at every reader. `nextBatch` / `advanceTo` are the cloud
  outbox drain + write-checkpoint move (never a row delete, 19 §5).

### `folds/merge.ts` — the merge engine (~870 lines)

The heart. Each order is one `Entity` holding a bundle of grow-only lattices, and
each projected field is derived by its **own declared merge rule**:

- **G-Set / G-Map union** — confirms, closes, assignment-DAG nodes, line edges: add
  a member, never remove one.
- **Unique-keyed sum (UKS)** — money. Payments/refunds sum *only over agreed members*
  of an attempt key; a *disputed* attempt (two divergent members under one key)
  contributes **zero** to every total and is rendered as an exception, never
  arbitrarily picked (01-F31).
- **Monotone facts** — "confirmed", "settled" are OR over a G-Set; once true they never
  go false.
- **Supersedes-DAG head-set** — table assignment: materialized tombstones (the union
  of every delivered `supersedes`), head = non-tombstoned nodes; >1 distinct head value
  = a rendered conflict.
- **Contested set** — line workflow state projects the ≼-max over legal edges; a
  contested terminal pair is rendered as a *sorted set of both*, with an anomaly, not
  collapsed to one.

The projection-key **sidecar** and **key-presence parking**: everything that carries
its full projection keys folds immediately; only the two *bare order-fact* types
(`order.confirmed`, `kot.printed`) **park** while their `order_id` is absent, indexed
by `waiting_for`, so a create drains *only* the events waiting on that key (01-F10
amended). `assertNever(type)` gives compile-time exhaustiveness — a new registry event
type without a merge rule **fails to compile** (it must not silently no-op while still
counting fold work).

**The one thing a reviewer must hold onto:** every branch in `foldIn` is a
union/insert — commutative and idempotent by construction — and reads **no clock, no
seq, no device-id order**. The correctness bar is *not* plain replay-convergence; it is
**bijective id-relabel invariance + sequence/clock injection invariance**
(`merge-invariance.test.ts`). If you find any code here comparing ids *for ordering*
(as opposed to identity / anchor *selection*), that is a bug. The single sanctioned
clock read is documented inline: the confirm anchor's *value* still stamps
`device_created_at` until DEC-TIME-001 lands — anchor *selection* is clock-free
(argmin over `(payloadHash, id)`). See [`FOLDS.md`](./FOLDS.md) and `specs/26`.

### `cloud-session.ts` — the WAN uplink

`createCloudSession({ store, transport, clock, device_class, token })`. On `hello_ack`
it drains the outbox to the gateway's `push_ack` (which moves `store.advanceTo` — THE
real write-checkpoint, unlike the volatile LAN cursor), then catches the branch stream
up from the *exclusive* `global_seq` cursor. It acts only in response to transport
edges and inbound messages — no `Date.now`, no self-scheduled timers (reconnect is the
transport's job).

`applyEvents` is the convergence-hole guard worth reading closely. It ingests a whole
page via `store.ingestPage`, then advances the pull cursor **only through a contiguous
prefix of events that actually landed**. A transient ingest failure *stops* the advance
so catch-up re-delivers that event — the earlier bug moved the cursor to the batch
maximum regardless and skipped the failure forever. The *one* exception: a
`DivergentDuplicateError` is permanently known-bad (its id is already stored;
re-fetching cannot help), so it is surfaced in `status().quarantined` and the cursor
*passes* it rather than wedging the pull (01-F17).

Relay half (DEC-SYNC-009): when the mesh signals it is acting hub **and** the gateway
advertised `relay_authorized`, this session relays held peers' events upward — one
origin per push, verbatim — and records the per-origin cloud acks (never its own
checkpoint) for the mesh to propagate. Suppression: an origin the gateway's registry
gate refuses (`origin_unregistered` / `origin_revoked`) is dropped from relay for the
session's life (re-pushing it would loop forever), cleared on the next `hello_ack`.

### `mesh-session.ts` — the LAN mesh

`createMeshSession(...)` runs the **solo → follower → candidate → hub** machine. Election
is the pure `electHub` re-run on *every* peer-set change; see
[`HUB-ELECTION.md`](./HUB-ELECTION.md). Hub pings followers every 2 s; a follower marks
the hub lost after 3 missed (6 s); re-election budget < 10 s (01-F13). The plain hub
ack is session-local and **never** moves `store.advanceTo` — only a `push_ack` whose
`origin_device_id == self` (the hub-relayed *cloud* ack) does, and that is the origin's
own act.

The subtle fix a reviewer should notice: **suspicion clears only on inbound traffic
from the suspect, and clearing a real suspect recomputes immediately.** A false
hub-loss firing exactly at a heal boundary could otherwise park this device in state
`hub` with the true hub still visible and *no* future visibility event to trigger a
recompute — split-brain wedged forever, taking every relayed-cloud-ack forward with it.
The recompute runs *before* the message body so the frame is handled under the
re-adopted state (`dispatch`, top).

### `hub-election.ts`, `transport-ws.ts`, `wall-clock.ts` (brief)

- **`hub-election.ts`** — `electHub(peers)`: the `(rank, device_id)`-minimal eligible
  peer, where rank is the index in `HUB_ELIGIBLE_CLASSES`; ineligible classes never
  win; `null` if nothing eligible is visible. Permutation-invariant by construction.
- **`transport-ws.ts`** — two `ws` adapters over the injected transport seams.
  `createWsLanTransport` wraps out-of-band `announce` frames and wire `ProtocolMessage`s
  on one bidirectional socket; malformed frames are dropped, never crash the transport.
  `createWsCloudTransport` dials the gateway `/sync` route with timer-based reconnect.
  Additive only — no wire-message changes.
- **`wall-clock.ts`** — `wallClock`: the production `Clock` (methods wrap the globals so
  `this` binding stays safe).

---

## 4. Invariants a reviewer must hold

1. **No ordering metadata in folds (01-F34).** The engine reads no `global_seq`, no
   `lamport_seq`, no device clock, no id *ordering*. Verified by relabel + injection
   invariance, not plain replay. (Sanctioned exception: the confirm-anchor *value*
   stamps `device_created_at` until DEC-TIME-001 — flagged, not silent.)
2. **Persist-before-ack (01-F2).** `append` returns only after the durable SQLite
   commit; `synchronous = FULL` makes that a real fsync. The UI ack is the return.
3. **A sale is never blocked (01-F17).** Append never fails or blocks for a fold
   reason — missing parents *park*, they don't reject. A divergent duplicate on
   catch-up is *passed*, not a wedge.
4. **Folds are pure / commutative / idempotent.** State is a function of the event
   *set*; replay order is irrelevant; reopen self-heals by full replay.
5. **Append-only (01-F1).** No path `UPDATE`s or `DELETE`s an event row. Cloud order,
   the audit HEAD, and retention all live in sidecars or checkpoints.

---

## 5. What's new / where the bodies are buried

- **The T-01-15 engine replaced a deleted O(N²) universal comparator.** The old
  `replay.ts` (a sort-then-compare engine that imposed a total order and implemented
  the now-*superseded* law) is **gone**. If you are reconciling against `git` history
  or older docs, that is the discontinuity. `folds/merge.ts` is its replacement.
- **`retentionDrop` is session-durable-only.** It shrinks the fold tables + the
  in-memory lattice, but the *ledger* rows survive, so a **reopen legitimately rebuilds
  the dropped keys** from the full retained ledger. True durable pruning is the
  compaction task's `global_seq` prune-watermark (01 §5), not yet built. The engine's
  session dropped-key memory (`droppedOrders` / `droppedLines`) deliberately survives
  an in-session `refold()` but not a reopen.
- **The fold-brand / money-helper migration (DEC-MONEY-005) is deferred.** Money in the
  fold engine is raw integer paisa arithmetic (`amount_paisa as number`, sums); the
  branded-type + `splitPaisa`/`applyRateBps` helpers land in T-01-13 and are not wired
  through here yet.
- **zstd (the other half of T-01-16) is not in this package.** The compression lives in
  the `@restos/sync-protocol` wire codec (`encodeMessage`/`decodeMessage`), which these
  transports consume as-is. This package only supplies the *batched persistence* half
  (`ingestPage`).
- **The relay-drain candidate rule is flagged, not ratified.** `cloud-session.ts`
  `relayDrain` documents its "every same-branch peer origin" rule as
  implementer-proposed, pending oracle review.

## Doc caveats (flagged, not fixed here)

- [`FOLDS.md`](./FOLDS.md) is the **pre-implementation (T-01-04) artifact**. Its laws
  paragraph still describes the *superseded* comparator model (e.g. "LWW entities
  tiebreak on cloud `global_seq`"), its `orders` schema (a single `table_id` column)
  does **not** match the shipped 15-key `OpenOrderRow`, and only 2 of its 6 listed folds
  (`open_orders`, `kitchen_queue`) are implemented. Trust `folds/merge.ts` + `specs/26`
  over it for merge semantics; use it for the *registry/intent* overview.
- [`HUB-ELECTION.md`](./HUB-ELECTION.md) line 10 still says DEC-SYNC-009 relay is
  "NOT YET BUILT" — it **has** shipped (T-01-12; the relay seam, `cloud-session.ts`
  relay half, and the mesh forwards). The election, heartbeat, and split-brain sections
  remain accurate.
