# Wave-1 oracle round — findings

**July 2026.** Five independent review sessions over work that `24 §3` step 2 says should never
have been written the way it was: implementation and acceptance tests authored in one session,
three of the four bodies on protected paths (`domain`, `sync-client`).

**All five reviews are in.** Each reviewer has been re-commissioned as the **oracle session for
its own fix round** and is authoring failing acceptance tests; I implement against them. Tests
must be red before any code is written.

Every finding below was **executed**, not argued.

---

## The headline

**Every one of the five reviews found real defects, including two that mean shipped work does not
do what it claims.** That is the answer to whether the process rule earns its cost.

The four worth reading even if nothing else here is:

1. **The item-availability fold is wired to nothing.** A correct pure function that no event
   reaches. The 86 control does not work.
2. **Its acceptance suite fails ~2.5% of real runs**, and the flake *is* the bug — a live
   standing-law-1 break where delivery order decides a projected value.
3. **`rupeesFromPaisa` reopened the money-arithmetic ban by renaming its output.** `rupees * 1.17`
   — a float tax rate on money — draws zero diagnostics.
4. **The design-token suite asserted `27-F15`'s headline number against the pair that passes it**,
   and gave the pair the research actually measured a self-chosen weaker bar with a comment
   conceding it was "EXPECTED to be weak".

**What survived:** `packages/ui/src/tokens/color-science.ts` was independently re-derived from the
published formulas, validated against the Sharma/Wu/Dalal (2005) 34-pair reference set at 5e-5,
and found **correct in full** — transfer function, WCAG luminance, the CIEDE2000 `Rt` rotation
term and hue-wrap branches, and the Machado matrices applied in linear light. Repo-vs-independent
diff on all 22 tokens: **0.0**. Also clean: every text contrast pair the components render (40/40
≥ 4.5:1), and all 71 FR IDs cited in `packages/ui` resolve — no invented IDs.

---

## A. Confirmed defects, severity-ordered

### A1 — The availability fold is unwired. The feature does not work. `01-F22`
`device-store.ts` has **zero** references to availability; the only consumers repo-wide are a
re-export and the fold's own tests. No persistence table, no `ParsedEvent → AvailabilityToggle`
adapter, no Auditor refold, and `merge.ts:448` increments `events_folded` before a switch whose
`availability.changed` case folds nothing — the exact "honesty overcount" the work-counter pin
exists to prevent. `FOLDS.md:13` still declares a pre-`26` shape with a clock-derived column.

I shipped a correct merge rule, tested it hard against the hard law, and never connected it.

### A2 — The availability property suite fails ~2.5% of real runs, and the flake is a real bug
`availability.ts:92` — `m.set(t.event_id, t)` is **last-write-wins by arrival**. Two toggles
sharing an `event_id` with different values make the projection a function of delivery order:
a live standing-law-1 break in the one place the fold holds state.

Measured **50/2000 = 2.50%** at the suite's default `numRuns`, with two independent reproducing
seeds. Worse, `projectAvailability` (what the tests assert on) and `apply` (what the fold runs)
**disagree** on that input — so the function the tests exercise is not the function that ships.
`20 §2` is explicit: *"a property failure is never 'flaky' — it is a bug with a reproducer."*
The suite also pins no seed and no `numRuns`, against the package's own convention.

### A3 — A supersede cycle resurrects an 86'd item to AVAILABLE, with no anomaly
Every arrived event says *unavailable*; a k≥2 cycle projects *available*. `availability.ts:61`
explicitly defends the k=1 case; the k=2 generalisation is undefended. Three spec problems: no FR
covers empty-maximal-over-non-empty (Commandment 2 — plausible behaviour in a gap); it contradicts
`26 §9`'s ratified `AVAILABILITY_FALSE_WINS`; and it is the hazard `26 §7` names by name —
*availability subset-blindness*, "provably unfixable by any algebra… requiring a
delivery-completeness mechanism nobody has specced."

**Not hypothetical:** `01-F39` gives waiter devices a *scoped slice*, so a partial toggle set on a
tablet silently resurrects an 86'd dish and the platform offers it for sale.

