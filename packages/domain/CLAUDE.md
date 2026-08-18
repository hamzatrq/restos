# @restos/domain

**Owning spec: `specs/01-kernel-sync.md §4 + 00 §6` — read it before modifying anything here (AGENTS.md routing).**

- SACRED (18 §2): every event/entity/config schema and the permission matrix live here ONCE.
- Every change here is a spec PR + senior review. Nothing redeclares these types elsewhere.
- Money = branded integer paisas; quantities = branded integer mg/ml/units. No floats, ever.
- **IMPLEMENTED (Wave 0).** See `README.md` for the module map. Changes here are spec-PR + senior review (SACRED path, 18 §2).

## `PersonAssignment.status` — `11-F22`'s participation field, PER-(PERSON, BRANCH) (August 2026)

`PERSON_STATUSES` (`active | inactive`, closed at two) and a **required** `status` on
`PersonAssignment` — `01-F26`'s `(role, location)` pair with participation on it, which is what
`PersonRecord.assignments` now holds. `11-F22` refuses a default by name — an absent status is "not
a licence to default an absent status to `active`" — and `01-F75` makes the field required at the
writer, so the enum carries a custom error naming the FR: `services/sync-gateway`'s schema
deliberately holds no CHECK for a closed set, so this parse **is** the enforcement, and a refusal
that does not cite the rule is one an operator cannot act on. Asserted by
`services/sync-gateway/src/__acceptance__/staff-roster-storage.test.ts` §E (a bad word and an absent
field are both refused, nothing is written, and the second leg is that the field is required **per
assignment** — one supplied status does not cover a sibling that lacks one).

