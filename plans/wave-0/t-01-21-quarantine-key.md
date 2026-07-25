# T-01-21 — Widen the quarantine key + heal→notice reconciliation

Senior-review origin: `audit-1.md` #6 (widen the key), #7 (permanent
merged-AND-quarantined placeholder), plus the filed heal→notice follow-up from
`t-01-11-fix-round.md`. Owning FRs: `01-F37`, `01-F1`, `01-F8`, DEC-SYNC-005/008.

## Today (verified in `services/sync-gateway/src/schema.ts`)

```
unique("quarantine_org_claimed_event_uq").on(t.org_id, t.claimed_event_id)
```

One row per `(org, claimed_event_id)`, org-wide. So the **first** device to claim an
event id owns the only slot. An honest origin arriving second has its envelope
**discarded entirely** — the bytes are gone, not merely mis-attributed. That is the
finding: a trivial insider pre-claim, or the DEC-SYNC-009 unregistered→registered relay
race, destroys evidence the quarantine table exists to preserve.

The current mitigation is the T-01-11 F2-amend credit law — *"credit the origin's slot
UNLESS the blocking row is this SAME origin's own row at a DIFFERENT slot"* — which stops
the honest origin from **wedging**, but does nothing to save its bytes. It is a
correct patch on a key that is too narrow.

## The change

Widen to `(org_id, claimed_event_id, device_id)`. Each claimant gets its own row, so a
foreign pre-claim can no longer displace anyone.

**What this simplifies (the real prize):** with a per-device row, a foreign row can no
longer *block storage at all*, so most of the blocker/credit machinery that the F2-amend
had to reason about dissolves. Slot credit becomes local to the origin's own rows rather
than a negotiation over an org-wide key. Expect to **delete** logic here, not add it.

**What must NOT regress** — these are the properties the existing tests pin, and the
reason this needs its own loop rather than a schema tweak:

1. **Slot-fill / never-wedge (DEC-SYNC-005, 01-F8, commandment 4).** A durably-stored
   quarantine row still fills its origin's lamport slot so the push ack advances and the
   outbox never wedges on a poison event.
2. **No slot displacement.** A relayed identity-mismatch envelope must still fill *no*
   stream (the T-01-12/F1 split), because its `lamport_seq` belongs to the claimed
   origin's numbering and filling the hub's own slot at that number would displace the
   hub's genuine future event there.
3. **Loud, never silent.** An uncovered slot must still surface as a `lamport_gap`
   Auditor finding rather than a silent wedge.
4. **Auditor coverage-by-attribution** (leg counting quarantine rows as slot-filling)
   must be re-derived against the wider key — with several rows per claimed id, "which
   row covers this slot" is now a per-device question. This is where a careless migration
   would quietly break the gap leg.

## Heal→notice reconciliation (same loop — they touch the same rows)

Heal-in-place UPDATEs the quarantine row's `device_id` + `reason`, but **not** the
co-keyed `quarantine_notices` row. So the origin's durable notice keeps the stale hub
attribution and the stale reason: the device is told the wrong thing about its own event,
durably, and redelivery re-sends the stale copy on every subsequent `hello`.

Fix: heal reconciles both rows in the same transaction, or the notice is derived from the
quarantine row at send time rather than duplicated at write time. **Prefer the derived
read** — one source of truth cannot drift from itself. Redelivery stays at-least-once with
duplicates legal (DEC-SYNC-008); the *content* must reflect the healed state.

## Open question for review #7 (do not silently pick)

A valid pre-registration relay can leave an event **both merged and quarantined** — a
placeholder that outlives its usefulness. Widening the key does not by itself retire the
placeholder. Two candidate resolutions:

- **(a)** heal retires the placeholder when the same event is later merged from a
  registered origin (delete-on-supersede — but this table is meant to be evidence, and
  deleting evidence needs an explicit ruling);
- **(b)** the placeholder stays and is marked `superseded`, with the Auditor and doc-15
  fleet health filtering it out of "live quarantine" counts.

**(b) is recommended** — it keeps the append-only spirit that (a) violates, and the cost
is one status column plus a filter. Stated here rather than chosen unilaterally, since it
changes what an operator sees on the fleet-health screen.
