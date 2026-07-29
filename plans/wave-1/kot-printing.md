# KOT printing — plan

**Planning artefact, July 2026.** Owning spec: `specs/03-kitchen-fulfillment.md`
(`03-F1`..`03-F10`, `03-F30`..`03-F45`, `03-F48`). Also binding: `specs/27-design-language.md
§2b` (`27-F55`..`27-F59`), `18 §10` (the printing stack), `00 §5.6` (English-only UI, Unicode
user content), `01-F1` (paper is never the record).

**Status: APPROVED July 2026, and §2's blocker is RESOLVED.** Founder ruled the module ("KOT
printing next"), the verification posture ("no printer yet — golden fixtures, physical pass
owed"), the paper floor (**`03-F49`: a type declares `min_columns`; the KOT declares 42 and is
refused below it**), and that **station filtering (`03-F18`) is pulled into Wave 1** from Wave 4.

**The station ruling has a dependency this plan did not anticipate — see §7.**

`packages/escpos` is a **protected path** (`20 §4.4`), so the `24 §3` step-2 split binds for
every task that touches it: acceptance tests authored by a different session, committed red.

---

## 1. Where we actually are

```
packages/escpos/src/index.ts     2 lines   // "Scaffold stub — implementation arrives via plans/"
packages/testing/                sim.ts, sim-cloud.ts — no virtual printer
apps/pos-electron                confirm appends order.confirmed and prints nothing
```

Nothing exists. `18 §10` specifies the whole stack — encoder, transports, spooler, virtual
printer — and none of it is built. `03-F30`..`03-F45` specify the document model in unusual
depth (the device-mechanics FRs are the most implementation-ready prose in the corpus), so this
is a large build against an unusually complete spec.

**What makes it tractable without hardware:** `03-F30` defines render as a **pure function** —
`render(Spec@v, Profile, Data, PrinterCaps, FiscalBlock?) → blocks → bytes` — and makes purity a
*testable law*: identical inputs must produce byte-identical output on Electron and React
Native. Everything up to the bytes is verifiable on a laptop. Only what happens *after* the
bytes needs a printer.

## 2. The blocker — two floors that contradicted — RESOLVED (`03-F49`)

| FR | Says |
|---|---|
| `03-F36` | *"Every DocumentSpec must render correctly at **`columns = 32`** (the 58 mm floor) — a **build-time test**, not a review convention."* |
| `03 §7` layer 3 | An unknown printer model defaults **conservatively to 32** columns. |
| `03-F1` | ESC/POS output, **58 mm and 80 mm**. |
| `27-F57` | *"This single constraint is the reason **`03-F30`'s 80 mm floor is mandatory**: at 32 columns, after the flag, quantity and code there are ~10 characters left, and the pairing breaks."* |

Three distinct problems, and they compound:

**(a) `03-F30` has no 80 mm floor.** `27-F57` attributes one to it. The FR is about the
Spec/Profile split and says nothing about paper width — grep it. So the citation resolves to a
real FR that does not contain the claim, which is a subtler version of the `sec-F1` /`15 §42`
class already found twice in this repo: an ID that resolves is not the same as a claim that
resolves.

**(b) The floors are opposites, and one is a build-time gate.** `03-F36` makes 32-column
rendering a *test that must pass*. `27-F57` says 32 columns structurally breaks the
quantity-adjacent-to-name pairing — which is not a nicety: it is the constraint `27 §2b`
identifies as the single highest-value one on the ticket, on the finding that readers who
*decode* a line at ~71% *execute* it correctly at ~35%. **A build-time test currently demands
the layout that the comprehension law forbids.**

**(c) The default configuration is the forbidden one.** An unknown model defaults to 32
columns, so a printer nobody has profiled produces the layout `27-F57` says fails. The
conservative default is conservative about *truncation* and reckless about *comprehension*.

**Why this cannot be resolved by judgement here.** `27-F57`'s own arithmetic does not obviously
support its conclusion: at 32 columns a two-digit quantity at `27-F56`'s 2× width costs 4
columns, plus a separator, leaving ~27 for the name — not ~10. The "~10 characters" figure
carries no derivation in the doc. But the *conclusion* (80 mm for kitchen tickets) may well be
right for reasons the figure states badly, and `27 §2b` opens by admitting it is "a reasoned
construction, not an evidence-backed one" and is "the part of doc 27 most likely to be wrong".
So this needs a founder ruling on the FR, not a plan-level guess. **Options are laid out in §6.**

