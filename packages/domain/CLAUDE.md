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

## `tax.ts` — R39's posture arithmetic (`16-F1`..`16-F6`), control **603/603** green

R39: *"CORRECT TOTALS AND AN ITEMISED TAX LINE; NO FISCALIZATION."* `taxSnapshot` is `16-F5`'s
per-line computation — integer paisa, `exclusive` through `00 §6`'s one door (`applyRateBps`),
`inclusive` extracting `gross × bps / (10000 + bps)` at the same half-up policy, `none` charging
nothing and consulting no rate. `__acceptance__/tax-posture.test.ts` is the oracle.

Mutated **in-tree** with a byte-exact restore trap (`tax.ts` verified byte-identical after). Nothing
here is a security constant: each mutant is an arithmetic branch that reds a test rather than
downgrading a credential, which is the narrow case AGENTS.md's out-of-tree rule leaves in-tree. Every
row is the FULL package suite. **In EVERY row the failing FILE was `tax-posture.test.ts` alone, so all
565 pre-existing domain tests stayed green under every mutant** — the kills are attributable to the
new file rather than to the suite at large.

| # | mutant (exactly one branch) | new 38 failed | pre-existing 565 |
|---|---|---|---|
| T1 | **`16-F1` LEAK — `none` falls through to the exclusive arm** | **3** | **all green** |
| T2 | **`16-F5` — the tax is rounded on the ORDER TOTAL, not per line (6683, not 6684)** | **7** | **all green** |
| T3 | **`16-F2` — `inclusive` charges the rate ON TOP of a price that already contains it** | **2** | **all green** |
| T4 | `00 §6` — naive float `Math.round(base × bps / 10000)` instead of `applyRateBps` | **0 — SURVIVES** | all green |
| T4b | `00 §6` — a policy that really differs: FLOOR (truncation), not half-up | 8 | all green |
| T5 | `01-F30` — a zero-billed (voided) line is dropped from the snapshot | 7 | all green |
| T6 | `16-F1`/`11-F22` — an ABSENT posture defaults to `none` rather than refusing | 1 | all green |
| T7 | **NEGATIVE CONTROL — the returned snapshot's fields swap position; same behaviour** | **0** | all green |

**T2 is the one to re-run after any change here.** The fixture is three Rs 45 lines at **1650 bps**
precisely because at a whole-percent rate on whole-rupee prices per-line and per-total rounding give
the *same* answer — a suite fixtured on Rs 450 at 16 % cannot tell `16-F5`'s rule from the one it
rejects. T7 is why the other counts mean anything: a real one-branch edit to the same object reddens
nothing, so the oracle holds the PROPERTY and is not pinning field order.

**⚠ T4 SURVIVES, AND IT IS THE ORACLE'S CLAIM THAT IS WRONG RATHER THAN THE IMPLEMENTATION —
MEASURED, NOT ARGUED.** `tax-posture.test.ts` §D closes with a case commented *"2^52 − 1: the naive
float path is off by one"*. It is not, at that value: `Math.round(base × bps / 10000)` equals
`applyRateBps` on **all 10** of §D's rows, including that one (both answer `765611936652984` for
`base = 4503599627370495`, `bps = 1700`). The general claim is sound — a random search over the
safe-integer range finds divergent inputs in seconds, e.g. `base = 6446220095029487, bps = 1650`,
where the naive path is **+1** — so the row needs a different base, not a different assertion. **A
finding for the test-owning session, cited by FR (`00 §6` / `DEC-MONEY-005`), never an edit.** T4b is
the control that proves the section is not vacuous about rounding at all: a policy that genuinely
differs is killed 8 times.


## Mutation matrix — `02-F63`'s charge rounding (founder ruling R70), NEGATIVE CONTROL **0/0/0/0**

