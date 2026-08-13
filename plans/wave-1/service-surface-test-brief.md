# S-1 / S-2 — acceptance test authorship brief (`domain`, `sync-client`)

**For the test-authoring sessions only.** `24 §3` step 2: written by a **different session from
the implementer**, from **spec text only**, committed **red** before implementation begins.

Both packages are protected paths (`20 §4.4`). These two tasks carry the money arithmetic of the
whole service surface — every screen above them is a rendering of what this fold computes.

## Read these, and nothing else

- `specs/02-pos-app.md` — `02-F21`, `02-F22`, `02-F23`, `02-F24`, `02-F26`, **`02-F37`**, and
  `02-F12`/`02-F13` for the tender vocabulary the expected-cash sum groups by.
- `specs/01-kernel-sync.md` — `01-F17` (never block the sale), `01-F30` (conservation),
  `01-F31`/`01-F32` (attempt keys, the fifth tender), **`01-F34`** (folds read no ordering
  metadata), `01-F43`..`01-F46` (branch-consensus time, the business day).
- `specs/26-merge-semantics.md` — **`§7` in full** (the "looks like ordering / actually needs"
  table is the design of this fold) and **`§8`'s binding lesson** for the suite.
- `specs/00-platform-overview.md §6` — money.
- `packages/sync-client/FOLDS.md` — line 15 declares the `shift_cash` fold's shape and owners.

## ⚠ Do NOT read

- **`plans/wave-1/service-surface.md`.** It is the implementation design — the task split, the
  fold's internal shape, the screen layout. A test author who reads it writes same-mind tests
  wearing the costume of independent ones, which is worse than not splitting at all: the
  evidentiary basis (independently authored tests catch 25% of faults vs 14%) evaporates while
  the process still reports as followed.
- Any implementation of these FRs. **None exists** — `packages/domain/src/registry.ts` has no
  `shift.*`/`day.*`/`cash.*` key, and `packages/sync-client/src/folds/` contains only `merge.ts`.
  If you find one, stop and report it.

**The FRs are sufficient. If they are not, that is a defect in the FRs and you should say so
rather than go looking.**

## The two tasks

Take **one per session**.

| Task | FRs | What it is |
|---|---|---|
| **S-1** | `01 §4` catalog, `02-F21`..`F26`, `02-F37`, `26 §7` | Payload schemas for the seven events this surface emits — `shift.opened`, `shift.closed`, `day.opened`, `day.closed`, `cash.drawer_opened`, `cash.paid_out`, `cash.deposit_recorded` — **and the shift key on `payment.recorded`** (see the trap below; `26 §7` and `02-F37` between them determine that it exists, that it is carried, and that it is nullable) |
| **S-2** | `02-F22`, `02-F23`, `02-F37`, `01-F30`, `01-F34`, `26 §7`/`§8` | The `shift_cash` fold: expected cash by method, over/short, the shift/day lifecycle |

**S-0a/b/c (permission matrix, PIN session) are not in this brief** and are authored separately.

## What these FRs make unusually testable — use it

- **`01-F34` is a property, not an assertion.** A fold that reads no ordering metadata is testable
  by *bijective id relabelling* (including order-reversing) and by *injecting garbage* clocks and
  sequences, then asserting the projected values are unchanged. `26 §8` reports this enforced
  dynamically in the prototypes via Proxy-poisoned envelopes that **throw** on an
  ordering-metadata read. That technique is available to you and is stronger than any equality
  check written after the fact.
- **`01-F30` is executable.** Conservation is stated as an equation, so it is a property over
  generated payment/refund/void/comp/discount sets, not three hand-written examples.

## Specific traps these FRs name — each is a test

The spec has already done the failure analysis here. A test that ignores it is ignoring
known-broken behaviour rather than speculating.