**What is NOT blocked by this:** the encoder, the transport interface, the capability record, the
virtual printer, the spooler and the receipt path. Only the KOT's own block layout is blocked,
and it is the last thing built.

## 3. The design

### 3.1 Three layers, and only the middle one is new

```
DocumentSpec (code, versioned, CODEOWNERS)   ─┐
DocumentProfile (org config, slot_id→value)   ├─▶ render() ─▶ blocks ─▶ encode ─▶ bytes
Data + PrinterCaps + FiscalBlock?            ─┘                                    │
                                                                            Transport
                                                                     (TCP 9100 / USB / BT)
```

`03-F30`'s split is the whole design, and its value is stated as testability: **the slot space
is property-testable in full**, so the entire customisation surface can be generated and
asserted over. That is unusual and worth building for directly — the profile type is a closed
map of declared slots, so a property test can enumerate it.

`03-F32`'s invariant is **structural, not a runtime check**: a `kot` renders no money token
because the profile schema *has no slot id addressing one*, and the KOT data contract carries no
money field. This is the same technique `shared/ipc.ts` uses for the two-plane law — enforcement
by what the type cannot express — and it is why `MenuItemSchema` carrying no price was right
even though the catalog needed one.

### 3.2 Columns, never millimetres, never dots

`03 §7` withdrew "paper width as a `58 | 80` enum" and replaced it with a per-model capability
record. Layout is `columns`, derived `print_dots ÷ font_cell_dots`. `03-F36` bans absolute dot
positioning outright (`x=384` is mid-line at 576 dots and off-paper at 384) and bans
space-as-layout (it makes a document permanently unreflowable).

Millimetres appear in exactly one place: the fiscal QR, because a regulator specifies mm
(`03-F35`).

### 3.3 The three device-mechanics FRs are the ones that would otherwise ship broken

These are specified with unusual precision and each describes a defect that passes every test on
a desk:

- **`03-F40` — paper-out uses `DLE EOT 4`, never `GS r`.** On the whole TM-T88 family the
  paper-end sensor takes the printer *offline*, and it then does not execute `GS r` at all, so a
  health check built on `GS r` reports "paper present" **forever**. The two commands also use
  **incompatible bit layouts for the same sensor**, so the encoder must never decode one with
  the other's map. Near-end is not universal — model-gate it from the capability record.
- **`03-F41` — a stall is not a failure.** On paper-end the printer *holds* the job. So
  `transmitting, printer stalled` is a distinct state from `failed`, **a stall never counts
  toward the 3-attempt budget and never re-transmits**. A timeout that flips a stall to `failed`
  double-prints the moment the roll is loaded, and a duplicate KOT is a real kitchen error.
- **`03-F42` — render whole, buffer, transmit as one unit.** With cut reservation, data
  interrupted for ≥2 s makes the printer feed to the reserved cut position and cut — so a
  streaming renderer that stalls mid-ticket **gets its ticket cut in half**. No I/O wait may be
  interleaved inside a document.

**All three are testable without a printer** — they are assertions about which bytes are emitted
and which state machine runs — and **none is *verified* without one.** That distinction goes in
the plan's evidence, not in its claims (§5).

### 3.4 The virtual printer is the oracle

`18 §10` puts it in `packages/testing`: implements `Transport`, renders output to PNG for
snapshot tests, and CI runs KOT/receipt snapshots for every layout change.

This is what makes a no-hardware build honest rather than hopeful: a golden **byte** fixture pins
the encoder, and a **rendered image** pins the layout — and the second catches what the first
cannot, because byte-identical output can still be an unreadable ticket. `27 §2b`'s four channels
(ink density, character size, vertical position, rasterised glyphs) are all visible in a PNG and
none is visible in a hex dump.

### 3.5 What connects it to the counter

