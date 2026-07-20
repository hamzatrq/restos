# Wire protocol design (24-F8 artifact for spec 01 — implementation follows in T-01-02)

Transport: WebSocket (cloud + LAN, one framing), JSON messages, permessage-deflate. Every message: `{ v: 1, kind, ...body }`. Idempotency: event `id` dedupes everywhere (01-F8); no message requires ordered delivery beyond per-device `lamport_seq`.

| kind | direction | body | notes |
|---|---|---|---|
| `hello` | device → hub/cloud | `{ device_id, device_class, branch_id, token, last_global_seq, own_high_water }` | auth + resume point; server validates class/slice (01-F40) |
| `hello_ack` | ← | `{ session_id, hub: bool, resume_from }` | |
| `push` | device → | `{ events: Envelope[], watermark: lamport_seq }` | own events, lamport order (01-F8). **Pending (DEC-SYNC-009):** a session authenticated as branch hub may also push events whose `device_id` is a WAN-less peer's — relayed verbatim, attested not re-authored; the cloud then tracks lamport contiguity per ORIGIN device and `watermark` becomes per-origin rather than per-session. Additive under `v:1`. NOT YET IMPLEMENTED — the gateway currently quarantines a device mismatch |
| `push_ack` | ← | `{ acked_watermark }` | device advances outbox only on ack (write-checkpoint, 19 §5) |
| `event_batch` | hub/cloud → device | `{ events: (Envelope & { global_seq?: int })[] }` | merged stream, slice-filtered per class (01-F39/F40); `global_seq` present once cloud-assigned (01-F3) |
| `catchup_request` | device → | `{ from_global_seq }` | range fetch (01-F9) |
| `catchup_response` | ← | `{ events, complete: bool, next_from }` | paged |
| `quarantine_notice` | → origin device | `{ event_id, reason }` | 01-F37 — event excluded from folds; correction flow is operator-side |
| `purge_command` | → device | `{ scope }` | revocation (01-F42); device wipes local DB, acks, re-registers |
| `ping` / `pong` | both | `{ t }` | liveness for hub election (HUB-ELECTION.md) |

LAN vs cloud: identical message set; hub relays `push` upward and fans `event_batch` branch-wide (01-F13). Slice predicates (waiter/rider classes) are enforced at the sender (hub or cloud), never client-declared. Schema evolution: additive under `v: 1`; breaking bumps `v` with an N−1 reader (00 §6).
