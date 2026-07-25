# Senior review (audit-1.md, 2026-07-24) — follow-up docket

Verdict: kernel sound; ordering design would-stake-cash-on-it. Two merge conditions, both CLOSED:
- **F1 (HIGH) revoked-reader read-leak** — FIXED + delta-reviewed READY (`9a0c1ff`; oracle `5abb502`). Batched revocation cull at fan-out, post-commit/post-ack, fail-closed. Delta-review LOW notes (non-blocking): (a) async-gap TOCTOU on `peer.open` — a non-revoked peer that closes mid-cull-await still gets one send to a closing socket (benign, `sendAfterClose` no-throw; not revocation-related); (b) a transient cull-read error closes the PUSHER's socket post-ack (fail-closed, recovery via catchup) — accepted, wrapping in try/catch would be strictly worse (would leak).
- **F2 (MED) zstd doc overstatement** — FIXED (`c876ebd`, KERNEL.md corrected).

## Close-now batch (safe, defensive, no decision) — IN PROGRESS
- review #3 — unguarded `JSON.parse` of the quarantine blocker row (crash-wedge on corrupt row); guard like the Auditor's twin.
- my #1 / review §6 — Auditor leg-5 classifier read (`auditor.ts:436`) outside its try; null envelope aborts the org report. Guard it.
- review #5 — wedge-2 loudness: no test asserts the `lamport_gap` finding exists after a foreign pre-claim. Add the pin.
- follow-up #4 — `decodeCompressed` corruption-hardening tests (additive).

## Real tasks — need own loop (NOT close-now)
- review #4 — catch-up wedges SILENTLY on a permanent non-divergent rejection (unknown event type / version skew): `status()` shows no reason. Surface a blocked-cursor reason + a DECISIONS entry on version-skew policy. (cloud-session, protected)
- review #7 — valid pre-registration relay leaves a permanent merged-AND-quarantined placeholder (mask + stale notice); deeper than the filed heal→notice.
- follow-up — heal→notice reconciliation; live zstd framing wiring; fold-brand migration (DEC-MONEY-005, now unblocked).
- review #6 — widen quarantine key to (org, claimed_event_id, device_id) so a foreign pre-claim doesn't lose the honest event's bytes.

## Open after T-01-18 (auth) — four filed, none blocking

1. **Empty-backlog drain session has no in-session path to its renewal.** A device whose
   token expired while it had *nothing queued* is admitted in drain mode, but the renewal
   rides a `push_ack` — and it has no push to make. It must reconnect. Not invented
   around: an "empty push" rule would be new protocol surface, and the device is not
   blocked (it keeps selling locally, 01-F17). Closing it cleanly probably means letting a
   drain session request its own renewal explicitly, which is a new message kind and needs
   an FR.

2. **`BASE_T`-relative expiry is a time bomb for any wall-clock consumer.** Found the hard
   way in the X10 harness: a token minted with a default expiry derived from the test epoch
   is *already in the past* for a gateway running on the real clock, so every device was
   refused and the rung timed out. The general rule — **any component that mints a
   test-epoch-relative expiry but is consumed by a wall-clock service will fail silently
   and confusingly.** Worth a lint or a helper that makes the choice explicit.

3. **01-F11's 25%-remaining-life warning is host-side and untested.** The gateway cannot
   observe it; the oracle correctly pinned only the reachable proxy (a low-life token
   renews, an ample one does not) and deliberately did NOT pin the exact threshold. The
   honesty-UI warning itself needs a `sync-client` companion test when the host surface
   exists.

4. **01-F48's LAN half is unimplemented.** "The hub does the same on LAN" — the cloud side
   ships (`sweepRevocations`, fail-closed, ≤30 s); the hub-side eviction lives in
   `sync-client` and is not covered by the gateway suite.

## Owed regression test — T-01-17 hub re-election continuity

The branch-time discontinuity fixed in `e85f9a5` (a new hub re-anchoring the branch onto
its own untrusted clock) was **invisible to 291 green tests** — nothing exercised a hub
handover with differing clocks. The fix is in; the regression test is not. It belongs to
the T-01-17 oracle session, not the implementer (24 §3 step 2), and must pin: a hub
handover between devices whose raw clocks differ by years leaves every already-stamped
order's computed age unchanged.

**Two related questions the spec still does not answer** — same family, neither a defect
today: whether a *legitimate* clock correction (the hub gains WAN and NTP fixes it) should
slew rather than jump, and whether a duration spanning an epoch change needs marking.

## Open after T-01-21 — the last silent case in the credit law

**Double-claim stall (found by the T-01-21 oracle, not ruled).** Widening the quarantine
key retired every *byte-losing* case, but one refusal survives by design: when an origin
already holds a row for a claimed id **at a different slot** (a forged id reused across
two of its own slots), the gateway must not credit the second slot — crediting it would
fabricate coverage, and the fix-round-1 double-claim pin requires the refusal.

The residual is that this refusal is **silent**: the watermark never advances, so `hi`
never exceeds the last covered slot, so the Auditor sees no gap and reports nothing.
Review #5's objection — *silence is unrecoverable where loudness is not* — still has
purchase here, and T-01-21 did not change it.

Mitigating, which is why it is filed rather than blocking: the input is **forged** (an
honest device never reuses an event id across slots), and the device's own `push_ack`
stops advancing, so the device itself can tell. Nothing is lost — the bytes of both
claims are stored under the widened key.

Closing it needs a **new law**, not a patch: either double-claim rows extend the coverage
obligation, or doc-15 grows a stalled-device signal driven by a watermark that stops
moving while an outbox is non-empty. The second is likely better — it catches every
stall cause, not just this one. Needs its own loop and an FR.

## Founder decisions — surface, cannot code
- review #1 residual / F3-eager — eviction-latency SLA (eager `revokeDevice`→gateway hook) — candidate DEC.
- review #8 — fold money accumulators are unguarded doubles (DEC-MONEY-005 fold clause) — schedule, don't just document.
- review #9 — tokens without `expires_at` never expire; no aud/iss binding — auth hardening.
- DEC-TIME-001 (time layer); DEC-SYNC-010 (compressed framing — not filed); the 4 DECISION-PENDING product constants (CONTESTED_LINE_BILLABLE actively consumed); mid-session version-skew policy.
- review #11/#12 — mint-time attempt-id uniqueness trusted-not-enforced; divergent-parent cap tolerance split (gateway first-merged vs engine smallest) — document, don't "fix" one side without a ruling.