`C9` currently appends `order.confirmed` and prints nothing, which was deliberate. The print job
hangs off that append: `order.confirmed` → spooler → KOT. `03-F5`'s failure alarm raises on the
**host device — the counter, not the kitchen** — because in a printer-only kitchen nobody there
has a screen, and the cashier is who can act. `screen-map §4` calls this the one deliberate
exception to "screens observe the ledger, they do not message each other": the signal goes where
the **responder** is, never where the fault is.

## 4. What has to be built

| # | Task | Paths | Test author |
|---|---|---|---|
| **K-0** | Resolve §2 (spec PR to `03`/`27`) | `specs/` | — (docs-lint) |
| **K-1** | Capability record + column derivation; the shipped model table, conservative default, `03-F36`'s no-dot-positioning ban | `escpos` ⚠ | **separate session** |
| **K-2** | Encoder: text, ink ladder (`27-F56`), sizes, cut, raster path for `03-F8` glyphs | `escpos` ⚠ | **separate session** |
| **K-3** | `Transport` interface + virtual printer rendering to PNG | `escpos` ⚠, `testing` | **separate session** |
| **K-4** | `DocumentSpec`/`DocumentProfile` types + `render()` as a pure function; the property test over the full slot space | `escpos` ⚠ | **separate session** |
| **K-5** | The KOT spec itself (`27-F55`..`27-F59` layout) — **blocked on K-0** | `escpos` ⚠ | **separate session** |
| **K-6** | Spooler: queue/attempt/retry, `03-F41`'s stall-vs-fail, `03-F42`'s whole-document rule | `escpos` ⚠, `pos-electron` | **separate session** |
| **K-7** | Wire `order.confirmed` → spooler; `03-F5` failure raises an S1 on the counter | `pos-electron` | same session |
| **K-8** | **Physical verification on real hardware — OWED, not done** | — | — |

⚠ = protected path. Note how much of this is protected: `packages/escpos` carries nearly the
whole module, so the separate-session test split governs this plan far more than it did the
pricing one.

## 5. What must be true when this is done

