# @restos/domain

**Owning spec: `specs/01-kernel-sync.md §4 + 00 §6` — read it before modifying anything here (AGENTS.md routing).**

- SACRED (18 §2): every event/entity/config schema and the permission matrix live here ONCE.
- Every change here is a spec PR + senior review. Nothing redeclares these types elsewhere.
- Money = branded integer paisas; quantities = branded integer mg/ml/units. No floats, ever.
- **IMPLEMENTED (Wave 0).** See `README.md` for the module map. Changes here are spec-PR + senior review (SACRED path, 18 §2).

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
