# T-01-22 — Fold-brand migration (DEC-MONEY-005 fold clause)

Senior-review origin: `audit-1.md` #8 ("fold money accumulators are unguarded doubles —
schedule, don't just document"). This is the clause DEC-MONEY-005 deferred when T-01-13
landed the helpers and the lint rule.

## What is actually true (verified, and narrower than "unguarded doubles" suggests)

Two facts, both checked rather than remembered:

**1. The fold plane is *deliberately* exempt from the ban.** The GritQL rule
(`packages/config/biome-plugins/no-raw-money-arithmetic.grit`) matches arithmetic where an
operand is a **bare identifier** whose name contains `paisa`. Its own comment says member
expressions like `payload.amount_paisa` are *"the plain-number fold plane — its migration
to branded types is the deferred DEC-MONEY-005 fold clause, not this rule."*

So in `folds/merge.ts`:

```
let payTotal = 0;
payTotal += m.amount_paisa as number;      // LHS: no "paisa" in the name -> no match
                                            // RHS: member expression      -> no match
cell.qty * cell.unit_price_paisa            // member expression           -> no match
```

Neither side trips the rule. The accumulators are not merely unbranded — they are
**outside the enforcement surface entirely**, in both directions.

**2. There is no live overflow or precision bug today.** The fold performs only `+` and
`×` on integers, per order. Both are *exact* in a double well below `2^53`
(`MAX_SAFE_INTEGER` ≈ 90 trillion rupees in paisas); a single order's totals are not
within many orders of magnitude of it. Saying the shipped fold miscounts money would be
wrong, and this plan does not claim it.

**The finding is a guard gap, not a defect.** That distinction decides how it is fixed:
the work is to close the surface *before* the code that would exploit it exists, not to
repair broken arithmetic.

## Why it must land before tax/discount/split-bill

DEC-MONEY-005's whole thesis: *"division and rates are where floats enter."* The fold does
no division and no rates **yet**. Doc 16 (tax), doc 17 (discounts) and 02 split-bill each
introduce exactly those, into exactly these accumulators. The first `* 0.17` or `/ n`
written into `merge.ts` would be silently legal today. That is the entire reason
DEC-MONEY-005 says the helpers must land *before* that code — and the fold plane is the
one place where the guard is currently absent.

## The change

1. **Extend the ban to member expressions** whose property name ends in `_paisa`
   (`$obj.amount_paisa`, `cell.unit_price_paisa`). This closes the class rather than
   relying on how a local variable happens to be named. Expect it to light up existing
   fold code — that is the point, and it is why this is one task with step 2.
2. **Migrate the fold accumulators** to the `domain` helpers: `sumPaisa` for accumulation
   (BigInt-internal with an explicit `MAX_SAFE_INTEGER` overflow throw), `addPaisa` /
   `subPaisa` for the pairwise cases. Name accumulators with the `Paisa` suffix so they
   are covered by the bare-identifier arm too — belt and braces, since the two arms catch
   different mistakes.
3. Keep `splitPaisa` / `applyRateBps` unused-but-available: nothing in Wave 0 divides or
   applies a rate, and adding a caller "for completeness" would be speculative work the
   craft rules forbid.

## Traps

- **`sumPaisa` throws on overflow.** That is correct for a money total, but the fold runs
  on the sync ingest path where an uncaught throw could wedge ingestion. Decide
  deliberately where the throw is caught and what the projection shows — a money total
  that cannot be represented is an anomaly to surface (the `01-F31` disputed-key pattern
  is the existing precedent), never a crash and never a silently truncated number.
- **Do not brand the fold's *keys*.** Only values are money. Attempt ids, order ids and
  line ids are strings and stay strings.
- **The engine must stay a pure function of the delivered event set** (`01-F34`). Helper
  substitution is arithmetic-identical by construction, but the invariance oracle
  (`merge-invariance.test.ts`) is the check that it stayed that way — run it.
- **Sequencing:** this task and T-01-17 both rewrite regions of `folds/merge.ts`. T-01-17
  lands first (it changes what the anchor stamps read); this one rebases onto it. Running
  them concurrently would conflict.