1. `render(spec, profile, data, caps)` is **pure**: identical inputs → byte-identical output,
   asserted across two runtimes (`03-F30`'s stated law, and the one a shipped competitor fails).
2. **A `kot` emits no money token under any profile** — asserted by enumerating the entire slot
   space, not by one example. `03-F32` makes this structural, so the test that matters is that
   the profile type *cannot express* a price slot.
3. Every shipped `DocumentSpec` renders at its declared minimum columns, degrading in
   `03-F36`'s declared order, with **no absolute dot positioning and no space-as-layout**
   anywhere in the output.
4. **`DLE EOT 4` decodes with its own bit map** (bits 2,3 near-end / 5,6 out) and `GS r` with
   its own (0,1 / 2,3) — asserted as a pair, because the defect is decoding one with the other's
   map and each map is correct in isolation.
5. **A stalled printer never retries and never counts against the attempt budget** — the test
   drives a stall, then a recovery, and asserts **exactly one** document was transmitted. This is
   the duplicate-KOT defect and it is invisible until a roll is replaced.
6. A document is transmitted as one unit with **no interleaved I/O wait**; a ≥2 s mid-document
   gap is impossible by construction rather than by timing luck.
7. The fiscal QR is **rasterised, never the native command**, and its computed physical size
   meets the adapter's declared minimum for the target dpi (`03-F35`).
8. A print failure raises an **S1 on the counter**, not in the kitchen (`03-F5`, `27-F11g`), and
   `03-F34`'s refusal is hard — no silent degradation.
9. PNG snapshots pin the KOT's four `27 §2b` channels; a layout change that keeps bytes valid but
   destroys the quantity/name pairing **fails a snapshot**, which is the failure a byte fixture
   cannot catch.
10. **Not claimed:** that any of this works on a physical printer. K-8 is owed, and every device
    -mechanics assertion above is a claim about emitted bytes and state transitions only.

## 6. Questions this plan cannot answer

**Q1 (BLOCKING K-5) — which floor governs the KOT?** Three ways out, and they are genuinely
different products:

- **(i) The KOT declares a higher minimum than 32 and refuses below it.** `03-F31` already says
  structural differences live in the *type*, not in config, and `03-F34` already defines the
  refusal path (hard refusal + S1, never silent degradation). So a `kot` type declaring
  `min_columns: 42` is consistent with both FRs, and `03-F36`'s 32-column gate keeps binding for
  `receipt`/`bill`, which genuinely can degrade a price column. Cost: a 58 mm printer cannot
  print kitchen tickets, and someone owns telling a customer that.
- **(ii) `27-F57` relaxes for narrow paper** — quantity stays adjacent but the name wraps to a
  second indented row at 32 columns. Keeps every printer working; spends the pairing law exactly
  where comprehension is already hardest.
- **(iii) The "~10 characters" figure is simply wrong and 32 columns is fine.** My arithmetic
  says ~27 characters remain for the name, not ~10. If that is right, `27-F57`'s conclusion
  should be corrected rather than implemented, and `03-F36` stands unamended.

**RULED: (i).** `03-F49` now declares `min_columns` per type — `kot` 42, `receipt`/`bill` 32 —
and a printer below it triggers `03-F34`'s existing hard refusal + S1 rather than a squeeze.
`03-F36`'s gate is rescoped to each type's declared minimum, and `27-F57`'s citation is
corrected: `03-F30` has no 80 mm floor, and the "~10 characters" figure had no derivation (~27
remain by `27-F56`'s own sizing). The conclusion stood; the arithmetic never supported it. The
purchasing consequence — a 58 mm printer cannot print kitchen tickets — is stated in the FR so
doc 14 surfaces it at printer assignment, not at 20:40 on a Friday.

**Q2 (not blocking, but decide before K-2) — does whole-document rasterisation fit `03-N1`?**
`18 §10` names this explicitly as *"open, and not to be specified before it is measured (`00 §4`
rig)"*: whether rasterising a whole document fits the 2 s confirm→first-byte budget. It also
names the tempting wrong answer — per-**field** rasterisation, which breaks the `name | price`
column grid, the one row whose alignment carries meaning. Wave 1's KOT is English-only
(`00 §5.6`), so this can be deferred until user content (customer names, addresses) reaches
paper — but it decides the encoder's shape, so deferring it is a decision to revisit K-2.

**Q3 — station filtering — RULED IN.** `03-F18` is pulled from Wave 4 into Wave 1. What that
costs is not what it looks like: see §7.

## 7. What the station ruling actually costs

`03-F18` reads: *"a station map (station → categories/items, **layer-2 config**, mirroring or
refining printer routing)"*, and `§7` puts "category→printer routing, station map" in layer 2.
So station filtering is not a filter — **it is org configuration that has to reach a device**,
and this repo has no way to do that.

Three facts, each verified:

- **`packages/config` is not the config plane.** It is `defineEnv` — process-environment parsing
  so services crash at boot on bad values (`18 §5`). There is no org-config model, no store, no
  distribution path. One function, one consumer.
- **`config.changed` cannot be emitted.** It is named in `01 §4`'s event catalog and has **no
  payload schema in `packages/domain`'s registry**, so `01-F4` makes emitting it a runtime error.
  This is exactly the gap `catalog.changed` had until `6cb7a34` closed it.
- **Pricing already needs this too.** `01-F60` requires a price for every *enabled* (branch,
  channel) pair, and "channels enabled" is `00 §7` layer-2 config. §3.3 of the pricing plan
  passes those sets in from the caller precisely because there is nowhere to read them from.

**So the layer-2 config plane is a shared dependency of two Wave-1 modules, and it is unbuilt.**
That is a bigger finding than either module, and it should be planned as its own piece of work
rather than smuggled into whichever one hits it first.

**One cheaper alternative deserves stating**, because it may be right: put `station` **on the
catalog entry**, beside `kitchen_name` and the per-channel visibility flags that already live
there (`14-F5`). Item→station is the inverse of `03-F18`'s station→items map and carries the same
information. It would ride the catalog transport — built, tested, versioned, already delivering —
and could land inside T-3's wire change rather than waiting for a config plane. The cost is that
it contradicts `03-F18`'s "layer-2 config" wording, and that a station map refining *categories*
(rather than items) is more natural as config than as a per-item field.

**This needs a ruling before K-5, and it is the same question `01-F60`'s enabled-channels set
raises.** Answering it once answers both.
