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
- **It imports `runAuditor` from `@restos/auditor` and `redactedDsn` from `@restos/config` — both
  PACKAGES, which is the only direction `18 §2` allows.** For the window between the Auditor getting
  a host and `DEC-ARCH-001` being ruled it read both out of `services/sync-gateway` through that
  service's two-entry `exports` map, which `18 §2`'s dependency-direction MUST forbids
  (`services → packages` only) — named in code rather than hidden. **The ruling landed the move**
  (`packages/auditor`; the gateway's `exports` field is deleted and it publishes nothing again), and
  the edge is asserted gone by `src/__acceptance__/auditor-package-move.test.ts` §C, which also
  bans the `packages → services` inversion the naive move creates.
- ⚠ **`pnpm -C services/jobs test` is 42/43 on a correct tree, and the one red is a CONFLICT
  BETWEEN THE ORACLE AND THE RAIL — read this before "fixing" either.** `§H` asserts
  `packages/auditor/src/auditor.ts` contains no `@unreached-owed` **anywhere in the file** (it said
  `services/sync-gateway/src/auditor.ts` until `DEC-ARCH-001` moved the file; the constant was
  re-pointed and nothing else about `§H` changed — left alone it would have failed with ENOENT
  instead of its own message, replacing a deliberate tripwire with a broken read).
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
## R38 — the per-tenant backup, the restore, and the owner's export (August 2026)

**Three declared commands now, not one.** `start` still hosts the Auditor and additionally runs
R38's backup on a **second BullMQ repeatable** (queue `tenant-backup`); `restore` and `export-org`
are one-shot operator commands:

    pnpm -C services/jobs restore    --file <artifact>          # target DB = DATABASE_URL
    pnpm -C services/jobs export-org --org <org_id> --out <dir> # 22-F16's bundle

- **`BACKUP_DIR` is OPTIONAL and absent means the backup does not run** — the boot line says
  `backup_dir: null`, no queue is created, and `KEYS` shows none. Required would break every
  existing deployment of this worker *and take the Auditor down with it*; defaulted would be worse,
  because a path this process invented is a directory nobody rotates or copies off the box, so the
  deployment would believe it had backups (`22-F21`: an artifact nobody can restore is worse than a
  missing one, because it retires the alarm). `BACKUP_INTERVAL_MS` defaults to a night.
- **`backup_rpo_ms` is DERIVED from the interval and never stated independently** (`22-F22`: *"the
  real RPO is the dump interval, and that number MUST be written into the deployment's runbook
  beside the command that produces it"*). ⚠ **The FR says RUNBOOK and a log line is not one** — a
  PINNED READING, and `docs/runbooks/` still does not exist, so `22-F5`'s named ownership is unmet.
- **Org discovery is NOT `everyOrg`, and the difference is a restaurant.** The Auditor reads
  `kernel.org_sequences`, which the merge gateway writes on an org's first ingest — so a tenant that
  has signed up and not yet traded is invisible to it. `tenant-artifact.ts`'s `everyTenant` takes the
  UNION over every org-keyed table, which also catches `01-F68`'s *"UNNAMED, not invalid"* org that
  has events and no directory row. **Do not merge the two readings**: each is correct for its caller.
- **The artifact is OUR OWN logical dump, not `pg_dump`** — `22-F22` names `pg_dump`, which cannot
  filter by `org_id` in any format `pg_restore` reads, so a per-tenant artifact cannot be one. JSONL,
  uncompressed (the `§B3` isolation sweep greps the bytes), header + rows + a footer carrying the row
  count and a sha256 over the row lines.
- **The restore is ADDITIVE and IDEMPOTENT**: `on conflict do nothing` with **no conflict target**,
  so every unique constraint AND every unique index is covered (`users_email_lower_uq` is an index,
  not a constraint). No `delete` anywhere — `22-F7`'s tail heal depends on events appended after the
  backup surviving it. The whole artifact is parsed and verified **before** a row is written, then
  applied in one transaction, so a truncated file leaves nothing behind.
- ⚠ **`kernel.org_events.seq` is a `bigserial` restored EXPLICITLY**, so the sequence is re-pointed
  with `setval` over the whole table afterwards. Skipping it would collide the next org-scoped append
  with a restored row — in another tenant's request, on an append-only table.
- ⚠ **THE OPEN FOUNDER CALL THIS DID NOT TAKE.** `plans/saas-pivot/mvp-plan.md` open question 13
  asks what *per-tenant backup* means under R38 and records two readings, noting **only the
  whole-DB-plus-export reading is specified anywhere**. The ORACLE pins the per-org artifact (`§B3`
  asserts byte-level disjointness in both directions), so that is what ships and `22-F23`'s closing
  clause records it as resolved-by-oracle rather than settled. **The FR the code cites for the
  artifact is R38 itself plus `22-F22`; no new FR decides the question.**

### Mutation matrix — R38 (round-3 law), control **77/77** green

In-tree with byte-exact backups and an `md5sum -c` restore trap after every row; nothing here is a
security constant, so a stranded mutant reds a test rather than downgrading a credential. Every row
is the FULL package suite, `REAL_EXIT` read from a marker written INSIDE the log. **In every killing
row the failing FILE was a single one, so the other three files stayed green under every mutant.**

| # | mutant (exactly one branch) | killed (of 77) | which |
|---|---|---|---|
| B1 | **the DECLARED `restore` script deleted — the state doc 22 has been in for a month** | **7** | §A1 + all of §D |
| B3 | **the artifact's `where org_id = $1` dropped — ONE cluster dump written under each org's name** | **6** | §B3, §D1–§D5 |
| B4 | `everyTenant` reads `kernel.org_sequences` (i.e. the Auditor's `everyOrg`) | **4** | §B1, §B2, §B4, §C1 |
| B5 | **the "clean restore" — `delete … where org_id` before inserting** | 1 | §D4 |
| B6b | all three integrity checks retired, a truncated prefix restored | 1 | §D6 |
| B7 | **`01-F71` (f) (ii)'s foreign-row refusal deleted** | ~~**0 — SURVIVED**~~ **4 — see below** | `tenant-artifact.test.ts` |
| B8 | `backup_rpo_ms` prints `22-F1`'s 300000 while dumping nightly | 1 | §A3 |
| B9 | `requireSchema`'s empty-match refusal deleted | 1 | §F1 |
| BC | **NEGATIVE CONTROL: four refusal/boot sentences reworded, same branches** | **0** | — |

**B1, B3 and B4 are the three to re-run after any change here.** B3 is the security row and it is not
hypothetical — it is what `ops/backup.sh` does today (`grep -c org_id ops/backup.sh` → 0). B4 is the
one a session is most likely to introduce by "reusing" the Auditor's discovery, and its four kills
are all about the tenant that has signed up and not yet traded.

⚠ **B6 WAS MIS-DESIGNED AND ITS SURVIVAL PROVED NOTHING — check what a mutant DOES before recording
what its survival means.** The first truncation mutant deleted only the footer-kind check and
survived **0 of 72**, because a truncated file's last line is a partial JSON row and `readJson`
refuses it first. B6b deletes the footer, the row count AND the digest and filters unparseable
lines, which is the repair a session reaching only for "accept a prefix" would write — and it dies
at §D6 alone. `migratable`'s N5 and `summary`'s S4x record the same lesson from the other side.

⚠ **B7 SURVIVED 0 OF 72 AND THAT WAS A REAL COVERAGE HOLE — closed in this change by a HAND-WRITTEN
assertion, `src/tenant-artifact.test.ts` (NOT an oracle; its header says so).** `01-F71` is explicit
that its register is not advisory — *"each point carries a test that FAILS when that point alone is
removed … the test must run two tenants and mutate the point under test"* — and no fixture in the
acceptance suite produces a MIXED artifact, because the correct writer never emits one. That is the
FR's own recorded lesson wearing a new hat: *"a fixture that cannot express a foreign key cannot
test a refusal of one."* Re-measured against the new control: **B7 kills 4 of 77, all in the new
file, 72 pre-existing green.**

- **Owed, and named rather than assumed:** `18 §5`'s retries with exponential backoff and the DLQ's
  doc-15 monitoring (properties of a *failing* job; a failed pass is rethrown so BullMQ records it,
  and the next scheduled pass is the retry); `20 §4.2`'s **alert** half, which is unbuildable rather
  than unbuilt — `alert.raised` is in the `01 §4` catalog but has no payload schema in
  `packages/domain` (`01-F4` refuses it) and no `01-F62` org-scoped slot, and a cloud job has no
  device to stamp a branch-scoped envelope (`05-F28`'s trap); the read-model diff leg above; and a
  SIGTERM/SIGINT drain. **R38 adds three:** `22-F9`'s `governance.restore_drill_recorded` and
  `22-F16`'s `governance.export_generated` are **unbuildable rather than unbuilt** (`22-F23`:
  `packages/domain` declares no `governance.*` payload schema, so `01-F4` refuses the emit and
  `01-F62`'s org-scoped set does not carry one) — **so a backup, a restore and an export each leave
  no ledger record and no attribution**; `22-F8`'s drill CADENCE, since a scheduler cannot make
  *"a restore nobody has performed is a backup nobody has"* true; and `22-F16`'s other two bundle
  legs, the read-model CSVs and the media manifest, which have no projection and no object storage
  to come from — `export-org`'s `manifest.json` lists all three absences with their reasons rather
  than letting an owner read an incomplete bundle as a complete one (`00 §5.7`).
- `pnpm -C services/jobs test` needs local Docker (Postgres **and** Redis) and fails loudly, never
  skips (`T-01-07`, `20 §1`: mocked infra in service tests is banned).