### A4 — `01-F58` contested is operationally sticky, and the fold makes the fix impossible
Contested does not clear under the natural UI ("supersede what my screen last showed") — measured
across six operator taps, still contested. It clears only if the new toggle supersedes **every**
maximal event, and `AvailabilityFold` exposes no way to obtain them. So the correct construction
requires re-deriving the supersede-DAG outside the fold — the exact prohibition the file invokes
in its own defence. The outcome also depends on *which* concurrent event the device happened to
name, for identical operator intent.

### A5 — A snapshot destroys tombstones; `01-F55` fails on its own named scenario
`catalog.ts:117-121` clears and re-inserts; `CatalogSnapshot` cannot express a tombstone. After
any snapshot a deleted item is gone, and the reprint of an earlier order renders the raw id. A
double-bind: the only alternative the type offers resurrects the item into the sellable grid. Not
an edge path — **every `needs_snapshot` recovery wipes every tombstone.**

### A6 — `rupeesFromPaisa` launders money past the `DEC-MONEY-005` ban by renaming it
The GritQL rule matches the *name* `[Pp]aisa`. The helper returns `rupees`. Measured with the real
plugin config: paisa-named group 4/4 flagged, identical arithmetic on `rupees` **zero** — including
`rupees * 1.17` and `l5 += rupees`. The reviewer hit it accidentally: renaming a local from
`subPaisa` to `rest` made a blocked expression legal. **The ban is defeated by a variable name.**
The escape inside the helper is fine; the defect is that the return type hands it to every caller.

### A7 — `27-F15`'s ΔE00 target was asserted against the pair that passes it
The research measured **green vs red** (naive 8.2 → fixed target 31.4). The test asserts 31.4
against **amber↔red**, which passes at 44.34. Shipped green↔red is **29.42 — short of the target**,
and the one test that looks at it sets its own bar at `>15` with a comment that it is "EXPECTED to
be weak". That threshold appears in no spec. Root cause: the shipped ladder is L\* 97.5→81.5→31.4;
the 31.4 was computed on 100→77.5→39.7. Different palette, inherited number. Amber↔green is 19.59.

### A8 — WCAG 2.2 SC 1.4.11 is never checked, and 15 rendered pairs fail it
`27-F21` says gate on AA; AA includes non-text 3:1. Nothing in the package computes a single
non-text contrast. Enumerated as the components actually compose them: 15 failures, all non-text —
tile fills at 1.06:1, borders at 1.40–1.62:1, the amber status fill at **1.42–1.63:1**.

Two compounding errors of my own: the test that should have caught this used **ΔE00 ≥ 20**, a
metric that counts chroma, which amber passes — and `27-F18` says chroma is exactly what collapses
at 500 lux. And it measured against `bgColor-surface`, **the one background no component ever
renders a status fill on**. I picked the metric the palette passed and the surface it wasn't used
on. (I had argued explicitly against a luminance gate for fills; that argument was wrong.)

### A9 — `discipline.test.ts`'s guards are blind to the idiom the codebase itself uses
21 evasions demonstrated, 5 caught — the 5 being the baselines the guards were written for. Proven
by patching the **real** `Tile.tsx`: a `bgColor-` token used as text colour and an `fgColor-` used
as fill, both invisible, because the regexes require `color[` immediately after the property and
**6 of 13 components write it as a ternary**. `opacity: unavailable ? 0.45 : 1` — *the original
defect's own shape* — evades the guard written to catch it. Also `backgroundColor:`, computed keys,
template-literal hex. Scope gaps: non-recursive walk, `.ts` unscanned, stories exempt, and a canary
of `> 5` against 13 files.

### A10 — `apply` throws on ordinary malformed input, on the path whose comment promises it cannot
`catalog.ts:50-52` promises refusal is first-class *"because `01-F17` means it must never take the
till down"*. There is no validation. Missing `entries` → `TypeError`; NaN version → `SqliteError`;
a string version `"9"` is **accepted and stored**. Atomicity holds, so the damage is the throw.

### A11 — One corrupt row throws out of `list()` and empties the whole grid
`catalog.ts:115` parses JSON unguarded; one truncated row makes `list("item")` throw rather than
skip, propagating into both till surfaces via the POS gateway. `01-F54` is the opposite.

### A12 — Two different catalog updates at one version diverge silently
Two deltas targeting the same version, delivered in opposite orders, leave two devices with
different menus both reporting the same `version()`. **The sibling ledger path was explicitly
hardened against this class** (`DivergentDuplicateError`); the catalog repeats the mistake while
its comment claims the stronger guarantee.