⚠ **THE FIRST BUILD PUT IT ON `PersonRecord` AS A PER-PERSON FIELD, AND THIS SECTION SAID SO.**
`11-F22` carried both readings — its heading says *"a PERSON RECORD carries a participation
status"*, its transfer clause requires a cashier moving A→B to be *"`inactive` in A's roster and
`active` in B's at the same moment"* — and the FR now names the transfer clause as the operative
one, because no single per-person value can express it. An adversarial review measured the cost on
the build that resolved it the other way: deactivating her at A **destroyed the credential B's
artifact needs** (`11-F23`'s *"`active` member with no hash"*), and any later republish at A
re-copied her CURRENT status and **silently returned a departed cashier to `active` with a working
PIN hash on her old branch's tills**. Kept rather than rewritten away, because it is this repo's
cheapest worked example of a spec sentence with two readings and only one of them buildable.

**`RoleAssignmentWire` did NOT gain the field, deliberately.** It is pinned to `permissions.ts`'s
`RoleAssignment` by a compile-time tripwire, and `RoleAssignment` is `can()`'s subject: `11-F22`'s
*"the authorization subject reads the status too"* is the plan's **step 2b**, which lands on both
planes in one change. A matrix carrying a status nothing reads is the shape that later gets read by
accident.

⚠ **A required field on a shared record moves every reader in the same change.** Two parse `PersonRecord` —
`services/sync-gateway/src/tenancy.ts` and `services/api/src/users-postgres.ts` — and `parse` takes
`unknown`, so a reader that forgets the new field compiles perfectly and throws on the first login
of every deployment. That is the standing cost of the one-declaration rule, and it is the thing to
grep for (`PersonRecord.parse`) before adding a field here. ⚠ **It bites through `assignments` now
rather than through a top-level key**, which is quieter: nothing in a select statement changes, so
the reader that breaks is the one whose ROWS predate `0012`'s jsonb backfill.

## Mutation matrix — `05-F7`'s approval family (round-3 law), control **338/338** green

`approval.requested / granted / denied` were in the `01 §4` catalog and had **no payload schema
here**, so `01-F4` made every emit an `UnknownEventTypeError` and `02-F20`'s remote path was
*unbuildable*. `__acceptance__/approval-schemas.test.ts` is the oracle.

Mutated **in-tree** with a checksum restore trap (`registry.ts` verified byte-identical after —
`32cbfeda…`). Nothing here is a security constant: each mutant is a schema branch that reds a test
rather than downgrading a credential, which is the narrow case AGENTS.md's out-of-tree rule leaves
in-tree. Every row is the FULL package suite. **In EVERY row the failing FILE was
`approval-schemas.test.ts` alone, so all 328 pre-existing domain tests stayed green under every
mutant** — the kills are attributable to the new file rather than to the suite at large.

| # | mutant (exactly one branch) | new 10 failed | pre-existing 328 |
|---|---|---|---|
| A1 | **THE `02-F41` MUTANT — `approval.granted` collapses to ONE identity (`requester_user_id` dropped)** | **1** | **all green** |
| A2 | the quieter twin — `requester_user_id` made `.optional()`, so a caller may omit it | 1 | all green |
| A3 | `approval_type` opened to a free string (`02-F42`'s precedent undone) | 1 | all green |
| A4 | **THE DEFECT VERBATIM — the three types unregistered (the pre-change tree)** | **2** | **all green** |
| A5 | **NEGATIVE CONTROL — `reason` and `amount_paisa` swap position; same behaviour** | **0** | all green |

**A1 is the one to re-run after any change here.** It is the remote form of the defect the local
path spends a whole second `createPinSession` avoiding: `unlock()` MOVES the session, so approving
through the cashier's own would sign her out and `02-F41` would attribute her next twenty orders to
whoever authorised one paid-out. A *remote* grant crosses a plane with no session to move, so no
mechanism protects it — only this schema does, and A1 is what proves the schema bites rather than
merely describing the intent.

**A5 is what makes every red row mean anything:** a real one-branch edit to the same object reddens
nothing, so the oracle holds the PROPERTY and is not pinning field order.

**⚠ Two mutants are NOT in the table because they are not test kills — they fail COMPILE, and both
were observed live rather than constructed.** Adding three types to `payloadSchemas` immediately
broke `pnpm typecheck` in two places, which is `18 §3`'s exhaustive-`switch`-with-`never` rule and
`merge-workcounter.test.ts`'s compile-level registry pin working exactly as designed:
`folds/merge.ts` had no case (`Argument of type '"approval.denied" | …' is not assignable to
parameter of type 'never'`) and the oracle's partition had no disposition for them (`Type 'true' is
not assignable to type 'never'`). **The registry cannot grow silently here**, and that is a stronger
guarantee than any assertion in this package — reverting either fix is a red build, not a red test.

## Mutation matrix — `14-F30`'s `device.manage` row (round-3 law)

`14-F13` puts an immediate, irreversible kill switch on an authenticated back-office screen, and
until August 2026 **Appendix A carried no device row at all**, so commandment 8 had nothing to
authorize a device request against. `14-F30` decides the cells and records itself as a PINNED
INTERPRETATION rather than a transcription; `device-permission.test.ts` is the assertion.

**Mutated OUT-OF-TREE** (AGENTS.md: a permission cell is a security parameter, and an agent killed
between "weaken" and "revert" would strand a widened credential with every test green). The package
was rsync'd to a scratchpad with `node_modules` symlinked, mutated there, and
`packages/domain/src/permissions.ts` was verified byte-identical afterwards — it was never edited.

Baseline out-of-tree: **104 passed** (15 new + 89 pre-existing `permission-matrix.test.ts`). Each
mutant differs in exactly one branch. **In every row the failing FILE was `device-permission.test.ts`
alone, so all 89 pre-existing permission tests stayed green under every mutant** — the kills are
attributable to the new file rather than to the suite at large.

| # | mutant (exactly one branch) | new 15 failed | pre-existing 89 |
|---|---|---|---|
| D1 | **`branch_manager: "allow"` — THE wrong-role mutant** | **2** | **all green** |
| D2 | `owner: "deny"` — the surface is dead, nobody may manage a device | 3 | all green |
| D3 | **`device.manage` removed entirely — the pre-`14-F30` state** | **5** | **all green** |
| D4 | non-owners read `escalate` — a manager-PIN affordance this plane cannot satisfy | 5 | all green |
| D5 | **CONTROL: the action moves position in `PERMISSION_ACTIONS`** | **0** | all green |

**D1 is the one to re-run after any change here**, and its number is the honest one: only 2 of 15
assertions are pointed at the branch-manager cell, and that is by design — the rest are about the
owner, the other columns and the identity axes. D5 is why the other counts mean anything: a suite
that reddened on any edit to this file would kill it too.

⚠ **D1's cell is the reading a session is most likely to "fix" the wrong way.** Doc 14 §1 says the
back office is *"Used by owners, permitted managers, and the vendor onboarding team"*, which reads
as a licence to widen. It is not: doc 14 §9's FIRST open question is *"whether managers get a scoped
back-office slice on phones … or stay manager-console-only until pilots demand it"* — the corpus
stating that a manager's back-office reach is **undecided**. Widening is additive and needs a
founder ruling; narrowing later is not additive, and the wrong guess in the permissive direction is
an accidental revocation that stops a till mid-service.
