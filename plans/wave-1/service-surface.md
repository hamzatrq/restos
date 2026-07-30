# Wave 1 — the service surface: shifts, cash, day open/close

**Status:** APPROVED. Chosen as the next build by the founder in `dac8747`, scoped there as
*"unprotected `pos-electron` work"* — a scoping this plan corrects on three counts (§2). The
identity blocker §2 raised is **RULED (founder, July 2026): A-narrow — PIN session plus a minimal
staff registry, nothing else from doc 11.**

**FRs in scope:** `02-F21` (no-sale drawer), `02-F22` (day open, shift open, role guard),
`02-F23` (shift close + the cashier's own reconciliation), `02-F24` (day close, deposit,
day-summary ticket), `02-F26` (paid-outs), `02-F37` (settling with no shift open), `01-F30`
(conservation), `01-F46` (business day), `01-F17` (never block the sale).

**Owning specs:** `02` (POS) owns the surface; `05 §3` owns the manager-console half of the same
flows; `01` owns the money contract and the business day; `26` owns the fold's merge algebra.

---

## 1. Where we actually are

The counter loop closes end to end — `C4` start → `C5` priced line → `C9` kitchen → settle
(`02-F12/F13`). The tab rail already ships **five** surfaces (`27-F4`, positional memory), and
two of them are this build:

- `apps/pos-electron/src/renderer/Counter.tsx:44` — **`Cash`**, `unavailable: true`,
  reason `"not built yet"`. Disabled in place, never absent, per `27-F4`.
- the same rail's **`Me`** tab — `02-F23`'s *"I'm clean"*, a protection surface, deliberately a
  peer tab rather than buried inside `Cash`.

So the shell is ready and the screens have a home. Below the shell, essentially nothing exists.

**What is missing, precisely:**

| Thing | State | Evidence |
|---|---|---|
| Payload schemas for the 7 events this surface emits | **none** | `packages/domain/src/registry.ts` — no `shift.*`, `day.*`, `cash.*` key. `26 §7` already names this: *"`shift.*`, `cash.*` … have no payload schema at all — three of the four RHS terms of `01-F30` therefore evaluate to zero today."* |
| The `shift_cash` fold | **none** | `FOLDS.md:15` declares `shifts(shift_id PK, cashier, open_at, expected_json, closed)`; `packages/sync-client/src/folds/` contains exactly one file, `merge.ts` |
| `shift_id` on `payment.recorded` | **absent** | `registry.ts:140` — `order_id`, `amount_paisa`, `method`, `settlement_attempt_id`, `purpose`. No shift key. See §3.1 — this is the one non-deferrable schema change |
| Operator identity | **none** | `envelope.ts:38` has `actor_user_id … .nullable()`; `apps/pos-electron/src/main/index.ts:200` hardcodes `actor: "dev", actorUserId: null`. No PIN session, no staff registry |
| The `domain` permission matrix (Commandment 8) | **never written** | Same blocker that holds `backoffice-catalog.md` |

---

## 2. The gate — this is identity work wearing a cash-shaped hat

### 2.1 It is not unprotected work

Two of the three layers are protected paths under Commandment 10: the seven payload schemas land
in `domain`, and the `shift_cash` fold lands in `sync-client`. Only the four screens are
unprotected `pos-electron`. Senior review is required regardless of how the task is sliced, and
the `24 §3` test-authorship split applies to both protected tasks.

### 2.2 Every FR in scope binds to a *person*, and there is no person

- `02-F22`: *"A shift binds subsequent cash settlements and drawer events **to that cashier**."*
- `02-F23`: over/short *"recorded and **attributed**"*; *"cashiers see **only their own** shifts."*
- `02-F22` role guard: day open/close and float entry *"require manager/owner permission … a
  cashier session cannot execute them."*
- `02-F41`: *"attribution is whoever's PIN is in."*

With `actor_user_id` permanently `null`, a session can emit all seven events and render all four
screens, and **every attribution is null and every guard is vacuous**. That is not a partial
build; it is the shape `02-F37` explicitly refuses elsewhere — *succeed and lie*. `02-F23`'s
entire framing is a cashier seeing her own reconciliation and concluding *"I'm clean"*, which
requires an **I**. A reconciliation attributed to nobody protects nobody.

The reference shift is **two cashiers on the counter** (`role-task-inventories §0.1`). So this is
not a theoretical gap that a pilot would defer — it is wrong at the reference branch on day one.

### 2.3 RULED (founder, July 2026): A-narrow

