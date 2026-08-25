# @restos/escpos

**Owning spec: `specs/03-kitchen-fulfillment.md + 18 §10` — read it before modifying anything here (AGENTS.md routing).**

- PROTECTED PATH (encoder). Printer fonts for English/numerals; bitmap path for logos/QR/non-Latin user content (03-F8).
- **IMPLEMENTED through K-6** (August 2026): capability record + column derivation (K-1), the encoder and its ink ladder (K-2), the `Transport` seam and the virtual printer that renders emitted bytes to PNG (K-3), `DocumentSpec`/`DocumentProfile` and the pure `render()` (K-4), the KOT layout (K-5), and the durable spooler (K-6). **K-7 landed (August 2026) and it is the SEAM**: `apps/pos-electron/src/main/index.ts` now constructs `createSpooler` at startup and `main/printing.ts` renders the KOT off the `order.confirmed` append, fans it out per station (`03-F2`/`03-F50`), drives `03-F4`'s budget on a `RETRY_WINDOW_MS / MAX_TRANSMIT_ATTEMPTS` interval and raises `03-F5`'s band on the counter. Before it, this whole package had **zero production callers** — the wave's named defect. **If you add anything here, grep for its caller before calling it done.** **Still owed: K-8, the physical pass on real hardware** — no printer has ever been attached, so every assertion in this package is over emitted bytes, transport calls and a software page. The shipped transport is `unattachedPrinter` (`main/printing.ts`): it reports `no_response` on every transmit, which is the truth about a device with no `18 §10` link, and it routes through the ordinary retry budget to the band. `27-F35`'s ≥85% comprehension gate on real staff is owed with K-8. **No test here is evidence about a cook.**
- **THE BYTE→PAGE INTERPRETATION LIVES HERE NOW — `src/simulate.ts`, ONE HOME (August 2026).** It moved out of `packages/testing`'s virtual printer when a second consumer appeared (`apps/pos-electron/src/main/file-printer.ts`, an opt-in `RESTOS_PRINT_TO_FILE` transport that writes a document to a PDF so a till with no hardware still produces something a human can look at). **Two walks over one command set is the defect, not the duplication** — they diverge, and then a document looks right in the snapshot suite and wrong in the app, or the reverse, which is worse because the suite is the instrument; `03-F40`'s two incompatible bit layouts for one sensor is the corpus's own example of that class. The virtual printer is now a thin device wrapper (`Transport` shape, `03-F41`'s hold, `03-F10`'s roll controls) and `packages/testing` took a `workspace:*` dependency on this package to do it. **That creates a genuine cycle in the package graph** (this package devDepends on `@restos/testing` for `kot-document.test.ts`) which `turbo.json` cuts at `@restos/testing#build`; if either package ever gains a real build step, that override becomes a hazard and the cycle has to be broken by moving the virtual printer here — an `18 §10` amendment, so a spec PR. **One DECLARED interpretation was added (`24 §3b`): `GS V` ends a PAGE** (`03-F42` — the cut separates one ticket from the next; K-3's oracle records that "what a cut looks like on the page is unstated" and asserts nothing). PNG stays for `18 §10`'s snapshots; PDF is the app's artefact because a document is one transmitted unit and PNG has no multi-page form. Both read the same dot matrix. **None of this is hardware and K-8 is unchanged.**
- **FONT B IS SETTLED AND THE ANSWER IS NO — do not re-open it on a hunch (`DEC-HW-001` (1), August 2026).** The founder re-opened `03-F49` on **legibility** grounds, because `min-columns.ts` gated on Font A with a circular reason (the font was chosen to keep the FR's sentence true). Decided on legibility, the answer is unchanged and `03-F49` stands. **The numbers:** at 203 dpi Font A's cap is 1.75–2.13 mm and Font B's is 1.13–1.50 mm; at an assumed 0.45 m that is **13.4–16.2 arcmin vs 8.6–11.5** against ISO 9241-303's **16 minimum**. The KOT's type is **already at the floor in Font A**, and the item NAME is `normal` because `27-F56` spends the 2× rung on the quantity and the identifier — so Font B removes ~30% of a budget with no slack. **The corpus states font cell WIDTHS only** (`03 §7`) and **no cap height for either font anywhere**, so those heights are IMPORTS from published ESC/POS geometry, and `27-F27` is scoped to glass (`27-F11h`: *"this document has no design language for thermal paper"*) — the 0.45 m is a stated assumption, not a citation. **Two engineering facts that make this more than a gate choice:** the encoder **cannot emit Font B at all** (no `ESC M` in `encoder.ts`, one face and no font state in `simulate.ts`, and `ESC M` is **not in K-2's allowlist**, so emitting it is a finding for the test-owning session), and **`cols_font_b` has zero production readers** — a declared capability nothing uses. **Measured:** flip the gate to `cols_font_b` and a realistic ticket on 384-dot paper **discards 320 dots and drops a whole word**, while under the shipped `example_data` it discards **zero** — which is why no suite catches it, since `03-F36`'s build-time gate renders at **42 Font-A columns = 504 dots** and has never rendered on a 384-dot page. **What would reopen it is K-8's rig**, on `27-F61`'s precedent and `27-F35`'s ≥85% gate; until that sheet exists no FR may assume Font B is legible on a KOT. **The suites already defend the Font-A gate and none needed retiring** — mutating `checkColumns` to Font B kills **21** tests here, one of them named for this exact case.
- **`src/__acceptance__/` is the ORACLE and is READ-ONLY to the implementing session (24 §3 step 2, 24-F5).** K-1's suites (`printer-capability.test.ts`, `min-columns.test.ts`, and the type-only `oracle-surface.ts`) were authored from `03 §7` layer 3, `03-F36` and `03-F49`; K-2's (`encoder.test.ts` and the type-only `encoder-oracle-surface.ts`) from `03-F8`, `03-F35`, `03-F36`, `27-F55/F56` and `18 §10`. Each by a session that read no implementation and no design doc. They are committed RED on purpose. If you believe an assertion is wrong, that is a finding for the test-owning session, cited by FR ID — never an edit.
- **`encoder.test.ts` carries an independent ESC/POS walker, and it is an ALLOWLIST.** Any command it does not admit fails the suite as an unaccounted byte — that is how `03-F36`'s ban is made total. Each admitted command carries the FR that buys it; each banned one carries the FR that bans it. Needing a command the list does not admit is a finding for the test-owning session, not a test edit.
- **It also carries a QR DECODER (`jsqr`, devDependency), and that one is not optional.** `03-F35`'s opacity rule means every other QR assertion — rasterised not native, square, 18–25 mm at the target dpi, byte-identical across `has_native_qr` — is satisfied by a correctly sized BLACK RECTANGLE (demonstrated: a 152×147 dot blank at 203 dpi passes all five). The decode assertion is what makes the fiscal QR real. `jsqr` is a decoder only, deliberately: `qrcode` is the implementation's dependency and the oracle must never encode with it, or the assertion becomes a tautology.
- **The same trap governs the raster TEXT path, and `03-F8`'s July 2026 ruling closed it by refusing.** No Wave-1 input can produce non-Latin text, and "a raster was emitted" cannot stand in for legibility, so a non-Latin `user_text` field is refused (`raster_font_unavailable`) rather than rendered. A LATIN user field still prints through printer fonts — that distinction is load-bearing and has its own test.
- Each suite ends with a `DEFERRED` block naming what it could NOT assert and which later K-task owns it, and each header names the FR ambiguities it refused to fill. Read both before claiming an FR is covered.
- **FOUR of `03-F31`'s EIGHT TYPES ARE WRITTEN (August 2026): `kot`, `shift_close_slip`, `day_summary` and now `receipt` (`C16`, `02-F15`/`02-F16`).** Before this the type had a column floor in `min-columns.ts` and **no renderer** — `grep -a -rn 'receipt'` over `src` and `apps/pos-electron/src/main`, minus tests and that table, returned **zero lines**, so a restaurant could ring an order, cook it and take the money and had nothing to hand the person who paid. **Four are still unwritten and that is scope, not oversight:** `bill` (`03-F31` names the type and **no FR in doc 02 or doc 03 states what a pre-payment request carries** — writing one is inventing content, commandment 2), `refund_slip` (`02-F36`), `rider_settlement_slip` (`09-F19`, Wave 2), `test_page` (`03-F10`).
- **`document-parts.ts` IS THE ONE HOME FOR A SCALAR ON PAPER, and it exists for `simulate.ts`'s reason.** The money token (`27-F23`), the Karachi wall clock (`27-F62`/`01-F46`), the `label value` row (`03-F36`), the group break, `03-F37`'s band, the owner note and the tail were all private to `cash-documents.ts` or `document.ts`; the receipt is their second consumer. **Two renderings of one scalar diverge**, and then a chit and a receipt for one order disagree about what time it was, or a figure is right on the shift slip and wrong on the receipt. `dateOf` is new beside `clockOf` and the pair records the split: a KOT prints hour and minute (`27-F55` — carry LESS; it is read minutes after it is cut), a receipt prints the date too (`02-F15` says "date/time", and the document outlives its shift — `02-F36`'s refund and `02-F10`'s recall are both reached from it). **A DECLARED divergence from `domain`'s `businessDate`:** that uses ICU and gets Pakistan's 2008–2009 DST right; this uses a fixed UTC+5 because `03-F30` makes byte-identity on Hermes-without-ICU a law. Same trade `clockOf` already made.
- **⚠ `day_summary` GAINED `undated_by_channel`, AND THE FLOOR WAS CHECKED BEFORE THE WORDING WAS WRITTEN (August 2026).** `02-F43`'s unbound bucket surfaced the MONEY and not the CHANNEL, so a slip printed `Phone Rs 0` five rows above `Undated sales so far Rs 893` — two individually true rows that together tell a manager the phone took nothing on a night it took Rs 893, while the ledger and the back office agreed exactly. The bucket now carries a per-channel breakdown, exhaustive over `02-F42`'s closed set on this document's own stated rule. The money is **NAMED, never DATED** (`01-F45`): it stays out of `sales_by_channel`, and `undated_sales_paisa` stays the authoritative aggregate, so the breakdown can be short of it and never over. `Undated Storefront` is 18 columns → 18 + 1 + 13 = **32**, inside the 34 floor; a prefix one word longer would have made an honesty fix into an `03-F49` spec act. **The `03-F36` build-time gate defended it unprompted:** the mutant that renders none of the new rows reds `render.test.ts`'s data-axis control (*"every leaf of the shipped example is on paper"*) as well as the five new assertions.
- **The receipt's money is the FOLD's, never this layer's (standing law 3).** The total is `billedEffectiveFromJsonLines` — `01-F30`'s billed_effective, BigInt-accumulated — and a line carries the **UNIT** price with the word `each`, not `qty × unit`. That product is `billedCellPaisa`, fold logic carrying the exited-line rule and `CONTESTED_LINE_BILLABLE`, and `26 §8` forbids re-deriving it outside `sync-client`: a naive product prints a money figure beside a **VOIDED** line that contributes zero to the total beneath it, and a receipt whose lines do not add up is worse than one that asks the reader to multiply. **The extended line amount is OWED and its blocker is one exported function in a protected package.**
- **Three of `02-F15`'s own fields have NO DATA IN THE PRODUCT and are ABSENT rather than faked**, each held by an anti-scope assertion that fails the day a placeholder appears. **CHANGE** — `payment.recorded.amount_paisa` is the amount *applied*; `TenderPanel` passes `coversBill ? remainingP : enteredP`, so the Rs 230 handed back on a Rs 1,000-for-Rs-770 sale exists nowhere in `01 §4` and there is no `tendered_paisa` field to read. **MODIFIERS** — the read models carry none (`main/gateway.ts` writes `modifiers: []` and says so). **DISCOUNT LINES** — ⚠ *this read "`discount.recorded` has no payload schema at all (`26 §7`)" and that stopped being true*: `packages/domain`'s registry has carried schemas for `void.recorded`, `comp.recorded` and `discount.recorded` since `plans/v0.md` gap 1 landed, `apps/pos-electron` emits all three, and `26 §7` was amended 2026-08-23 to say so. **The conclusion survives on the MONEY instead**: `merge.ts`'s comp and discount arms are projection-inert while `DEC-MONEY-010`'s gate (iii) is unmet, so neither act moves `billed_total` and a `Discount Rs 200` row above a total it did not reduce is the SECOND, implied total `16-F33` (c) refuses by name for a settled receipt. The row is still deliberately *not* printed as a named gap the way `day_summary` prints its adjustments line, and the distinction is real: that document is a **reconciliation** whose arithmetic breaks when a group is missing, while a receipt's arithmetic is self-contained — a discount must move `billed_effective` before it can move the paper, so nothing is silently dropped from what is printed. ⚠ **AND THE `day_summary` LINE THIS SENTENCE POINTS AT NO LONGER SAYS `NOT RECORDED` (August 2026):** it said so on the premise above, the premise became false, and a manager's own slip was therefore stating that nothing had been recorded about a night holding a void, a comp and a discount, each with an actor and an approver — reproduced on a real device store. It reads **`NOT TOTALLED`**, chosen at the same twelve columns so `MIN_COLUMNS.day_summary` stays 34 and no `03-F49` floor moves.
- **Doc 16 forces nothing at Wave 1 and the mechanism was already built.** `16-F1` has tax off by default and doc 16's own header puts the add-on at wave "on demand"; `03-F33` puts `FISCAL_LOCKED` blocks *"not in the `DocumentSpec` at all"*. So the receipt declares no fiscal block **by rule** — `SpecRegion` makes it unrepresentable — and an adapter's block plus `03-F35`'s rasterised QR arrive through `render()`'s existing `fiscal?` argument. Both the injection position and `03-F34`'s QR-size refusal are asserted on the receipt.

