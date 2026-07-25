# Recorded rulings — known, deliberate, not defects to "fix" in passing

Two items from the senior review (`audit-1.md` #11, #12) that must be **documented rather
than silently patched**: in both, one plane could be changed to match the other in five
minutes, and picking the wrong side would be a money bug. Each is written here so the
next session finds the reasoning instead of re-deriving it — and so nobody "tidies" one
side without a ruling.

> **BOTH ARE NOW RULED (founder, July 2026).** The analysis below stands as the record of
> *why*; the decisions are stated at the head of each section and promoted into the FRs
> (`01-F31` for R1, `01-F29` + DEC-SYNC-007 for R2). Implementing task: **T-01-21**.

## R1 — `settlement_attempt_id` uniqueness is trusted, not enforced (review #11)

**RULED: detect and alarm, never reject.** The gateway checks org-global uniqueness and
raises a loud fleet-health + Auditor anomaly on collision, but still merges the event.
The rejecting variant analysed below is refused on the 01-F17 grounds it names.

`01-F31` (ratified, DEC-MONEY-008) makes the token **org-globally unique, UI-minted,
UUID-class**. The entire unique-keyed-sum money algebra (`26 §7`) rests on it: a colliding
key collapses two genuine payments into one and **cash vanishes silently, converged
identically on every device**.

**What is actually enforced today:** nothing at mint time, and nothing cross-order at the
gateway. The spec itself concedes the limit — "cross-**order** attempt-id collision is
fold-undetectable in principle — enforcement is mint-time + gateway". The fold cannot see
it (two orders, two entities, no shared lattice). The gateway *could* enforce
org-global uniqueness with a unique index, but does not.

**Status: trusted.** This is a real, stated residual, not an oversight. It is safe under
UUID minting (collision probability is negligible) and unsafe under a per-device counter,
which is exactly what `01-F31` forbids in so many words.

**Do not "fix" this by making the fold detect it** — that is the one thing proven
impossible. The available fix is a gateway-side org-global unique index on
`payload->>'settlement_attempt_id'` for `payment.recorded`, which is cheap but has a
sharp edge: it converts a client bug into a **quarantine** (event refused at merge)
rather than an anomaly, and a device whose UI mints badly would have real sales rejected.
That trade needs a founder ruling before it lands, because it can block a sale (01-F17).

## R2 — divergent-parent cap tolerance splits between gateway and engine (review #12)

**RULED: the gateway stops picking.** A disputed parent attempt key makes the cap
unprovable, so the refund passes through with the anomaly flagged — matching both
DEC-SYNC-007's fold-free-provable scope and the engine's disputed-contributes-zero law.
The recommendation below is now the decision; implement it in T-01-21.

The refund cap (`01-F29`) is evaluated in two places with **two different tie policies**:

- **Gateway** (`services/sync-gateway/src/gateway.ts`, the `checkInvariants` parent
  lookup): resolves the parent payment by `settlement_attempt_id` with
  `order by global_seq asc limit 1` — **first-merged wins**, and the comment says so.
- **Engine** (`packages/sync-client/src/folds/merge.ts`, per `01-F31`): members of one
  attempt key that diverge in *any* field mark the key **disputed**, contribute
  **zero**, and raise an anomaly — **a fold never picks a winner**.

So when an attempt key genuinely has divergent members (already an anomaly), the two
planes disagree about what the un-refunded remainder *is*. The gateway computes the cap
against one arbitrarily-chosen member's `amount_paisa`; the engine treats the whole key
as contributing nothing.

**Why this is not obviously the gateway's bug:** the gateway is doing a *cap check*, not
a fold, and `DEC-SYNC-007` scopes it to fold-FREE provable invariants with an explicit
"unprovable ⇒ pass through" rule (a sale is never blocked, `01-F17`). Under that rule the
defensible behavior for a **disputed** parent key is to pass through — the gateway cannot
prove a violation against a parent whose amount is itself in dispute.

**Why it is not obviously fine either:** `order by global_seq asc limit 1` lets
**delivery order decide a money outcome**, which is precisely the failure `26 §2` names
as the reason the whole merge-semantics redesign happened. Two clouds replaying the same
events in different orders could reach different accept/quarantine verdicts.

**Ruling required before either side moves.** The recommended resolution — stated here as
a recommendation, not applied — is to make the gateway detect divergence on the parent key
and treat a divergent parent as **unprovable ⇒ pass through**, matching both `DEC-SYNC-007`
and the engine's disputed-contributes-zero law, and leaving the anomaly to the Auditor's
refold. That is a behavior change on a protected path and needs its own loop + FR citation;
it is NOT a drive-by.

**Reachability:** narrow. Requires two `payment.recorded` events sharing one
`settlement_attempt_id` but differing in payload — already an `01-F31` anomaly — plus a
refund against that key. It is not a happy-path defect, which is why it is filed rather
than treated as a blocker.