**Build `01-F26`/`01-F27`/`01-F28` PIN sessions plus a minimal staff registry, and nothing else
from doc 11** — no attendance, no advances, no scheduling, no clock-in (`11-F1` is Wave 3 and
stays there). The minimum that makes an "I" exist, then the service surface on top of it.

The alternative considered and rejected — *single-operator, honestly*: ship with attribution null,
one implicit shift per device, and the role guard explicitly absent rather than faked. Every
screen would work and the drawer would reconcile, but it cannot tell two cashiers apart on one
terminal, and the reference branch has two. A shift model retrofitted with identity later is a
migration through an append-only ledger.

**What the ruling costs:** auth is a protected path (Commandment 10), so this is a second
protected subsystem in front of the one that was asked for. **What it buys beyond this build:**
`01-F26`'s Argon2id now has a *second* consumer — July's owner-password ruling — so the hashing
story gets built once, deliberately, rather than twice by two sessions that never met.

### 2.4 The FRs already specify the whole thing — nothing here is invented

The PIN session is not new design. It is four existing FRs that have never been built:

- `01-F26` — *User × Role × per-location assignment; permission overrides per user; PIN (Argon2id)
  unlock on shared devices; idle auto-lock.* **And it names the matrix seed:** *"The permission
  matrix from `restaurant-os.md` Appendix A is the seed; roles are permission sets, not apps."*
- `01-F27` — device tokens carry device identity **only**; user identity comes from the PIN
  session; both validated server-side.
- `01-F28` — **offline** PIN verification on-device against *synced credential hashes*; role
  changes propagate as **reference data** — i.e. the same `01-F21` mechanism the catalog already
  rides (`sync-client/src/catalog.ts`, `catalog-fetch.ts`), not a new transport.
- `02-F41` — attribution is whoever's PIN is in; there is no "acting for".

And Appendix A's seed matrix answers `02-F22`'s role guard directly, row by row:
*"Day open / close, cash count | — | ✔ | — | ✔"* (cashier no, branch manager yes, owner yes) and
*"View sales reports | own shift only"* for the cashier, which is `02-F23`'s own-shifts-only rule
stated in the seed. **The narrow matrix this build needs is derived from spec text, not invented**
— Commandment 2 is satisfied without a spec PR.

---

## 3. The design

### 3.1 The one schema change that is not optional

`26 §7` classifies *"shift/day/drawer bucketing of a payment"* under **things that look like
ordering problems and are not** — the answer is *a carried key*. `payment.recorded` has no shift
key, so today the `shift_cash` fold **cannot compute expected cash at all**.

The tempting fix is for the fold to ask *"which shift was open when this payment arrived?"* That
reads the reading device's state and **breaks standing law 1** — the same class of break the
post-review round found twice. It must be a carried key: the emitting device stamps the shift it
believes it is in, at append.

`02-F37` already presumes exactly this field and was written without it existing: *"the
settlement is recorded with a **null shift reference** plus an `unbound_settlement` anomaly."* A
null shift reference is a nullable carried `shift_id`. So the FR supports the addition — it was
simply never written into the schema. `02-F37` also fixes its nullability: the field is
**nullable and required**, because "no shift open" is a real, legal, non-blocking outcome and
`01-F17` forbids refusing the sale over it.

### 3.2 What the merge law does to the cash fold

- **BigInt accumulation** (standing law 3). Expected cash is a running total over a shift's
  payments; a float running total lets delivery order decide a money outcome.
- **Expected cash by method** = Σ over payments carrying this `shift_id`, grouped by `method`.
  Order-free, converges with zero ordering metadata. `02-F23` requires it *by method*.
- **Over/short is a carried fact, not a fold-time comparison** (`26 §7`). The counted figure is
  typed by the cashier; the expected figure **at that moment** is snapshotted into `shift.closed`
  alongside it. Recomputing "expected" later from a fold that has since received a late payment
  would silently change a number the cashier already signed — `01-F1` forbids the mutation, and a
  read-time recompute performs it in effect. `domain`'s `DirectedPaisa` (`money.ts:125`) is the
  signed type for the variance.
- **Duplicate shift/day open needs a carried causal link** — `26 §7` names `prev_shift_id`. Two
  devices both opening a shift after a partition is an ordinary offline case, not an edge case.
