# @restos/inventory

**Owning spec: `specs/10-inventory-supply.md` — read it before modifying anything here (AGENTS.md
routing). Design and build plan: `plans/inventory/design.md`; this package is §7 slice 1 step 3.**

- **PURE. No I/O, no clock, no database handle.** `DEC-ARCH-001` (B)'s ruled shape — a package both
  planes may import. `10-F4` puts sale deduction in a CLOUD read model and the physical acts in the
  ledger; `10 §4` Flow A step 2 (amended) computes with the currently published recipe version, and
  `plans/inventory/design.md` §5.3 draws the consequence: **a device cannot hold a correct
  expected-stock number at all**, which is why `10-F17`'s count is BLIND by construction.
- **THE ONLY ENVELOPE FIELD IT READS IS `branch_created_at`, and the narrowness IS the law-1
  statement.** `event.ts` declares `InventoryEvent = { type, payload, { branch_created_at } }`.
  `ParsedEvent` is assignable to it, and an implementation here **cannot reach `envelope.id` or
  `device_created_at`** because the compiler does not believe they exist. `__acceptance__/law-one.test.ts`
  is still the load-bearing proof; the type is the belt.
- **ONE division door (`rational.ts`) and one merge rule (`contested.ts`).** Every valuation is
  `round(qty × value / qty_base)` from `10-F28`'s PAIR, in BigInt, rounded once. Every business key
  that arrives with two different payloads is a **contested set**, never last-write-wins.

## ⚠ EIGHT PLACES `plans/inventory/design.md` MET AN IMPLEMENTATION AND LOST

The design had never been built when this landed. These are the corrections, each with the FR that
decides it — a finding for the design's next revision, not a licence to change one.

1. **§4.1/§4.13 CONTRADICT §5.1 on the reference cost.** §4.1 puts `reference_cost_paisa` *"per base
   unit"* on the item; §5.1 says, of the period cost, *"**do not store a unit cost.** A cost per base
   unit is a rate and will not be an integer."* Resolved as a **PAIR**, which is also what an owner
   types (*"Rs 60 per kg"* = `{6000, 1_000_000}`) and which makes `receipted` and `reference` the
   same shape, so `valueAt` has one door.
2. **§4.6 keys `MenuRecipe` by `(sellable_kind, sellable_id)` and a fold cannot use that key.**
   `order.line_added` is `{order_id, line_id, item_id, qty, unit_price_paisa}` — **no kind**. Two
   mapping rows sharing a sellable id are therefore an **ambiguity** (a named `10-F8` coverage gap),
   never a guess between them.
3. **§4.8's *"the count carries the period key it closes"* is not buildable.** `10-F28` defines a
   period by the counts either side of it, so stamping one is an ordering read (`01-F34`), and two
   devices counting one location would stamp the same key from different premises. The period is
   DERIVED from the count set, ordered by `branch_created_at`.
4. **§4.8 and §4.14 (a) both say "floor" and they are different claims.** Measured on the first run
   of `variance-report.test.ts`: a *perfectly complete* count containing one `estimated` item came
   back flagged as a floor, because its zero gap is (correctly) inside its own noise floor. A flag
   true on every well-executed count is `L9`'s permanently-red rail. `is_floor` now means *"rows
   whose MONEY this report could not read"*; `within_noise_row_count` is its own fact.
5. **`10-F31`'s quantity column has NO GATE and the first `buildRow` gated it anyway.** The FR's own
   surface table: *"Variance report in **quantity** — **No gate** — it needs no price at all"*. The
   first draft nulled the quantity gap when no cost basis existed, hiding a measured 50 kg
   discrepancy because nobody had typed a price. Caught by `variance-report.test.ts` §D, not by
   reading.

**6–8 were found by the ADVERSARIAL REVIEW rather than by building (August 2026), and the third is
the expensive kind.**

6. **§4.13's `receipted` is too wide, and so was `10-F31` as first written.** Both say the basis is
   the period pair *"when `opening_qty + purchase_qty > 0`"*, full stop. Two cases break it: an
   opening valued at the owner's typed `reference` price makes the pair *not* an invoice (so the
   basis must carry the **worst** provenance in it, as `worstBasis` already does for the count
   basis), and `10-F5`'s negative theoretical stock makes a pair whose signs disagree — a
   **negative unit cost** that inverts the money. `10-F31` is amended for both; the design's next
   revision should follow.
