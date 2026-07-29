# T-2 / T-3 — acceptance test authorship brief

**For the test-authoring session only.** `24 §3` step 2: these tests are written by a
**different session from the implementer**, from **spec text only**, and committed **red**
before implementation begins.

## Read these, and nothing else

- `specs/01-kernel-sync.md` — **`01-F60`** (the target), plus `01-F17`, `01-F52`..`01-F59` for
  the surrounding catalog law, and `01-F4` for what an unknown event type must do.
- `specs/02-pos-app.md` — **`02-F42`** (the target), plus `02-F1` for the two axes it closes.
- `specs/14-backoffice.md` — `14-F29` for context on where the completeness rule comes from.
  You are not testing the editor; it does not exist.
- `specs/00-platform-overview.md §6` (money contract) and `§7` (config layers).
- The package `CLAUDE.md` and `README.md` of whatever you are testing, for how its suites are
  laid out and named.

## ⚠ Do NOT read

- **`plans/wave-1/channel-pricing-and-the-counter-loop.md`.** It contains the implementation
  design — the schema shape, the resolution order, where validation sits. Reading it makes these
  same-mind tests, which is the exact failure `24 §3` step 2 exists to prevent (independently
  authored tests catch 25% of faults against 14% for same-mind ones). **The FRs are sufficient.
  If they are not, that is a defect in the FRs and you should say so rather than go looking.**
- Any implementation of the above FRs. None exists yet; if you find one, stop and report it.

## What to write

**T-2 — `packages/domain`.** `02-F42` closes `channel` to the set `02-F1` names, and makes it a
price key. Tests belong wherever `domain`'s registry suites already live.

**T-3 — `packages/sync-protocol`, `packages/sync-client`, `services/sync-gateway`.** `01-F60`
puts prices on the catalog and requires completeness at the writer. `services/sync-gateway`
needs Docker (Testcontainers).

Both are **protected paths** (`20 §4.4`). You are authoring tests, not touching implementation.

## The bar these tests are held to

The round-2 oracle findings (`plans/wave-1/oracle-round-2-findings.md` §C) named four patterns.
Three are test-authorship failures and every one recurred *inside the work fixing them* — read
that file, it is the most useful thing here:

- **The guard passed by not looking.** A13: three tests reduced to `expect(0 < 3).toBe(true)`,
  asserting an empty store was empty, comparing two zeroes. A server-side test wrapped its only
  assertion in an `if` so a regression left it green having run **zero expectations**.
- **The test was written to pass.** A8: rows added to satisfy a totality gate for compositions no
  component makes, cited against line numbers that pointed at unrelated declarations, then routed
  out of the gate by the same edit.
- **Claimed coverage that does not exist.** A12: a test file's header claimed seven clauses; the
  one where the real defect lived had no test in the file at all.

Concretely, for these FRs:

- **A negative test must be able to fail.** If you assert a publish is refused, assert *what* it
  names and assert the store is unchanged afterwards — a refusal that leaves a partial version
  behind is the actual A3 hazard, and "it threw" does not catch it.
- **Assert the closed set against the spec, not against itself.** `expect(ORDER_CHANNELS).toEqual(ORDER_CHANNELS)`
  is the shape to avoid. The five values are in `02-F1`; pin them literally.
- **`dine_in` is the interesting case.** It is currently emitted as a `channel` by
  `packages/sync-client/src/__acceptance__/builders.ts` (lines 34, 49, 196) and it is an *order
  type*, not a channel. `02-F42` makes that invalid. Expect to have to touch those fixtures; the
  question of what they were *meant* to say is a real one — say what you decided and why.
- **Money is integer paisa.** No float may appear on any path you assert.

## When you are done

Commit the tests **red**, with the failing output captured in the commit message (`24 §3` step 3:
the failing run is executed and captured *before* implementation starts). Name anything the FRs
left genuinely ambiguous — that is a finding, and filling it with a plausible assumption is how
a test ends up written to pass.