### A13 — `pageCapacity` derives capacity from resolution, which `27-F11c` forbids
*"Extra pixels buy sharpness; only inches buy room."* Measured: one 15.6″ panel yields 91 tiles at
1366×768 and **180 at 1920×1080**. The function has no physical-size input — `tokens.json` carries
`mm` per posture and `index.ts` drops it. `layout.test.ts` then asserts capacity grows monotonically
**in pixels**, enshrining the inverse of the law; and its "reference figures" test uses 1280×800,
a resolution `27 §1a`'s hardware table does not list.

### A14 — A bad money value blanks the till, and the IPC seam admits one
`MoneyValue` throws `RangeError` on negative, non-integer, NaN and past-2^53; no `ErrorBoundary`
exists anywhere, so in React 19 the root unmounts. Latent — producers are guarded — except
`apps/pos-electron/src/shared/ipc.ts:52` declares `total_paisa: z.number().int()` **without the
`.nonnegative()` every domain schema carries.** The two planes disagree about whether money can be
negative. The prop is also `number`, with the brand laundered by an `as` cast.

### A15 — The founder-ratified product constant is not consumed
`AVAILABILITY_FALSE_WINS` exists with the comment *"Unconsumed until the availability fold lands"*.
The fold landed and hardcodes the direction instead. `26 §9` ratifies these as *"one named constant
with one place to overrule it"* — that place is now bypassed, and A3's branch overrules it in the
opposite direction.

### A16 — My "strictly stronger" claim about the merge pin was wrong
I edited an oracle test as the implementing session and justified it by saying the alternative
would assert something untrue. **The reviewer restored the old pin, applied the one-line
alternative, and got 367/367 green.** No executable assertion becomes false — only a variable name
and a doc comment. The replacement is also weaker than claimed: its disjointness assertion is
**unreachable**, its "names its owning module" check passes on `"folds/PURE-FICTION.ts"`, and the
partition boundary is unverified. Verdict taken: rewritten by an independent session, not reverted.

### A17 — A stale oracle experiment is registered as a real event type
`registry.ts:109` registers `loyalty.points_awarded`, labelled in-file **"ORACLE EXPERIMENT D —
TEMPORARY, TO BE REVERTED."** Never reverted, appears nowhere in `specs/`. A live Commandment 2
violation in a protected path. Removing it requires amending the pin, which is oracle-owned.

### A18 — The coverage gate is red, and CI never runs it
`vitest.config.ts` declares a **100% branch threshold** over `src/folds/**`. It exits 1 at
**98.97%**. CI runs `pnpm test`; turbo's `test` task has no `--coverage`. `availability.ts:72`'s
`?? true` arm is **unreachable dead code** — it cannot be covered. A declared gate nothing runs is
worse than no gate: it reads as a guarantee in every review.

### A19 — `docs-lint` C6 was blind to the largest event family in the system — **FIXED** (`0da1356`)
A footnote dagger (`line_removed†`) broke the catalog-line match, so **none of the sixteen `order.*`
types ever registered**; the checker then skipped any name whose family was absent, exempting
precisely the wholly-unabsorbed families it exists to catch. An invented `order.frobnicated` would
have passed. Four families (20 types) had accumulated invisibly. Parser repaired, escape hatch
removed, families absorbed, verified by injection. Recognised types 86 → 103.

### A20 — Smaller, confirmed
`27-F43`'s `<Surface>` component never shipped (only the naming half) · `TabRail` puts **4 px**
between adjacent 76 dp targets where `27-F8` requires ≥8, and nothing tests gaps at all ·
`Posture` exposes `"floor"` as a peer, so `<ItemGrid posture="floor">` renders 48 dp where 76 is
required and the capacity guard validates the violation · `27-F3` **mis-cited in two packages
independently** (it is the back/forward FR; positional memory is `27-F4`) and is implemented
nowhere · comment numbers 1.97→**1.89**, 2.17→**2.12** · `fgColor-status-abnormal` clears AA by
1.2e-4, a knife-edge stated as comfortable · `27-F44`'s `check-token` CI grep does not exist and
stories already violate `TOKENS.md` · the green token is used by **zero** components, so a third of
the colour budget has no in-situ verification · `order.table_assigned` lacks the self-reference
guard `availability.ts` has, so two folds give opposite answers to one malformed input while three
places claim they are identical · `01-F59` mis-cited for a default it does not state ·
`conformance/01.yml` has no rows for `01-F22`, `01-F57`–`01-F59`.

