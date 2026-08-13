# `01-F60` amendment — acceptance test authorship brief (`services/sync-gateway`)

**For the test-authoring session only.** `24 §3` step 2: written by a **different session from
the implementer**, from **spec text only**, committed **red** before implementation begins.

This is **not a new module**. `01-F60` shipped, and its writer-side completeness check has an
acceptance suite already (`services/sync-gateway/src/__acceptance__/catalog-pricing.test.ts`).
The founder then **amended the FR twice** (July 2026, `dac8747`) and **no code was shipped for
either amendment** — by design; `dac8747` says so explicitly. You are extending an existing suite
to the amended contract.

`services/sync-gateway` is a **protected path** (`20 §4.4`) and needs **local Docker**
(Testcontainers). The suite fails loudly rather than skipping when Docker is down — that is
`T-01-07` working, not a broken tree.

## Read these, and nothing else

- `specs/01-kernel-sync.md` — **`01-F60` in full, as it now stands.** Both amendments are inline
  in the FR text and each is marked *(founder ruling July 2026)*. Also `01-F53` (why a wrong price
  is permanent), `01-F55` (tombstones), `01-F52` (a version is a non-empty change set).
- `specs/02-pos-app.md` — `02-F42` for the closed channel set the pairs are drawn from.
- `specs/00-platform-overview.md §6` (money) and `§7` (config layers — and note the layer-2 config
  plane does **not** exist yet, which is *why* the enabled set is passed in).
- The existing `catalog-pricing.test.ts` and the package's `CLAUDE.md`/`README.md`, for how these
  suites are laid out and named. **Reading the existing tests is expected; reading `catalog.ts` is
  not** (`24-F9`: contract-only visibility).

## ⚠ Do NOT read

- **`services/sync-gateway/src/catalog.ts`.** It is the implementation you are testing. It also
  currently carries a **doc comment that contradicts the amended FR** — it describes the
  caller-supplied enabled set as a known gap that closes later, which is the position the founder
  overruled. If you read it you will be anchored to the superseded rule and may write tests that
  bless it.
- **`AGENTS.md`'s owed list and `plans/wave-1/service-surface.md`.** Both contain a
  session's analysis of what the code does today. The FR is the contract; the analysis is not.

**The FR is sufficient. If it is not, that is a defect in the FR and you should say so rather
than go looking.**

## The two amendments

| # | Ruling | Where it bites |
|---|---|---|
| **A** | **`modifier` is SELLABLE** — priced per `(branch, channel)` like any item, and inside the writer's completeness check. Non-sellable kinds (`category`, `modifier_group`) carry no price | the set of kinds the completeness check applies to |
| **B** | **The enabled set is a REQUIRED input to the publish** — *"not an optional one defaulting to 'check nothing'"* | the shape of the call itself |

## The traps — each is a test, and each is named by the FR

**1. `0` is a price, not a missing price. This is the highest-value test in the brief.**
The FR states the consequence deliberately: *"a free modifier carries an explicit `0` on every
enabled pair"*, and gives the reason — it distinguishes *"this costs nothing"* from *"somebody
forgot foodpanda"*, which are **indistinguishable under any rule that lets an unpriced modifier
through**. So:

- a modifier priced `0` on every enabled pair **publishes**, and
- a modifier **missing** a pair is **refused, naming the entry, the branch and the channel**.

The defect this catches is a falsy check — `if (!price)` treats `0` as absent and refuses a legal
free modifier, or the mirror, where a missing price defaults to `0` and sells a paid add-on for
nothing. Both are one character wide and both are permanent once `01-F53` snapshots them.

**2. `modifier` and `modifier_group` are one underscore apart and land on opposite sides.**
`modifier` is now sellable and **must** carry a price on every enabled pair; `modifier_group` is
explicitly non-sellable and **must not** be required to. Assert **both directions** — a test that
only checks the new sellable kind will pass against an implementation that made every kind
sellable, which would make deleting a category impossible.

**3. An existing GREEN test asserts the rule the founder overruled, and it will fail the correct
implementation.** This is the sharpest part of the task, so it is named rather than left to be
found:

- `catalog-pricing.test.ts:394` — *"with NO enabled pairs declared, nothing is omitted and nothing
  is refused **[GREEN at authorship]**"*, and the file header's **pinned interpretation 2**:
  *"`enabled` IS OPTIONAL, AND ABSENT MEANS 'nothing is enabled'."*

Ruling B reverses precisely that: absent used to mean *check nothing* and is now **not a legal
call**. Because the test is green rather than red, it does not merely go stale — **it resists the
fix**, and an implementing session that takes green-means-correct at face value will conclude the
amendment is wrong.

Note what actually happened here, because it is the reason this brief exists: the original test
author **flagged this hole as a finding** in the same header (*"a caller that forgets the argument
gets no check at all — and that hole is the FINDING in 1, not a design this file endorses"*), the
founder **ruled on exactly that finding**, and then nobody carried the ruling back into the suite.
The process worked; the follow-through did not. Your job includes retiring that test and the
header interpretation it rests on, with the ruling cited — **and interpretation 1's finding is now
answered too**, so it should stop reading as open.

**4. "Required" has a strong form and a weak one — say which you tested.** The weakest reading is
a runtime throw when the argument is missing. The strongest is that the call **cannot be
expressed** without it. `24 §3`'s standing preference is the structural version where it is
available (cf. `03-F32`'s "the profile schema has no slot id addressing money"). Test the
behaviour you can, and name in your report which form the FR's *"required input"* language should
bind the implementer to — that is a real question the FR leaves to the type, and the implementing
session should not have to guess it alone.

**5. Tombstones stay exempt.** `01-F55` keeps a deleted entry resolvable for display and off the
sellable grid; the FR exempts it from the price requirement, because otherwise deletion becomes
impossible as channels grow. A deleted modifier with no prices must publish.

## The bar

Read `plans/wave-1/oracle-round-2-findings.md §C` first. Its three test-authorship patterns each
recurred *inside the work that was fixing them* — assertions reducing to `expect(0 < 3).toBe(true)`;
an assertion wrapped in an `if` so a regression ran zero expectations; a file header claiming
coverage the file did not contain.

For this task specifically:

- **A refusal test asserts what the error NAMES and that the store is unchanged.** The FR requires
  the message to name the entry, the branch and the channel. "It threw" does not catch a refusal
  that left a partial version behind.
- **Money is integer paisa.** No float on any asserted path.
- **Do not assert the channel list against itself.** The five values are `02-F42`'s; pin them
  literally.

## When you are done

Commit **red** with the failing run captured. Run from the repo root:
`pnpm test --force --continue` — `--force` because a cached turbo run has produced a false green
here, `--continue` because turbo kills a failing task's siblings.

Name anything the FR left genuinely ambiguous. Filling a gap with a plausible assumption is how a
test ends up written to pass.
