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

## Founder decisions — surface, cannot code
- review #1 residual / F3-eager — eviction-latency SLA (eager `revokeDevice`→gateway hook) — candidate DEC.
- review #8 — fold money accumulators are unguarded doubles (DEC-MONEY-005 fold clause) — schedule, don't just document.
- review #9 — tokens without `expires_at` never expire; no aud/iss binding — auth hardening.
- DEC-TIME-001 (time layer); DEC-SYNC-010 (compressed framing — not filed); the 4 DECISION-PENDING product constants (CONTESTED_LINE_BILLABLE actively consumed); mid-session version-skew policy.
- review #11/#12 — mint-time attempt-id uniqueness trusted-not-enforced; divergent-parent cap tolerance split (gateway first-merged vs engine smallest) — document, don't "fix" one side without a ruling.
