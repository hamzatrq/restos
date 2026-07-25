# T-01-17 — The time layer (DEC-TIME-001, accepted)

Closes `01-F43`, `01-F44`, `01-F45`, `01-F46` and un-defers `01-N2`. Spec ratification
landed in `fdb4efd`; this is the behavior change that follows it.

## The load-bearing correctness trap (state it before building)

The naive implementation applies the hub offset **at fold time** — the fold reads
`env.device_created_at + myOffset`. **This is wrong and would silently break
convergence.** `01-F34` requires the fold to be a pure function of the delivered event
SET. Two devices holding identical event sets but different offsets would fold to
different projections, and the bijective-relabel/injection-invariance oracle
(`merge-invariance.test.ts`) exists precisely to catch this class.

Therefore branch time must be stamped **at append time, by the originating device, and
carried in the event**, so it is part of the set every device agrees on. That forces an
envelope change — which is the real cost of this task, and the reason it is worth doing
now: there is no production data, so the migration is free exactly once.

## Design

**Envelope (`packages/domain/src/envelope.ts`) gains two fields:**

- `branch_created_at: number` — the originating device's *branch time* at append
  (`device_clock + branch_time_offset`, 01-F43). This is what every duration reads.
- `time_basis: "branch" | "branch_provisional"` — `branch` once the device has an
  offset measured against the hub; `branch_provisional` when it has had no hub contact
  and is running on offset 0 (01-F44). A provisional stamp is never silently promoted;
  reconciliation is observable.

`device_created_at` **stays** and keeps its raw meaning — it is now a forensic hint
only (01-F45). Keeping it raw is deliberate: `01-N2` skew detection needs the untouched
device clock to compare against hub/server time. Overwriting it with branch time would
destroy the only signal that says a device's clock is wrong.

**Offset acquisition (`mesh-session.ts`):** the existing `ping`/`pong` pair already
carries `t` and echoes it, so the round trip is already there. The hub's `pong` gains
its own send time; the follower computes the offset NTP-style
(`((t1 - t0) + (t2 - t3)) / 2`) and keeps the best-of-N by lowest round-trip delay.
Offset acquisition **never blocks** (01-F17): a device with no hub yet uses offset 0 and
marks its stamps `branch_provisional`. The hub itself is the authority, so its own
offset is 0 and its basis is `branch`.

**Fold (`folds/merge.ts:428`):** the confirm anchor's stamped VALUE reads
`env.branch_created_at` instead of `env.device_created_at`. Anchor *selection* is
already clock-free (argmin over `(payloadHash, id)`) and does not change. This deletes
contract ruling C1 — the sanctioned exception in the file header — so the ordering-
metadata ban can finally cover the device clock without an exception.

**01-N2 skew flag:** measured skew = `|device_clock - hub_time|`; > 5 min raises an
observational device-health flag surfaced through the existing status surface. It never
blocks (spec text is explicit).

**01-F46 day boundary:** an `Asia/Karachi` business-day helper in `domain` via
`date-fns` + `@date-fns/tz` (already a declared dependency, 18 §4). Pure function, no
consumer in Wave 0 beyond its own tests — doc 03/16 consume it later.

## Blast radius (known, accepted)

- ~50 envelope construction sites, mostly funnelled through five shared builders
  (`packages/{sync-client,sync-protocol,testing}/src/__acceptance__/*builders.ts`).
- **Pinned wire fixtures** (`sync-protocol/src/__acceptance__/fixtures/*.json`) and the
  **canonical hash regression** (`domain/src/__acceptance__/canonical-regression.test.ts`)
  both change, because `01-F5` hashes the envelope. Those pins are oracle artifacts:
  the oracle session re-pins them, not the implementer (24 §3 step 2). The re-pin is a
  *consequence* of a ratified envelope change, not a weakened assertion — the chain
  property (any mutation is detectable) must still hold on the new values.

## Assumptions surfaced (24 §3b)

1. **Two fields, not one.** The simpler alternative is to redefine `device_created_at`
   itself as branch time and add nothing. It is genuinely smaller — but it contradicts
   `01-F45` as ratified and destroys the raw signal `01-N2` needs. Rejected on those two
   grounds, not on taste.
2. **Offset via ping/pong, not a new message kind.** The round trip already exists; a
   dedicated time-sync kind would be a second thing to test for no gain.
3. **`01-F44`'s reconciliation half is marker-only in Wave 0.** The marker is written and
   asserted; nothing consumes it yet because doc 16 (tax) and doc 03 (timing) are not
   built. Stated so it is a conscious scope line, not an oversight.