**Mutation matrix — the `receipt` type and its seam (control: escpos 340/340, pos-electron 438/438, 0 survivors).** In-tree, byte-exact backups with a restore trap, **full package suites under every mutant**. 293 escpos + 411 pos tests existed before this work; 47 + 27 are new. **The last column is the point.**

| # | mutant (exactly one branch) | new escpos (47) | new pos (27) | pre-existing 293 + 411 |
|---|---|---|---|---|
| M0 | **CONTROL** — `receipt` unregistered in `DOCUMENT_SPECS`: the pre-work tree | **47** | **14** | **all 704 green** |
| M1 | **THE SEAM** — `main/index.ts` never calls `receipts.settled()` | 0 | **1** | all green |
| M2 | **THE STUB SUPPLY** — `cashier: () => null` (Rule B's blind spot) | 0 | 1 | all green |
| M3 | **THE CROSS-TALK** — the KOT's `reconcile` stops skipping receipt jobs | 0 | **1** | all green |
| M4 | **THE MONEY (caller)** — the total is summed from the lines, not read off the fold | 0 | 1 | all green |
| M5 | **THE MONEY (layout)** — the line prints `qty × unit`, not the captured unit price | 2 | 2 | all green |
| M6 | **THE WORD** — `each` dropped, so a unit price reads as a line total | 2 | 2 | all green |
| M7 | **THE LABEL** — the raw kernel channel identifier reaches the customer's paper | 1 | 1 | all green |
| M8 | **THE STAMP** — time only, no date (the KOT's reading on a kept document) | 2 | 1 | all green |
| M9 | **THE BAND** — `03-F37`'s reprint marker never renders | 3 | 0 | all green |
| M10 | **THE TRIGGER** — a PARTIAL settlement prints a receipt too | 0 | 1 | all green |
| M11 | **NEGATIVE CONTROL** — the durable job-id prefix is renamed | **0** | **0** | all green |

**M0 is the attribution baseline and its right-hand column is the whole argument for the work:** *704 pre-existing tests cannot tell a product that can hand a customer a receipt from one that cannot.* Reverting one registration line takes the entire document away and every gate in the repo stays green.

**M3 IS THE DEFECT THIS WORK NEARLY SHIPPED, and it is the wave's named shape one document over.** The KOT's `reconcile` skipped `cash::` jobs only, so a printed receipt would have appended **`kot.printed` for its order** — permanently, under `01-F1` — and `02-F31`'s T1 auto-advance reads that event to move lines to `in_prep`, so *handing over a receipt would have told the product the food was being cooked*. It is killed by **exactly one** assertion, a source scan, and by **nothing behavioural in either package**: the two printers share a spooler and not a ledger, and no suite that injects its own dependencies can see the difference. The guards are now a stated **DENY-LIST** (`isCashJob` + `isReceiptJob`) that every new document type must extend, because a KOT job id carries no marker of its own and "is this a KOT" can only be asked as "is it none of the others".

**M4 and M5 are the two halves of law 3 and neither subsumes the other.** M4 is the CALLER re-deriving the order total; M5 is the LAYOUT re-deriving a line total. Both are invisible to the other package's suite, and both are killed only because the fixtures are the **dangerous** case rather than the ordinary one — a **voided line**, where "sum the lines" and "read the fold" give different answers (`Rs 960` vs `Rs 60`). With a coherent fixture, where the lines happen to sum to the total, both mutants survive. That is the round-3 law on a money field: the mechanism was right and the guard has to be *pointed* at the case that matters.

**M9's zero in the pos column is honest, not a gap.** The reprint band is a property of the DOCUMENT and the seam never sets `reprint: true` — `C17`'s act is not built. It is the `packages/escpos` suite's to own, and it owns it three times over.

**M11 is what makes every red row mean something:** a real one-branch edit to a live constant reddens nothing, so the suites are holding properties rather than pinning strings a future session may improve.

**WHAT THE MATRIX DOES NOT COVER, measured rather than assumed.** `02-F16`'s **`receipt.printed` is not emitted at all**, so no mutant can test it: the type is in the `01 §4` catalog and `packages/domain/src/registry.ts` carries no payload schema, which makes emitting it an `01-F4` runtime error — and adding one turns it into an `OrderKeyedEventType` whose `assertNever` guard in `sync-client`'s merge engine **fails to compile** until an oracle pins a merge rule (`merge.ts`'s own comment: "a new KnownEventType needs an oracle-pinned merge rule before the engine may consume it"). Two protected paths, neither this task's. The ack for a receipt band is unrecorded for the same reason. **`C17`'s reprint act** is owed with them, and `03-F41`'s duplicate hazard has a receipt analogue that is `02-F16`'s named fraud vector rather than a wasted chit.

**Mutation matrix — R39's itemised tax line (control: escpos 395/395, 0 survivors).** In-tree,
byte-exact backup with a restore trap (`receipt-document.ts` verified byte-identical after), **full
package suite under every mutant**. 368 tests existed before this work; 27 are new
(`__acceptance__/receipt-tax-line.test.ts`). **The last column is the point.**

| # | mutant (exactly one branch) | new escpos (27) | pre-existing 368 |
|---|---|---|---|
| R1 | **THE CONTROL — the two tax rows removed: the pre-work tree** | **14** | **all green** |
| R2 | **R39 — the tax row is APPENDED after the amount due** | 1 | all green |
| R3 | **`16-F1` — posture `none` prints `Tax Rs 0`: "off" collapses into "zero-rated"** | 1 | all green |
| R4 | **THE MONEY — the renderer recomputes the total as `subtotal + tax`** | 1 | all green |
| R5 | **R39's NOUN — the tax row loses the word `Tax`** | 1 | all green |
| R6 | `03-F36` — the pre-tax figure and the tax share ONE line | 3 | all green |
| R7 | **NEGATIVE CONTROL — the same guard, inverted; identical behaviour** | **0** | all green |

**R1 is the attribution baseline and its right-hand column is the argument for the work:** *933
pre-existing tests across both packages cannot tell a receipt that itemises its tax from one that
prints a bare total.* Deleting two rows takes the whole feature away and every gate in the repo
stays green.

**R4 is law 3 at the layout layer and it is the one to re-run after any change here.** `27-F24` puts
the arithmetic upstream by name; a renderer that agrees with its inputs on coherent data and
silently corrects them on incoherent data hides a real defect in the fold. It is killed only because
the oracle's fixture is the DANGEROUS case — an *incoherent* total (Rs 9,999 against a subtotal and
tax summing to Rs 1,334). On a coherent fixture the mutant survives, which is `M4`/`M5`'s lesson one
document over.

**⚠ TWO MUTANTS HAD TO BE REBUILT BECAUSE THEY DID NOT COMPILE, and the first draft's numbers were
wrong in the direction that flatters.** Writing R1 as `true || tax === undefined || …` and R7 as
`(tax === undefined ? true : …)` both defeat TypeScript's narrowing in the false branch, so
`tax.subtotal_paisa` became "possibly undefined" — and `render.test.ts`'s **tsc oracle compiles the
live package source**, so each reported **3 pre-existing failures** that had nothing to do with tax.
A negative control that does not compile is not a negative control, and a control mutant whose
pre-existing column is dirty cannot support the attribution claim it exists to make. Both were
rewritten type-valid; both columns then read `all green`. **Check that a mutant COMPILES before
reading its kill count** — this package's tsc oracle makes a type error look like a behavioural
kill.


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
