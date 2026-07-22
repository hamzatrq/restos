# Wire protocol design (24-F8 artifact for spec 01 — implementation follows in T-01-02)

Transport: WebSocket (cloud + LAN, one framing), JSON messages, permessage-deflate. Every message: `{ v: 1, kind, ...body }`. Idempotency: event `id` dedupes everywhere (01-F8); no message requires ordered delivery beyond per-device `lamport_seq`.

| kind | direction | body | notes |
|---|---|---|---|
| `hello` | device → hub/cloud | `{ device_id, device_class, branch_id, token, last_global_seq, own_high_water }` | auth + resume point; server validates class/slice (01-F40) |
| `hello_ack` | ← | `{ session_id, hub: bool, resume_from, relay_authorized? }` | **Additive (DEC-SYNC-009):** `relay_authorized: true` advertises that the session's token carries the hub-relay capability (the T-01-09 seam); a device must not push third-party events on a session that was not advertised — an unadvertised relay attempt quarantines `device_mismatch` |
| `push` | device → | `{ events: Envelope[], watermark: lamport_seq }` | own events, lamport order (01-F8). **DEC-SYNC-009 (implemented, T-01-12):** a session whose token carries the hub-relay capability may also push events whose `device_id` is a same-org/branch WAN-less peer's — relayed verbatim, attested not re-authored (01-F1); the cloud tracks lamport contiguity per ORIGIN device and `watermark` is per-origin. One origin per relay push message (the scalar ack below answers that origin). Additive under `v:1` |
| `push_ack` | ← | `{ acked_watermark, origin_device_id? }` | device advances outbox only on ack (write-checkpoint, 19 §5). **Additive (DEC-SYNC-009):** `origin_device_id` is present iff the ack answers a relay push — it names the ORIGIN device whose stream `acked_watermark` describes. The same shape carries the relayed CLOUD ack hub→origin over LAN (`origin_device_id` = the receiving origin's id); that relayed cloud ack is the ONLY LAN `push_ack` that may move the origin's cloud write-checkpoint — the plain LAN hub ack stays session-local and volatile (19 §5) |
| `event_batch` | hub/cloud → device | `{ events: (Envelope & { global_seq?: int })[] }` | merged stream, slice-filtered per class (01-F39/F40); `global_seq` present once cloud-assigned (01-F3) |
| `catchup_request` | device → | `{ from_global_seq }` | range fetch (01-F9) |
| `catchup_response` | ← | `{ events, complete: bool, next_from }` | paged |
| `quarantine_notice` | → origin device | `{ event_id, reason }` | 01-F37 — event excluded from folds; correction flow is operator-side. **Clarified (T-01-08, DEC-SYNC-008/DEC-SYNC-009):** the cloud live-sends to the PUSHING session and durably redelivers on the origin's next own `hello`; when the pusher was a relaying hub, the hub forwards the notice over the LAN to the WAN-less origin (same body, at-least-once — duplicates legal). No new kind or field; additive under `v: 1` |
| `purge_command` | → device | `{ scope }` | revocation (01-F42); device wipes local DB, acks, re-registers |
| `ping` / `pong` | both | `{ t }` | liveness for hub election (HUB-ELECTION.md) |

LAN vs cloud: identical message set; hub relays `push` upward and fans `event_batch` branch-wide (01-F13). Slice predicates (waiter/rider classes) are enforced at the sender (hub or cloud), never client-declared. Schema evolution: additive under `v: 1`; breaking bumps `v` with an N−1 reader (00 §6).
