# @restos/sync-client

**Owning spec: `specs/01-kernel-sync.md` — read it before modifying anything here (AGENTS.md routing).**

- PROTECTED PATH. Device sync engine: outbox (the canonical durable-queue core, 18 §4), folds, LAN mesh, hub election.
- Folds are pure, commutative, idempotent (01-F34) — property tests mandatory (20 §2.3).
- **IMPLEMENTED (Wave 0).** See `README.md` for the module map (device store, merge fold engine, LAN mesh/hub, cloud session). PROTECTED path — senior review on every change.

## `18 §4`'s storage adapter — TWO engines behind ONE port (August 2026)

**`18 §4` names two engines and one adapter; the implementation named one.** `device-store.ts:33`
did `import Database from "better-sqlite3"` at module scope, so *importing this package at all* was
fatal under Hermes and `18 §4`'s RN half was unreachable. The store now binds a TYPE.

| module | what it is |
|---|---|
| `storage.ts` | the port: `prepare` / `exec` / `pragma` / `transaction` / `close`, and nothing more |
| `storage-node.ts` | **the one place `better-sqlite3` is constructed** (asserted, not conventional) |
| `storage-op-sqlite.ts` | the RN driver — imports NOTHING native, so the whole contract runs in Node |
| `store.ts` | `openStore`, keeping the `{ path }` arm all 129 existing call sites pass |
| `rn.ts` | **the only import of `@op-engineering/op-sqlite` in the repo** (`18 §8`) |
| `transport-rn.ts` | a `CloudTransport` over the platform WebSocket, for a phone |

**Three properties are CORRECTNESS, not style, and a second driver is where they break.**
(1) everything SYNCHRONOUS — `01-F2`/`00 §5.2` want durability before the UI acks, and op-sqlite
offers exactly ONE synchronous primitive (`executeSync`), so `BEGIN`/`SAVEPOINT`/`RELEASE`/
`ROLLBACK TO` and the schema-script splitter are hand-rolled there. (2) `transaction` nests as a
SAVEPOINT — `26 §6.4`'s per-item page isolation. (3) `get()` returns `undefined`, never `null`.

**⚠ The mutant to re-run after any change here is the SEAM, not the logic.** Measured 2026-08-13:
deleting `nativeBinding:` from `store.ts` — which puts the Node-ABI addon in front of both Electron
tills and stops them booting — failed **0 of 694** tests, because the oracle proves the DRIVER
honours the option and nothing proved the DOOR forwards it. `__acceptance__/open-store-door.test.ts`
is the hand-written assertion that now kills it (1 of 696). Same shape, one seam out, as the
`catalog-fetch.ts` finding below.

**⚠ `transport-rn.ts` corrects a hardcoded advertisement, and that line is load-bearing.**
`cloud-session.ts:224` says `accepts_compression: true` — *"this BUILD can decode compressed
frames"* — which is false on a phone, because zstd is `node:zlib`. Uncorrected, the gateway grants
compression and the device connects, hellos, reports `connected: true` and then **silently receives
nothing for ever**. Reproduced against a real `ws` server before the fix.

## `catalog-fetch.ts` dropped the price and the station, and 579 green tests could not see it

**Found by RUNNING the four-process stack, not by reading anything** (August 2026 — the runbook is
`plans/wave-1/running-the-stack.md`). An owner priced an item at Rs 450 in the back office and
published it. It reached the till: right name, right kitchen name, right version. Every tile read
**`no price set`**.

`WireEntry` declared neither `prices` nor `station`, and `toEntry` copied neither. Everything
either side of that one function was correct — the gateway served
`prices: [{branch_id, channel: "counter", price_paisa: 45000}, …]`, `CatalogEntryWire` carried
them, `CatalogEntry` here declared them, `priceOf`/`stationOf` read them. The row that landed in
the device's `catalog` table was `{"kind":"item","id":…,"name":…,"kitchen_name":…}`.

**Why no suite saw it, and the lesson that generalises.** The two halves are each covered and
nothing covered the JOIN: `__acceptance__/catalog-pricing.test.ts` proves `priceOf` by calling
`store.catalog.apply()` **directly**, so it never crosses this seam, and
`__acceptance__/catalog-fetch.test.ts` did not contain the word *price*. AGENTS.md's named defect
of the wave, in a shape `seams:check` cannot express — `toEntry` is reached, called, and lossy.
`WireCatalogResponse`'s own doc comment already warned that *"a reshape is where a field quietly
goes missing"*, about this reshape.

**So the regression assertions run the whole hop** — wire frame → `accept()` →
`store.catalog.apply()` → `priceOf`/`stationOf`. An assertion on `update.upserts[0].prices` would
have passed against a store that dropped the column, which is the same mistake one layer down.

### Mutation matrix (round-3 law) — control 582/582 green (579 pre-existing + 3 new)

Every row is the FULL package suite, so the right-hand column is measured rather than reasoned.

| # | mutant (exactly one branch) | new 3 killed | pre-existing 579 |
|---|---|---|---|
| M1 | **`prices` dropped from `toEntry` — THE shipped bug** | 1 | **all green** |
| M2 | `station` dropped from `toEntry` | 2 (the station test and its inheritance control) | **all green** |
| M3 | only the FIRST price survives the reshape | 1 | all green |
| M4 | **CONTROL: `station: null` written through instead of collapsed to absent** | **0** | all green |

**M1 is the one to re-run after any change here**, and its right-hand column is the whole point:
the defect that made every synced menu unsellable failed **zero** of the 579 tests that already
existed. M4 is the attribution control — it is semantically equivalent under `stationOf` (which
fails `typeof === "string"` for both `null` and `undefined`), and a suite that killed it would be
over-constraining the mapping rather than defending `03-F50`.


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