R70: *"round to rupees … some restaurants round to 10s and some round to rupees … even coins are
getting rare."* The receipt's rows did not add up — `Subtotal Rs 450 · Tax Rs 74 · Total Rs 525` —
because `rupeesFromPaisa` **truncates** and `amountToken` rendered through it. `02-F63` rounds the
CHARGE inside `billed_total` (`packages/sync-client`'s `orderChargeSnapshot`) and makes the money
token truthful about the paisa that remain.

**Mutated OUT OF THE MAIN TREE**, in a detached `git worktree` carrying this change, because a
CONCURRENT agent was working in the main checkout: an in-tree mutate-and-revert would have put a
broken money helper in front of somebody else's test run. Every row restores byte-exactly and is
`sha256`-verified after (the driver's own assertion, and it fired once — a run killed at the 10-min
tool ceiling stranded one mutant, which was caught by the check rather than by luck).

**Control, in that worktree:** domain **790 pass / 44 known-red** (3 pre-existing files, unrelated:
`open-tender-set`, `adjustment-attempt-key`, `order-cancelled-schema`) · escpos **413/413** ·
sync-client **941 pass / 1 known-red** (`device-roster-distribution`) · pos-electron **1285 pass /
5 env-red** (`startup-integrity.test.ts` spawns real Electron; an environment prerequisite, not a
regression — `T-01-07`). Every row is the FULL suite of all four packages and the numbers below are
kills ABOVE that control.

| # | mutant (exactly one branch) | domain | escpos | sync | pos |
|---|---|---|---|---|---|
| R1 | **THE DEFECT VERBATIM — `amountToken` drops the sub-rupee part** | 0 | **8** | 0 | **2** |
| R2 | **NO ROUNDING — the join returns the tax total as the charge** | 0 | 0 | **9** | **6** |
| R3 | **ALWAYS DOWN — truncation as a policy** | **6** | 0 | **4** | **5** |
| R4 | ALWAYS UP — every bill gains up to one whole step | **6** | 0 | **5** | **1** |
| R5 | **HALF-DOWN — `2r > g` instead of `>=`, one keystroke** | **3** | 0 | **1** | **1** |
| R6 | **THE HARDCODED STEP — the configured granularity is ignored** | 0 | 0 | **8** | **1** |
| R7 | **PER-LINE ROUNDING — `02-F63` (e)'s named law-1 break** | 0 | 0 | **1** | **1** |
| R8 | **THE SEAM — `printing.ts` never hands the document its rounding row** | 0 | 0 | 0 | **3** |
| R9 | **THE HALF-MOVED READER — the guard rounds at 1, the paper at 100** | 0 | 0 | 0 | **3** |
| R10 | the rounding row suppressed | 0 | **7** | 0 | **2** |
| R11 | **THE SIGN — every row says `Rounded up`** | 0 | **6** | 0 | **1** |
| R12 | the unconditional row — `Rounded up Rs 0` on every receipt | 0 | **1** | 0 | 0 |
| R13 | no zero pad — 7 paisa renders `.7`, an order of magnitude out | 0 | **5** | 0 | **1** |
| R14 | **THE DEFAULT — an unconfigured till stops rounding** | 0 | 0 | 0 | **6** |
| R16 | the DISPLAY door returns a zero remainder | **2** | **8** | 0 | **2** |
| R15 | **NEGATIVE CONTROL — a real refactor of the rounding door AND the row** | **0** | **0** | **0** | **0** |

**In EVERY row the only failing files are the control's own plus the files this change authored or
amended** — `charge-rounding.test.ts`, `receipt-rounding-row.test.ts`, `order-tax.test.ts` §E,
`tax-on-the-bill.test.ts`, and the one assertion in `receipt-document.test.ts` that R70 retired. **Not
one pre-existing assertion anywhere reddened under any mutant**, so every kill is attributable.

**R15 is what makes the red rows mean anything:** a genuine restructuring of both functions under
test (the ternary split into an early return, the label lifted to a local) reddens **nothing** and
reproduces the control's four numbers exactly.

**R1 and R2 are two halves of one defect and NEITHER SUBSUMES THE OTHER** — R1 is the paper lying
about a figure, R2 is the ledger charging a figure no drawer can pay — and each is invisible to the
other's package. **R9 is the sharpest row here**: one of the five readers of `billed_total` left on
the old step compiles, passes every arithmetic test in the repo, and puts the RECEIPT and the COVER
TEST in disagreement about what was taken — permanently, under `01-F1`.

⚠ **R10's FIRST FORM DID NOT COMPILE AND ITS COUNT WAS WRONG IN THE FLATTERING DIRECTION.** Written
as `if (sign === 0 || sign !== 0) return []`, TypeScript narrows `sign` to `-1 | 1` and reports
`TS2367` — and `render.test.ts` compiles the live package source, so 2 of its reported 10 escpos
kills were a TYPE error wearing a behavioural costume. Rewritten type-valid it kills **7**. This
package's own guide already records the rule; it caught this round too. **Check that a mutant
COMPILES before reading its kill count.**

⚠ **R5 SURVIVED AT THE JOIN ON ITS FIRST RUN and the fixture was added because of it.** Half-DOWN
was killed by `packages/domain` and by `apps/pos-electron` and by **nothing** in
`order-tax.test.ts`, because no fixture there landed on an exact half — the round-3 shape exactly.
`§E` now carries `Rs 45.50` at the rupee and `Rs 45.00` at ten rupees, and the mutant dies there too.
Reading the suite would not have found that; running the mutant did.
