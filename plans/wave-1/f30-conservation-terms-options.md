# `01-F30`'s missing conservation terms — an options paper, not a fold

**Status: REFUSED as under-determined. No merge rule was written. A founder ruling is needed on
one question; two of the three blockers below are not merge questions at all.**

Commissioned as: *"the four escalatable writes landed today as projection-inert, so `01-F30`'s
`void_value`, `comp_value` and `discounts` terms still evaluate to zero — if the FRs determine the
rule, implement it; if they do not, STOP and write the options paper."* They do not. This is that
paper. Every number below is a measurement taken on `e21ff27`, and the command that produced it is
stated so it can be re-run rather than believed.

---

## 1. What is actually true today

`01-F30` states the equation:

> per order, `Σ tendering payments (purpose: settles_order) − Σ refunds = billed_total −
> void_value − comp_value − discounts` once settled

Its one executable form is `settledConservationResidualPaisa`
(`packages/domain/src/invariants.ts:71`), and its signature is the whole story:

```ts
export type SettledConservationArgs = {
  billed_paisa: number;    // exited (voided/cancelled) lines already excluded
  tendered_paisa: number;  // Σ tendering payments, purpose settles_order only
  refunded_paisa: number;  // Σ refunds over UNIQUE attempt keys (01-F31)
};
// returns billed − (tendered − refunded)
```

There is **no parameter** for `void_value`, `comp_value` or `discounts`. The terms do not evaluate
to zero because a fold declines to compute them; they are **not in the function at all**. Its only
production caller is the Auditor (`packages/auditor/src/auditor.ts:365`), which passes exactly those
three.

**The doc comment above that function states a reason that has expired.** It reads *"void/comp/
discount VALUE terms are 0 at v1 — those event types carry no payload schema, 26 §7"*. As of this
week they **do** carry payload schemas (`packages/domain/src/registry.ts`, `void.recorded`,
`comp.recorded`, `discount.recorded`, `order.line_price_overridden`). The conclusion may still be
right; the stated reason is not. That comment is in a **protected path** and should be corrected
whichever option is chosen — a comment asserting a premise that has expired is how the next reader
concludes the question is settled.

---

## 2. Three independent blockers. Only the first is a merge question.

### (a) There is no idempotency key on any of the four types — and no FR supplies one

`01-F31` is the divergence law, and its mechanism is a key:

> Folds dedupe by attempt key: unique-keyed maps whose Σ skips disputed keys. **The payload minus
> its key is the immutable intent** — members diverging in *any* field mark the key disputed,
> contribute **zero**, raise an anomaly, and are all retained; a fold never picks a winner.

That rule is uninstantiable without a key, and **exactly two schemas in the repo carry one**:

```
$ (parse registry.ts for looseObject bodies containing "attempt_id")
  carries attempt id: payment.recorded
  carries attempt id: payment.refunded
```

`01-F31` is titled *"Payment/refund idempotency"* and never claims to reach further. `02-F36` is the
only FR that puts the two families in one sentence — *"`payment.refunded` per `01-F29` … linked
`void.recorded`/`comp.recorded` when food is returned or remade, `settlement_attempt_id` idempotency
(`01-F31`)"* — and the key it names is **the refund's**, not the void's.

So the fold has three candidate rules and the corpus picks none:

| rule | behaviour | why it is not obviously right |
|---|---|---|
| Σ over all members | a double-tapped "void Rs 500" subtracts Rs 1,000 | `01-F8` event-id dedupe covers *transport* duplicates only — `01-F31` says so in as many words — so this is the failure `01-F31` exists to prevent, reintroduced one family over |
| Σ over distinct event ids | identical to the above for a double-tap | same |
| Σ over a new key | correct | **the key does not exist**; minting one is a payload change to four `01 §4` types, i.e. a spec PR (commandments 2 and 9) |

Choosing the third is the only defensible answer and it is **not an implementer's call**: `26 §7`
makes a merge rule an oracle-pinned decision, and `DEC-MONEY-008` shows what happens when a key's
uniqueness scope is left unstated — it had to be ratified separately, because *"if any device mints
a per-device counter, two genuinely distinct payments collapse into one key and cash vanishes
silently, converged identically everywhere."*

### (b) `26 §7` already ruled that `01-F30` is not a fold problem

Doc 26's own table, *"Things that look like ordering problems and are not"*:

| Looks like ordering | Actually needs |
|---|---|
| `01-F30` conservation | a **closure** mechanism (Auditor over the merged log) |

And its list of *"still requires an ordering mechanism"* has four entries, none of which is
conservation. So a device-fold merge rule is not the artifact `01-F30` is waiting for. The terms
belong in the residual and the Auditor — which is where `01-F30` puts them (*"executable in
`packages/domain` and enforced by the Auditor (`20 §4.2`) and property tests"*) — and that is a
**protected-path signature change plus a spec amendment**, not a fold.

### (c) The equation does not run at all, so new terms would be added to a check that never executes

This is the decisive one and it is already ratified. `DEC-MONEY-009` (founder, August 2026) records
that `01-F30` is *"open in THREE independent places"*: the check is gated on `order.settled === 1`;
`order.settlement_closed` **has no production emitter anywhere**; and **nothing schedules the
Auditor**. Re-measured here — every occurrence of `settlement_closed` outside a comment is a test
fixture (`auditor-builders.ts:215`, `services/jobs/.../helpers.ts:177`); `apps/pos-electron/src/main/
printing.ts:850` says in its own words that nothing emits it.

Adding `void_value` to that equation would be this wave's named recurring defect **committed on
purpose**: a correct subsystem with no seam to the product. It would also be invisible to
`seams:check`, which cannot see a missing producer for an event type.

---

## 3. A fourth question the FRs leave genuinely ambiguous — double-counting

`billed_paisa` is documented as *"billed total derived from the delivered lines, **exited
(voided/cancelled) lines excluded** — 'a fully-voided order nets to zero' (`01-F30`)"*. So a void
expressed as **line exits** is already netted out of the left-hand term.

`void.recorded` is a separate, order-keyed money act with its own `amount_paisa`. If both are
present for one void — the lines exit **and** the act is recorded, which is what `04 §` and `05-F6`
describe (*"waiter requests void with reason → … on `approval.granted`, `void.recorded` lands"*) —
then a naive `billed − void_value` **subtracts the same money twice**. Nothing in `01-F30`,
`02-F20`, `05-F6` or `26` says which of the two representations is authoritative, and the wrong
choice produces a permanent, converged, silent error in the direction `DEC-MONEY-009` was written
about. This must be answered before any term is added, and it is a spec question.

---

## 4. The options

**O1 — Rule the key, then implement in the Auditor/residual (recommended shape).** A spec PR adds
an idempotency key to the four types (`01 §4` + doc 01), amends `01-F30`'s executable form to take
the three terms, and answers §3's double-count. The fold stays projection-inert, per `26 §7`.
*Cost:* spec PR + protected-path change in `packages/domain` and `packages/auditor`. *Blocked on:* a
founder ruling on the key and on §3.

**O2 — Do §3 and (c) first, key second.** Conservation is unreachable today for reasons that have
nothing to do with these terms. Land `DEC-MONEY-009`'s owed list (a `01-F33` closing-act emitter, a
scheduled Auditor, an `EXCESS_TENDER_IS_EXCEPTION` decision), so the equation runs at all, then add
terms to a check that can be observed to change. *This is the ordering `DEC-MONEY-009` itself
implies* and it makes O1 verifiable rather than theoretical.

**O3 — Do nothing, and correct the expired comment.** The terms stay zero; the residual's doc
comment is rewritten to say *why* they are zero **now** (no key; conservation unreachable; §3
unresolved) instead of the lapsed *"those event types carry no payload schema"*. Cheapest, honest,
and leaves the debt visible. **Do this one regardless of which of O1/O2 is chosen**, because the
comment is wrong today either way.

**O4 — Guess a fold (rejected).** Sum the members and move on. Rejected on `26 §2`'s own grounds: a
rule guessed at this seam lets delivery order decide a money outcome, and `DEC-MONEY-009` is a
worked example of what that costs when it is found on running hardware rather than in review.

---

## 5. What this session did NOT do, stated plainly

No fold rule was written. No schema was changed. No invariance test was written, because law 1's
bijective id-relabel and clock-injection tests assert a property **of a rule**, and there is no rule
to assert against — a suite written now would pin whichever guess it was written beside, which is
precisely the failure `catalog-pricing.test.ts:394` recorded when a green test went on defending an
overruled rule.

The one change that is safe and owed in any branch of the decision is **O3**: correct the expired
premise in `packages/domain/src/invariants.ts`. It is a protected path, so it is named here rather
than done unilaterally.