7. **NEITHER THE DESIGN NOR THE FRs SAID WHICH PERIOD A DERIVED FACT BELONGS TO, and the omission
   was worth Rs 3,400 an order.** §5.2 restates `10-F3` as an order-free set difference — correctly
   — and then says nothing about windowing it, so the first implementation windowed the EVENTS.
   That silently turns *"for every order for which an `order.confirmed` exists"* into *exists in
   this window*, and an order rung before a count and confirmed after it is deducted in **neither**
   period. `10-F28` now carries the rule: a fact belongs to the period holding its **act**, stamped
   at the minimum `branch_created_at` of that act's observations. **An omission in a design reads
   exactly like a decision that was made, which is why this one survived a build and a suite.**
8. **§4.6 argues the ambiguity rule for MENU recipes and never for PREP recipes.** Two mapping rows
   sharing a sellable id are correctly *"an AMBIGUITY … never a guess between them"*; two prep
   recipes producing one item were resolved by `refs.recipes.find(...)` — array order deciding a
   money value. The same argument now applies at both ends, plus a writer refusal.

**Decisions the design does not make, made here and stated at their declarations:** the WORST basis
wins when an item is counted across two areas; usage and surplus are never netted; the first period
is a BASELINE with no rows; `exact` carries a **zero** error term, so `k` alone cannot silence the
module; a contested order line REFUSES the items it touched rather than reducing consumption.

## ⚠ `k` IS THE ONE UNPINNED NUMBER — `K_NOISE_FLOOR_BP` in `noise.ts`

`10-F33` (a) leaves it open by name, on `DEFAULT_STATION`'s recorded precedent: it needs a pilot's
data, and an implementation declares it as **one named constant carrying that reason**, never as a
literal at a use site. It ships at `1.0` (10 000 bp), the weakest defensible floor, and the
direction it will move is **up**. `BASIS_ERROR_BP` states, where it is declared, that its figures
rest on **one ten-bottle head-to-head** rather than a study, and that **nothing models container
opacity** — so an opaque bottle's floor here is roughly half what its real error deserves.

## ⚠ WHAT IS STILL OWED, MEASURED — READ THIS BEFORE TRUSTING A CLOSED PERIOD

Two findings from the August 2026 review are **recorded and not fixed**, each with a named tripwire
in `__acceptance__/period-boundary.test.ts` §D. Both tripwires assert behaviour an FR contradicts:
**if you make one fail, you have probably fixed something** — delete it and take the debt off this
list.

- **`10-F28`'s freeze does not exist.** *"A closed period's derived movements, valuation and
  variance report are IMMUTABLE"* — and `varianceReports` recomputes the whole chain from live
  `refs` on every read, so editing a recipe rewrites closed periods (measured: a 500 g → 600 g
  recipe line moved a **closed** period from `gap −1 kg / −68 000 paisa` to `gap 0`). Editing a
  `reference_cost`, an `is_counted` flag or an area membership does the same, and a late
  `order.line_removed` now reaches back into a closed period because `10-F3`'s set difference is
  over the ledger. **It cannot be closed here:** a freeze needs the closed period's derived rows
  STORED (`10 §5`), and this package is pure by ruling. The debt is the read model's —
  `services/api/src/inventory.ts` recomputes from the baseline on every read — and it is slice 2.
  ⚠ `period.ts`'s header claimed the freeze in the present tense until the review; that is `L11`,
  and the correction is in place saying what was false.