- **`26 §8`, and this is the one that matters most.** A `min(envelope.id)` tiebreak
  **passes plain convergence** and is convergent-**and-wrong**: `00 §6` pins ids to UUIDv7, whose
  leading 48 bits are the minting device's wall clock, so id-min is min-wall-clock in a disguise.
  Only bijective-relabel invariance kills it. **And the old refold-equivalence gate must not be
  ported — it would bless min-id.** A suite that omits relabel invariance has tested nothing about
  law 1.
- **`26 §7`: bucketing a payment into a shift is a *carried key*, not an ordering question.** The
  failure to write a test against is a fold that asks *"which shift was open when this payment
  arrived?"* — that reads the **reading device's** state, so two devices project different money
  from the same event set. This is the law most often broken by accident (twice in the
  post-review round).
- **`26 §7`: over/short is a *carried fact*.** The counted figure and the expected figure that the
  cashier was shown are both facts at close time. A fold that recomputes "expected" at read time
  will silently change a number the cashier already signed off once a late payment arrives —
  `01-F1` forbids the mutation, and the read-time recompute performs it in effect. Test that a
  late-arriving payment does **not** move a closed shift's recorded variance.
- **`26 §7`: duplicate shift/day open needs a *carried causal link*.** Two devices both opening a
  shift after a partition is ordinary offline behaviour, not an edge case.
- **`02-F37` inverts the reflex.** Settling with **no shift open SUCCEEDS**, carries a null shift
  reference, and raises an `unbound_settlement` anomaly. *"Never a modal, never a block."* A test
  asserting that this path throws or refuses is asserting the exact opposite of the FR — and note
  the FR's second half: opening a shift later does **not** retro-bind the settlement.
- **Money is BigInt in the fold.** Float `+` is non-associative near 2^53, so a running double
  total lets delivery order decide a money outcome — a live `01-F34` break, not a range concern. A
  total that cannot be represented exactly contributes **zero** and raises `money_overflow`;
  never truncate, and **never throw on the ingest path** (`01-F17`).
- **`01-F43`..`01-F46`: time is stamped at APPEND and travels inside the event.** A fold applying
  its own offset breaks law 1 silently. The business day is Asia/Karachi with an 05:00 cutover, so
  a sale rung at 01:30 belongs to the previous business day — `packages/domain/src/business-day.ts`
  already exports `businessDate` and `businessDayBounds`, and a test that reimplements the
  boundary arithmetic instead of asserting through them is testing its own copy.
- **`02-F23` groups by method.** Expected cash is *by method*, and `01-F32`/`DEC-MONEY-007` make
  `aggregator_receivable` and `khata_credit` behave **differently** in conservation. A single
  scalar "expected cash" passes a naive test and is wrong for four of the five tenders.

## The bar

Read `plans/wave-1/oracle-round-2-findings.md §C` before starting. Three of its four patterns are
test-authorship failures, and every one recurred *inside the work that was fixing them*:
assertions reducing to `expect(0 < 3).toBe(true)`; an assertion wrapped in an `if` so a regression
ran zero expectations; a tripwire that stayed vacuous after its blocker cleared; a no-degradation
guard that banned a field it required.

For these two tasks specifically:

- **A negative test must be able to fail.** Assert what an error *names*, not that something threw.
- **No printer exists.** `02-F24`'s day-summary ticket and the `shift_close_slip` are **out of
  scope** — K-8 is owed. Do not write a test whose name implies a slip was produced.
- **No identity exists yet either.** `actor_user_id` is nullable on the envelope and the POS
  currently hardcodes it null. S-1/S-2 must not assume a non-null actor; the tests that depend on
  a real cashier identity belong to S-0b/c and are authored there.
- **Do not test the screens.** These two tasks are schemas and a fold. If an assertion needs a
  rendered surface, it is in the wrong task.

## When you are done

Commit **red**, with the failing run captured in the message. Run
`pnpm test --force --continue` — `--force` because a cached turbo run has produced a false green
here, and `--continue` because turbo kills a failing task's siblings.

Name anything the FRs left genuinely ambiguous — filling a gap with a plausible assumption is how
a test ends up written to pass.
