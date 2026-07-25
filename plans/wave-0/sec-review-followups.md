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

## ✅ ADVERSARIAL REVIEW OF THE POST-REVIEW ROUND — ALL FINDINGS RESOLVED

**Status after two fix rounds (`9dc9800`, `bbcfd6a`):** B1 · B2 · B3 · H1 · H2 · H2b ·
M1 · M2 · L1 — **all closed.** Four needed founder rulings and got them (H2 prefer
clock-synced devices; H2b a solo device's clock IS branch time; M2 keep forgery
attempts visible; B1 the sync engine stores its own token). Suites green throughout:
domain 131, sync-protocol 62, sync-client 320, testing 49, gateway 195.

**Still owed, and the reason this round mattered:** these were all found AFTER six
tasks were reported green, by an adversarial pass reading the code rather than the
commit messages. Three were blocking. The regression tests for B1/B2 (end-to-end
renewal survival; a live fan-out batch arriving while the cursor is blocked) do NOT
exist — the fixes are verified by the existing suites not regressing, which is weaker
than a pin. **Those belong to an oracle session, not the implementer**, and are the
last thing standing between this branch and a clean merge.

Full findings below as originally written.

Found by the `24 §3` adversarial leg over `fdb4efd~1..HEAD`, after all six tasks were
reported green. **All three blockers were verified against the code, and each
contradicts a claim in my own commit messages.** Every suite was green throughout —
these are end-to-end gaps that per-task oracles structurally could not see, because
each oracle pinned its own side's contract.

**B1 — Token renewal is never applied; the fleet's cloud plane dies at T+90 days.**
The gateway mints and sends `renewed_token` correctly. **No client reads it** (two
producer sites, zero consumers), `registerDevice` never seeds `token_expires_at` (so a
relayed origin is never "due"), and the hub's `forwardCloudAck` rebuilds the LAN
`push_ack` without the field. At day 90 a device enters drain mode; with an empty
outbox it has no push to earn a renewal on, its `catchup_request` is refused, the
socket closes, and it reconnects at 1 Hz forever with `blocked: null` and no
indication why. **A hub in this state strands the entire branch** — the DEC-SYNC-009
failure re-created by the auth task. Reachable by the passage of time alone, fleet-wide
and simultaneous. Violates 01-F47, 01-F48, 01-F11, commandment 4.
*Also correct the residual filed below: "it must reconnect" is wrong — reconnecting
presents the same expired token and the same empty outbox. It is a permanent wedge.*

**B2 — The blocked cursor is erased AND skipped by the next live fan-out batch.**
`applyEvents` serves both `catchup_response` and live `event_batch`, and
`blockedCursor = report` is unconditional. One sale on any other terminal produces a
clean batch that clears the report and advances `last_global_seq` past the blocking
sequence — which is then never re-requested. Violates DEC-SYNC-011(a) AND (b)
("stop-and-report, **never skip** … skipping is unrecoverable"), 01-F9, 01-F34.
Reachable within seconds on any multi-device branch. The doc-comment claiming it
"clears only when the cursor advances past the blocking sequence" is false.

**B3 — Neither ratified auth guarantee is wired at the composition root.**
`sweepRevocations` is exported and called by nothing outside tests (no timer, no
LISTEN/NOTIFY, no hook in `buildServer`), so 01-F48's ≤30 s eviction does not exist in
the shipped server — revocation still waits for voluntary contact. And `buildServer`
passes only `token_secret`, so `iss`/`aud` are never configured and a staging token
validates against production. Both FRs are marked `by: T-01-18` in
`conformance/wave-0-scope.yml`; the artifact does not exhibit them.

### HIGH / MED, same review

- **H1 fail-closed is implemented as fail-DESTRUCTIVE.** `sweepRevocations`' catch sets
  `revoked = every device in the org` and then sends each one `purge_command
  {scope:"all"}` before dropping it. A transient DB error therefore orders an org-wide
  wipe. Inert today (no client purge handler exists), but 01-F42's device-side purge is
  a scheduled item — landing it arms this into org-wide destruction of unsynced local
  ledgers. 01-F48 says unreadable state means *refuse participation*; purge is not
  refusal. Fix: drop sessions, do not purge.
- **H2 the confirm anchor elects the least trustworthy clock.** `argmin(branch_created_at,
  id)` ignores `time_basis`, and a `branch_provisional` stamp IS the raw device clock
  (offset 0). Because the tiebreak is `min`, a device whose clock is behind always wins.
  A tablet booted before the counter, confirming an order, sets `confirmed_at`/`age_basis`
  years in the past — converged identically on every screen, with no basis marker on the
  projection for a UI to flag. So `01-F45` is closed for `branch` events only, and
  `merge.ts`'s "the engine now reads no device clock at all" is false for provisional
  ones. **Needs a ruling** (prefer `branch` over `branch_provisional` members? mark the
  row?), not a silent patch.
- **H2b (ruling needed, oracle-pinned).** A solo/hub device records `acquired = 1` at
  offset 0, so a T1 single-terminal restaurant stamps `time_basis: 'branch'` on every
  event from a completely unverified clock. `01-F44`'s text reads the other way. Doc 16
  must not read `branch` as "verified".
- **M1 one money accumulator is still a raw double**, and the extended lint rule does not
  reach it: `maxRefundClaimByParent.set(parent, (… ?? 0) + Math.max(...amounts))` decides
  `cap_violated`, sums in Map-insertion (ingest) order, and neither operand is a
  money-named identifier or member. Same absurd-magnitude precondition as the case
  T-01-22 did fix, so "fold money in BigInt" is overstated.
- **M2 supersede-on-merge is not scoped to the claimant — NEEDS A RULING, not a fix.**
  The UPDATE omits `device_id` despite the key having just been widened, so a forger's
  evidence row is marked superseded when the honest event merges: the bytes survive but
  the forgery attempt leaves the doc-15 live surface and its notice is cancelled.
  **Attempted and reverted:** adding `device_id = envelope.device_id` breaks the
  RATIFIED review-#7 requirement, because the pre-registration placeholder is attributed
  to the relaying HUB (T-01-12 F2 attribution law), not to the origin — an author-scoped
  predicate leaves it live forever. The two requirements genuinely conflict.
  The distinguishing fact is the **stored envelope's authorship**: the hub's placeholder
  holds the origin's envelope verbatim (a relay never re-authors), while a forger's row
  holds a different envelope claiming the same id. So the correct predicate is about the
  stored bytes, not the row's attribution column — and `quarantine.envelope` is TEXT that
  may not be valid JSON (storage_reject rows exist precisely because Postgres could not
  hold them), so a bare `::jsonb` cast would throw inside the merge transaction and wedge
  the push (01-F17). Needs its own loop.
- **L1** `schema.ts:66-73` still documents heal-in-place as live; that UPDATE was deleted
  in T-01-21. Protected path — the next session will work from it.

### Confirmed sound by the same review
Compression negotiation (no stranding in either direction, per-connection scoping,
handshake always plain); branch time surviving the wire in all four paths and the
retry path carrying stored stamps; hub re-election continuity (`e85f9a5`); the renewal
intersection being genuinely non-escalating; drain mode's read surface; the quarantine
widening's byte-preservation and the `listQuarantine` total-order fix; the BigInt
migration where applied, including the Auditor's `money_overflow` short-circuit.

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