---

## B. Recorded, deliberately not fixed in this round

Kept out to stop a fix round becoming a design change (`24 §3b`).

| # | Finding |
|---|---|
| B1 | `lookup` returns tombstones indistinguishably — right for reprint, wrong for search/barcode callers |
| B2 | Half of `01-F56` unbuilt: a refused delta is dropped with nothing surfaced to device health (`15`) |
| B3 | `apply` returns `applied: true` for a change a host transaction later rolls back |
| B4 | Catalog version `0` is unreachable — the seed value is also the rejection floor; version domain unspecified |
| B5 | `sort` stored twice (column + blob) and can disagree; `list(kind, undefined)` returns the whole menu |
| B6 | **`01-F52` holds by convention only** — no lint or import boundary stops a fold importing the catalog, though AGENTS.md claims every commandment is machine-enforced |
| B7 | Branded quantity constructors forbid negative stock, which `10-F5` explicitly permits from offline oversell |
| B8 | `DEC-MONEY-004` ratified full tips and names `tip.pooled` / `tip.paid_out`; no module doc has absorbed them |
| B9 | `ConnectionFacts`/`StatusStrip` render no last-synced age, though `00 §5.7` requires it and they are the declared honesty surface |
| B10 | `AppShell` claims depth-one is "enforced by what this component cannot express"; `children: ReactNode` can hold any navigation. Not offered ≠ enforced |
| B11 | No human-facing order reference exists; the shell truncates a UUID |

---

## C. The open structural question

`26 §3` specifies a **projection-key sidecar** returning every key an event affects — `order:O1`,
**`item:I4`** — i.e. one engine with generalised keys. `merge.ts:580-583` records that key
derivation is *"deliberately hardcoded to the ORDER key… generalising to a key sidecar is the
scheduled follow-up task."* `availability.changed` is the first `item:`-keyed event — the trigger
for that scheduled work.

I built a standalone fold instead and argued disjointness. The reviewer judges that argument sound
on its own terms but answering the wrong question, and notes the standalone fold **opts out of four
guarantees the engine provides**: persistence, the Auditor's independent refold (`01-F7`/`20 §4.2`),
work-counter honesty, and the adapter. It also notes my central defence cites `26 §8` for a
sentence that does not appear in it — *"reimplement"* greps to nothing in `specs/`; the rule traces
to the T-01-11 ruling, not spec text.

**Open for a founder call: fix the standalone fold, or do the `26 §3` sidecar first and let
availability become an ordinary engine fold with those four guarantees for free.** The fix-round
tests are being written as behavioural contracts so they hold either way.

---

## D. What this round says about the process

**The rule paid for itself on its first honest application.** Four patterns, all of which will
recur:

1. **The comment was the defect.** A5, A10, A12, A2 and A14 all have code narrower than its own
   comment. A reviewer who reads the comment and agrees finds nothing; one who *executes* it finds
   all five.

2. **The guard passed by not looking.** A6 (name-matched lint), A9 (regex blind to the dominant
   idiom), A18 (unrun gate), A19 (parser that dropped a family), and the pin's dead assertion are
   one failure in five places: a check reporting success because it never examined the thing.
   Worse than no check — it converts absence of evidence into evidence of absence.

3. **The test was written to pass.** A7 is the clearest: the spec's headline number applied to the
   pair that clears it, a self-chosen weaker number for the pair it was measured on. A8 is the same
   move in a different currency — the metric the palette passed, against the surface it was not
   used on. Both are mine, and neither is visible from inside the session that wrote them.

4. **Correct in isolation, unconnected in fact.** A1 is the purest case: fifteen passing tests
   including bijective id-relabel invariance, wired to nothing.

**A note on what the reviews got right about themselves.** The availability reviewer's initial
suspicion was that the relabel test passed trivially; it mutation-tested the suite against eight
deliberate mutants, found all eight killed, and reported that its own suspicion was wrong. The UI
reviewer validated its colour implementation against a published reference set before using it to
judge anything. That is the standard the next round should be held to.