- **The count merge is exact-millisecond only.** Two devices submitting the kitchen sheet and the
  store sheet 1 ms apart are **two counts and therefore two periods** (`10-F28`'s own words), and
  every item of the second reads `area_line_missing`. `count.ts`'s comment named *"two devices
  submitting"* as a case it covered and it did not. Merging on a time window would mean inventing
  the window (commandment 2), so `10-F30` now records the consequence and the operational answer:
  **one closing act reuses one `count_id`.**

## Mutation matrix — round-3 law. Control **145/145** green, negative controls **0 kills**

In-tree with a **restore trap**: every row is sha256-verified byte-identical after the run, and the
driver refuses to continue if one is not. ⚠ **The driver is a scratchpad script, not a committed
one** — the path `.runlogs/mutate.py` named here has never existed in the tree, so re-deriving the
table means re-writing it; the table below is the record. **The V-rows were measured on the
113-test suite** and are not re-stated here (`L1`); V1 and V2 were re-run on the 145-test suite in
the review round below, at 8 and 3. Nothing here is a security constant — each mutant is an arithmetic or
control-flow branch that reds a test rather than downgrading a credential, which is the narrow case
AGENTS.md `T8` leaves in-tree. The permission cells were mutated OUT of tree; see
`packages/domain/CLAUDE.md`. Every row is the FULL package suite.

| # | mutant (exactly one branch) | killed |
|---|---|---|
| V1 | **THE BLANK-AS-ZERO MUTANT — a missing or uncounted area line reads as `qty 0` and the item counts (R365's shipped behaviour)** | **5** |
| V2 | **LAST-WRITE-WINS — `resolve()` returns the last observation** | **3** |
| V3 | FIRST-WRITE-WINS — the other order-dependent tiebreak | 3 |
| V4 | `10-F33` (a) OFF — the floor is always zero, so every gap is reportable | 33 |
| V5 | `10-F33` (a) INVERTED — every gap is suppressed | 13 |
| V6 | **`10-F33` (c) — a hint fires on ONE period (what every surveyed product does)** | **5** |
| V7 | `10-F33` (c) — SIGN ignored: three above-floor periods in any direction fire | 2 |
| V8 | **`10-F31` — the TRUTHINESS TEST: an explicit `0` cost read as no cost** | **2** |
| V9 | `10-F31` — COMPLETE tested on the rounded bp *and* blocking | **0 — see below** |
| V9b | the same with BOTH real conjuncts dropped | 2 |
| V9c | **the exact-equality conjunct dropped, `blocking` kept** | **0 — see below** |
| V9d | **the `blocking` conjunct dropped, exact equality kept** | **1 (after §C's new fixture; 0 before)** |
| V10 | `10-F28` — the period cost stored as a rounded UNIT RATE | 4 |
| V11 | `10-F31` — the QUANTITY gap nulled when there is no cost basis | 1 |
| V12 | `10-F31` — a ZERO-QUANTITY receipt line enters the valuation | 1 |
| V13 | `10-F28` — the BASELINE period reports rows (the opening assumed zero) | 2 |
| V14 | **`10-F33` (a) — the area rollup takes the BEST basis** | **1 (after §C2's new fixture; 0 before)** |
| V15 | `10-F33` (f) — the runtime vocabulary filter removed | **0 — the filter was REMOVED, see below** |
| V16 | **NEGATIVE CONTROL — behaviour-preserving refactors in three files** | **0** |

**V1 and V2 are the two to re-run after any change here.** V1 is the whole point of the module:
under it a half-counted item reports `counted 12 kg, expected 18.7 kg, gap −6.7 kg` with total
confidence, and every other assertion in the file still passes. V2 is the defect a prior attempt at
this module found in its own implementation.

**V16 is what makes the red rows mean anything:** a genuine restructuring of three files under test
reddens **nothing**.

### The REVIEW round — every row is the defect re-applied, measured 2026-08-24 on 145 tests

Same driver, same restore trap (sha256-verified byte-identical after every row). **All three DO NOT
SHIP defects failed 0 of the 113 tests that existed before this round**, which is the number to keep:
the arithmetic inside one period was correct and heavily asserted, and the crossing between two
periods was not asserted at all.

| # | mutant (the defect, re-applied) | killed |
|---|---|---|
| R1 | **D1 — `consumption` is handed a PRE-WINDOWED event list (the shipped defect)** | **4** |
| R1b | D1's other half — the window is simply not passed (the optional-parameter hazard) | 8 |
| R1c | the act's stamp is the MAXIMUM observation, so a redelivery moves the act | 1 |
| R2 | **D2 — the carried opening is branded through `paisa()`, which refuses a negative** | **6** |
| R2b | **D2 over-fixed — a pair whose signs disagree is admitted as a cost** | **2 — was 0, see below** |
| R3 | **D3 — the explosion writes into the caller's totals line by line** | **3** |
| R4 | F7 — the producing prep recipe comes from `refs.recipes` array order | 2 |
| R5 | F6 — an undeclared area line is dropped and the item still reads counted | 2 |
| R5b | F6 over-fixed — the SHEET decides the roster, so a skipped declared area vanishes | 6 |
| R6 | F5 — a pair is always `receipted`, whatever its opening was valued at | 2 |
| R6b | F5's rank inverted — the pair reads the BEST of its halves | 2 |
| R7 | F9 — the deleted `opening_unknown` comes back, taking the quantity column with it | 2 |
| R8 | the two new WRITER refusals deleted | 2 |
| V1 | **REGRESSION — the blank-as-zero mutant, re-run per this file's own instruction** | **8** |
| V2 | **REGRESSION — last-write-wins in `resolve()`** | **3** |
| N1 | **NEGATIVE CONTROL — behaviour-preserving rewrites in four files** | **0** |
| N2 | **NEGATIVE CONTROL 2 — the scratch merge and the refusal loop rewritten** | **0** |

**The seam is unchanged and was re-measured, not assumed:** unwiring `inventory: inventoryRouter`
in `services/api/src/router.ts` reddens **14 of 403** api tests.

### ⚠ R2b KILLED 0 ON ITS FIRST RUN, AND THE SURVIVOR WAS IN THE FIX RATHER THAN THE DEFECT

`10-F5`'s negative carry crashed the report, and the obvious repair is *"stop refusing negatives"*.
Widening the guard all the way — `qty !== 0 && value !== null` instead of `qty > 0 && value >= 0` —
killed **0 of 143**, because every fixture in the suite happened to make the two rates coincide.
That is `L10` pointed at the repair: the mechanism was right and nothing was aimed at the case that
decides it. The case is a pair whose **signs disagree** — a negative opening plus a positive receipt
— which divides to a **negative unit cost** and renders a 2 kg shortfall as **Rs 1 356 of surplus**.
Two assertions now own it and the mutant dies. **A fix earns a mutant of its own, not only the
defect it repairs.**

### ⚠ Three survivors, and each is a finding rather than a coverage gap

- **V14 and V9d survived their FIRST run — 0 of 110 each — and that is the round-3 defect
  reproduced inside the work that cites it.** V14: no fixture anywhere counted ONE item across TWO
  areas with DIFFERENT bases, so the worst-basis branch was never executed. V9d: no fixture had a
  sellable **sold at zero revenue** with no recipe, which is the only case separating `10-F31`'s two
  window clauses (it contributes 0 to both sums, so the share is still exactly 1, and it still has no
  recipe — a comp, or a free add-on). Both fixtures now exist and both mutants die.
- **V9c survives and is CORRECT: the two clauses of the window gate are not independent.**
  `blocking` is populated on exactly the dishes that keep `costed` below `total`, so `costed ===
  total` adds nothing over it. The converse is NOT true (V9d), which is why both are kept — the
  equality clause is the FR's own words and it holds the day someone changes how `blocking` is built.
  Recorded at the declaration rather than left as a survivor with no explanation.
- **V15 survives because the mutated code was DELETED rather than kept.** `pnpm seams:check` Rule A
  reported `vocabularyViolations` as reached only by tests, and the obvious fix was a runtime filter
  in `sustainedHints`. That filter was written, and mutation then measured it at **0 of 110** —
  every hint this module can produce already passes, so nothing could ever exercise the branch. **A
  guard no test can fail is `L8`'s shape with the sign flipped**, and satisfying a reachability rail
  with one is how a rail teaches a session to write decorative code. The filter is gone, the export
  carries an `@unreached-owed` marker naming the surface that RENDERS a hint, and the binding
  assertion is `noise-floor.test.ts` §C's sweep over the closed `HINT_KINDS` set.

## What is NOT here, and what gates it

`countEntryToBase` (`10-F29`'s writer-side tier arithmetic) and the three `10-F31` completeness
predicates carry `@unreached-owed` markers. Their consumers are slice 1 **step 5** (the back-office
editors) and **step 6** (the device count surface), and both are gated on amendment **A1** — the
`inventory` member of `01-F75`'s CLOSED resource set — which this change does not land. No resource
string was invented: `01-F75` says in terms that one an implementation invents is an `01-F4`-shaped
error one layer down.
