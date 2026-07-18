# plans/ — the disposable task layer (24 §9)

`plans/wave-<n>/<module>-tasks.md` — living task lists produced by planning sessions, reviewed like code, **deleted after their wave** (specs are permanent, conformance matrices are derived, plans are working memory).

## Task format

```md
### T-02-03  Cloud-order inbox accept path
- **FRs:** 02-F9 (accept/reject), 06-F17a (confirm policy consumed)
- **Files touchable:** apps/pos-rn/src/inbox/**, packages/domain/src/events/order.ts (spec PR ref: …)
- **Check:** pnpm verify:02 --filter inbox
- **DoD rung:** D1
- **Depends on:** T-02-01 (queue panel), 01 fold registry artifact
- **Assumptions stated:** <interpretations chosen + simpler alternative considered (24 §3 step 1)>
```

## Rules

- A task is dispatchable only when: it names FRs + files + a runnable check (24-F1), and its module's pre-implementation artifacts exist (24-F8).
- One task ≈ one session ≈ 1–4 FRs (sized to the 80% horizon, 24-F4).
- Acceptance tests for a task are authored by a different session than its implementer (24 §3 step 2) — plan both sessions.
- Wave 0 opens with: harness tasks (conformance derivation tool, verify command registry) and the kernel spike per 01 §8 exit criteria.