- **`settlement_attempt_id` uniqueness is org-global, UUID-class** (`26 §7`'s unstated law) —
  already true today, and the cash fold now depends on it.

**Binding on the acceptance suite** (`26 §8`): it must include **bijective id-relabel and
clock-injection invariance**. It must **not** port refold-equivalence — a `min(envelope.id)`
tiebreak passes plain convergence and is convergent-and-wrong, because UUIDv7's leading 48 bits
are the minting device's wall clock.

### 3.3 The screens

Four, across the two tabs that already exist in the rail:

| Screen | Tab | Tasks | Budget (`role-task-inventories §2.2`) |
|---|---|---|---|
| **Day** — open + float; close + count + deposit | Cash | C3, C34 | ≤ 4 taps + one numeric field; ≤ 6 taps |
| **Shift** — open; close + count | Cash | C2, C33 | ≤ 3 taps; ≤ 6 taps, one numeric field per method |
| **Drawer / paid-out** — no-sale open with reason; paid-out with reason | Cash | C28, C29 | ≤ 3 taps incl. reason; ≤ 5 taps + one photo |
| **Reconciliation** — own expected vs counted, own day | Me | C33's read half | — |

Laws that bite on these screens: `27-F24` (the system computes — over/short is never mental
arithmetic), `27-F8`'s **126 dp** kiosk minimum for high-consequence numeric entry (every count
field here qualifies), `27-F22/F23` (Western digits, `Rs` symbol-first, no operational decimals),
and `27-F9` (the count keypad is not adjacent to anything destructive).

`02-F25` puts these flows on the manager console too, with the ownership boundary in `05 §3`. The
manager app is not in Wave 1, so **the POS fallback is the only path that ships** — which is what
`02-F25` designs for (*"a branch without a manager phone loses nothing"*), not a gap.

---

## 4. What has to be built

| # | Task | Package | Tests authored by |
|---|---|---|---|
| **S-1** | `domain`: 7 payload schemas — `shift.opened/closed`, `day.opened/closed`, `cash.drawer_opened/paid_out/deposit_recorded` — **plus nullable-required `shift_id` on `payment.recorded`** (§3.1) | `domain` ⚠ | **separate session** |
| **S-2** | `sync-client`: the `shift_cash` fold per `FOLDS.md:15` and §3.2, incl. the relabel + injection suite | `sync-client` ⚠ | **separate session** |
| **S-0a** | `domain`: the narrow permission matrix — the Appendix A rows this surface touches (§2.4), as data with the predicates the callers need. **Not** the whole appendix | `domain` ⚠ | **separate session** |
| **S-0b** | PIN session: Argon2id hash + verify, offline verify against synced credential hashes, idle auto-lock, the staff registry as `01-F21` reference data (`01-F26`/`F27`/`F28`) | `domain` ⚠, `sync-client` ⚠ | **separate session** |
| **S-0c** | Wire the session to the envelope: `actor_user_id` stops being hardcoded `null` at `pos-electron/src/main/index.ts:200`; C1 unlock screen | `pos-electron` | **separate session** |
| **S-3** | Cash tab: day open/close, shift open/close — **needs S-0a/b/c** | `pos-electron` | **separate session** |
| **S-4** | Cash tab: no-sale drawer (`02-F21`) + paid-out (`02-F26`) | `pos-electron` | **separate session** |
| **S-5** | Me tab: `02-F23` reconciliation — **needs S-0b/c** | `pos-electron` | same session as S-3 |
| **S-6** | `02-F37`: settle emits the carried `shift_id`, null when no shift is open, and raises `unbound_settlement` — **needs S-0c** | `pos-electron` | **separate session** |
| **S-7** | `shift_close_slip` + `day_summary` printing (`03-F31`, `02-F24`) — **blocked on the KOT ladder** (K-3…K-6) and on **K-8**, the owed physical pass | `escpos` ⚠ | deferred |

**S-1 and S-2 do not depend on the identity work and should go first** — they are the two tasks
that were real regardless of how §2.3 was ruled, and S-2's merge-law suite is the longest pole in
the build. S-0a is independent of both. S-0b depends on S-0a only for the role vocabulary.

**Four of the nine live tasks are on protected paths** — S-1, S-2, S-0a, S-0b — and so is S-7
when it unblocks. That is the true shape of this build and the reason §2.1 matters: it carries a
Tier A review lane (`24-F20`), not the Tier B a screens-only build would have earned.

**`03-F9`'s drawer kick is out of scope and cannot be verified here.** The POS emits
`cash.drawer_opened` as the authoritative record (S-4 does this); the *kick* is executed by the
print service over RJ11, and **there is still no printer** — K-8 is owed. No test in S-4 may
imply the drawer physically opened.

