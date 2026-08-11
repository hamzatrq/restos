# @restos/jobs

**Owning spec: `specs/18-engineering-handbook.md §5` — read it before modifying anything here (AGENTS.md routing).**

- BullMQ workers. Every job idempotent; repeatables not OS cron; DLQs surface in doc 15 fleet health.
- **IT RUNS, AND IT HOSTS THE AUDITOR (August 2026): `pnpm -C services/jobs start` (once,
  long-lived) or `dev` (watch), on `tsx`.** Until then this package was `export {};` with a `test`
  and a `build` echo and **no `dev`/`start`**, so `20 §4.2`'s Auditor — *"the single highest-value
  correctness artifact we build … It ships in Wave 0 with the kernel, not later"* — had never run as
  a process. `runAuditor` was complete, correct and covered by ten suites since Wave 0 with **zero
  production callers**, and its own source said so. AGENTS.md's recurring defect, and by the count
  in that file this is the **fourteenth** instance. `DEC-MONEY-009` is why it matters beyond the
  checkbox: its partition case is open by construction and its residual column names a scheduled
  Auditor as one of the three things owed for it.
- **Env:** `DATABASE_URL` (required — the kernel database it audits), `REDIS_URL` (required — the
  BullMQ backend), `AUDITOR_INTERVAL_MS` (optional, default 24 h). Both URLs are required rather
  than defaulted, unlike `services/sync-gateway`'s `DATABASE_URL`: a gateway pointed at the wrong
  database is loud on the first request, while **a batch job that quietly audits a database nobody
  named reports `ok` about the wrong ledger**, and a worker with no Redis boots, prints and never
  runs a single pass — a silent Auditor, the exact state this package existed in.
- **It emits three structured records on stdout** (`18 §5` pino), each under a top-level `jobs` key,
  and the acceptance suite spawns the DECLARED `start` script and reads them:
  `boot` (which database — password-redacted — and the cadence), `auditor_result` (**one per org per
  pass, clean orgs included**, carrying `runAuditor`'s own findings array), `auditor_failed`.
  Findings log at `error`; a clean pass logs below it. A host that shouts every night is as silent
  as one that never shouts.
- ⚠ **It imports `runAuditor` from `services/sync-gateway`, which `18 §2`'s dependency direction
  MUST forbids (`services → packages` only).** Named, not hidden: the full argument and the two
  rejected alternatives are in `src/index.ts`'s header. The correct end state is `auditor.ts` living
  in a package, and it is OWED — a PROTECTED-path restructure needing its own spec PR and senior
  review, not a drive-by here. The gateway now publishes an `exports` map (`./auditor`,
  `./database-url`), so the coupling is enumerated and `seams:check` can see it at all — that rail
  resolves `@restos/*` **only** through an `exports` field.
- ⚠ **`pnpm -C services/jobs test` is 18/19 on a correct tree, and the one red is a CONFLICT
  BETWEEN THE ORACLE AND THE RAIL — read this before "fixing" either.** `§H` asserts
  `services/sync-gateway/src/auditor.ts` contains no `@unreached-owed` **anywhere in the file**.
  Landing the caller made `runAuditor` a shipping-constructed factory, which made its optional
  `read_model` member a Rule B candidate for the first time — and `20 §4.2`'s read-model diff leg
  has no cloud projection to feed it, so the rail requires a debt marker *in that same file*.
  Measured both ways: **marker present → `seams:check` exit 0, jobs 18/19; marker absent → jobs
  19/19, `seams:check` exit 1** (`1 optional seam NEVER SUPPLIED`), which also reds `pnpm verify`.
  The marker stays, because `§H`'s own failure message is *"pnpm seams:check FAILS when a marker
  sits on something now reached"* — so removing it would make that test pass while the rail it
  exists to protect is red. **This is a finding for the suite's owner, not a licence to edit an
  oracle** (`24 §3`): the assertion's mechanism (whole-file substring) is broader than its title
  (*"runAuditor no longer carries…"*) and than its stated reason, and **no implementation can
  satisfy it and the rail together** without inventing the read-model projection — which the suite's
  own header rules out.
- **Owed, and named rather than assumed:** `18 §5`'s retries with exponential backoff and the DLQ's
  doc-15 monitoring (properties of a *failing* job; a failed pass is rethrown so BullMQ records it,
  and the next scheduled pass is the retry); `20 §4.2`'s **alert** half, which is unbuildable rather
  than unbuilt — `alert.raised` is in the `01 §4` catalog but has no payload schema in
  `packages/domain` (`01-F4` refuses it) and no `01-F62` org-scoped slot, and a cloud job has no
  device to stamp a branch-scoped envelope (`05-F28`'s trap); the read-model diff leg above; and a
  SIGTERM/SIGINT drain.
- `pnpm -C services/jobs test` needs local Docker (Postgres **and** Redis) and fails loudly, never
  skips (`T-01-07`, `20 §1`: mocked infra in service tests is banned).
