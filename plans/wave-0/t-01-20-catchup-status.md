# T-01-20 — Blocked catch-up cursor is observable (DEC-SYNC-011)

Closes the surface half of `01-F11` for `01-F9`'s catch-up path. Senior-review origin:
`audit-1.md` #4. Ratified in `fdb4efd`.

## The defect, verified in `packages/sync-client/src/cloud-session.ts`

`applyEvents` computes a local `let blocked = false`, uses it to stop the contiguous-prefix
cursor advance — correct — and then **throws it away**. `status()` returns
`{ connected, last_push_ack, last_global_seq, quarantined }` with no way to express
"the cursor is stopped and will never move again."

For a *transient* failure that is fine: catch-up re-delivers and the cursor resumes. For a
**permanent** rejection — an event type this build does not know, a payload from a newer
schema version — re-fetching cannot help. The device sits at a fixed `last_global_seq`
forever, `connected: true`, looking merely idle. The honesty UI (00 §5.7) is then lying by
omission: the one screen whose entire job is telling staff the truth about sync shows a
healthy device that has silently stopped receiving the branch's events.

Note the contrast that makes this a real hole rather than a nitpick: the *divergent
duplicate* case — the other permanent failure — is already surfaced, in `quarantined`.
Version skew is the one permanent failure with no surface at all.

## The change

1. `status()` gains a blocked-cursor field carrying the **blocking `global_seq`**, the
   **rejected event type**, and a **machine-readable reason** — enough for fleet health
   (doc 15) to alert on and for the honesty UI to say "stopped at X" rather than nothing.
2. The field clears when the cursor advances past the blockage, so a transient stall
   reports and then resolves itself without operator action.
3. **Stop-and-report, never skip** (the ratified DEC-SYNC-011 policy). Do not add a
   skip-forward path: skipping fabricates a gap in a log whose entire value is
   completeness, and it is unrecoverable — a stopped cursor can always be resumed by
   shipping a build that understands the event, while a skipped event is gone from that
   device's view for good.
4. The device keeps operating locally on what it already holds (`01-F17`). Blocking
   catch-up must never block a sale.

## Traps

- **Do not conflate blocked with disconnected.** They have different remedies (ship a new
  build vs restore the network) and a UI that merges them sends staff to the wrong fix.
- **Do not let the reason string leak payload contents** into a status surface that fleet
  health persists — the event type and sequence are diagnostic enough, and payloads carry
  customer PII (00 §5.4).
- The `blocked` flag currently also stops the advance for **transient** failures. Keep
  that behavior exactly; only the reporting is new.