---

## 5. What must be true when this is done

1. A cashier opens a shift, takes payments, closes the shift, and sees her own expected-vs-counted
   figures by method, with over/short computed and never mentally derived (`02-F23`, `27-F24`).
2. A manager opens the day with a float and closes it with a count and a deposit (`02-F22`,
   `02-F24`), against the `01-F46` business day (05:00 Asia/Karachi) — `domain/business-day.ts`
   already provides `businessDate` and `businessDayBounds`.
3. Settling with **no shift open succeeds**, carries a null shift reference, and raises
   `unbound_settlement` — no modal, no block (`02-F37`, `01-F17`).
4. The fold converges under bijective id-relabel and injected garbage clocks/sequences, and reads
   no ordering metadata (`01-F34`, `26 §8`).
5. Every money accumulator in the fold is BigInt; a total that cannot be represented exactly
   contributes zero and raises `money_overflow` (`01-F17`, standing law 3).
6. `pnpm test --force --continue` green across all suites, `pnpm verify` exit 0.

---

## 6. Questions this plan cannot answer

1. ~~**S-0, the identity ruling.**~~ **RULED** — §2.3, A-narrow.
2. **Tips.** `DEC-MONEY-004` is RATIFIED at *full* tips and states plainly: *"the POS payment
   screen must not ship a tip field until the events exist."* A tip is money in the drawer that is
   not in `billed_total`, so it lands in expected cash — the cash fold is being built directly in
   front of a ratified change to its own arithmetic. The events (`tip.pooled`, `tip.paid_out`)
   are named but **not in the `01 §4` catalog**, so per Commandment 2 they cannot be built here.
   *Recorded, not assumed:* S-1/S-2 should not design tips in, and should not design them out.
3. **`09-F18` will later block day close** while any rider has delivered-unsettled orders. That is
   Wave 2. Day close ships in Wave 1 with no such block, and a Wave-2 change will add a blocking
   condition to a flow that shipped without one. Named so it is a planned amendment, not a
   surprise.
4. **`11-F17`'s handover note** prefills from the shift-close expected/counted figures — *"never
   re-typed"*. Wave 3. If `shift.closed` carries those figures as §3.2 requires anyway, the later
   read is additive and needs nothing now. Stated so a future session does not re-derive them.
5. ~~**The screen map's C-numbers are stale.**~~ **FIXED** — and it was worse than "stale".
   `screen-map.md`'s tab rail cited task IDs that never matched `role-task-inventories.md`: the
   Cash tab pointed at C15–C18 (table moves, receipt printing, phone orders) and the Me tab at C19
   (*accept a cloud order*). The inventory has **never been renumbered** — verified against
   `a235a96`, the commit that added the screen map — so these were **wrong when authored**, not
   drifted. Four of the five rows were wrong. All five are re-derived and the correction is
   recorded in place.

   **The fix surfaced a hole this plan now owns:** `C1` (unlock with PIN) had no home anywhere in
   the screen map. It is not a tab — it gates every surface 20–60× a shift — and the map has no
   lock surface at all. **S-0c** owns it, which is why the ruling in §2.3 is what makes it
   buildable.
6. ~~**The `02-F22` role guard has nothing to enforce against.**~~ **Resolved while writing §2.4,
   and it reaches further than this plan.** The `domain` permission matrix has never been
   *written*, which is true and is what blocks `backoffice-catalog.md` — but it has always been
   **specified**: `01-F26` names `restaurant-os.md` Appendix A as the seed, and Appendix A carries
   the rows verbatim (*"Day open / close, cash count"* → manager/owner; *"View sales reports"* →
   cashier own-shift-only). So the matrix is a **derivation task, not a design task**, and
   **S-0a** now owns it.

   **This downgrades the back office's blocker too.** `backoffice-catalog.md` records the matrix
   as one of two things blocking it; if S-0a lands the narrow matrix with the predicates its
   callers need, the back office is left blocked on authentication alone — which July's
   owner-password ruling already scoped. Worth re-reading that plan once S-0a is done rather than
   carrying its blocker forward unexamined.

   The open part is genuinely narrow and is `backoffice-catalog.md`'s Q1, not this plan's: whether
   the matrix ships as the **narrow** predicate set its callers need or a **general** one the
   second consumer widens. S-0a should take the narrow reading — it is a protected-path change and
   the widening is cheap later, while an over-general matrix shipped early is the `24-F23`
   failure mode exactly.
