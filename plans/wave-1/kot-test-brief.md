# K-1 … K-4 — acceptance test authorship brief (`packages/escpos`)

**For the test-authoring sessions only.** `24 §3` step 2: written by a **different session from
the implementer**, from **spec text only**, committed **red** before implementation begins.

`packages/escpos` is a protected path (`20 §4.4`) and carries nearly this whole module, so this
brief governs more of the KOT build than the pricing brief governed of that one.

## Read these, and nothing else

- `specs/03-kitchen-fulfillment.md` — `03-F1`, `03-F8`, `03-F30`..`03-F45`, **`03-F49`**,
  **`03-F50`**, and `§7`'s layer-3 paragraph (the capability record and the columns derivation).
- `specs/27-design-language.md §2b` — `27-F55`..`27-F59`, the four paper channels and the ink
  ladder.
- `specs/18-engineering-handbook.md §10` — the printing stack: encoder, transports, spooler,
  virtual printer.
- `specs/00-platform-overview.md §5.6` (English-only UI, Unicode user content) and `§6` (money).

## ⚠ Do NOT read

- **`plans/wave-1/kot-printing.md`.** It is the implementation design — the task split, the
  layer diagram, the render pipeline's shape. A test author who reads it writes same-mind tests
  wearing the costume of independent ones, which is worse than not splitting at all, because the
  evidentiary basis (independently authored tests catch 25% of faults vs 14%) evaporates while
  the process still reports as followed.
- Any implementation of these FRs. None exists — `packages/escpos/src/index.ts` is a 2-line
  stub. If you find one, stop and report it.

**The FRs are sufficient. If they are not, that is a defect in the FRs and you should say so
rather than go looking.**

## The four tasks

Take **one per session**. Each is independent enough to test alone.

| Task | FRs | What it is |
|---|---|---|
| **K-1** | `03 §7` layer 3, `03-F36`, `03-F49` | Capability record `{model_id, dots, dpi, cols_font_a, cols_font_b, has_native_qr, has_cutter, raster_ok}`; columns derived as `print_dots ÷ font_cell_dots` (Font A = 12, Font B = 9); conservative default of 32 for an unknown model; per-type `min_columns` and the refusal below it |
| **K-2** | `03-F8`, `03-F35`, `27-F56` | Encoder: text, the three-level ink ladder, character sizes, cut, raster path |
| **K-3** | `18 §10` | `Transport` interface + the virtual printer in `packages/testing` rendering to PNG |
| **K-4** | `03-F30`, `03-F31`, `03-F32`, `03-F34` | `DocumentSpec`/`DocumentProfile` types and `render()` as a pure function |

**K-5 (the KOT's own layout) is not in this brief** and is authored after K-1..K-4 land.

## What these FRs make unusually testable — use it

`03-F30` states two properties that are stronger than ordinary unit assertions, and tests that do
not exploit them are leaving the spec's own guarantees on the table:

- **Purity is a law with a named counter-example.** Identical `(spec, profile, data, caps)` must
  produce **byte-identical** output, and the FR notes a shipped competitor emits different
  tickets for the same order on two of its own devices. Test it as an equality over repeated
  render, not as a snapshot.
- **The slot space is property-testable IN FULL.** A `DocumentProfile` is a flat
  `slot_id → value` map of declared slots, so the entire customisation surface can be enumerated
  and asserted over. `03-F32`'s "a `kot` renders no money token under any profile" is therefore
  provable rather than sampled — and note that the FR wants it enforced **structurally** (the
  profile schema has no slot id addressing money), so the strongest test is that the type
  **cannot express** the thing, not that one example fails.

## Specific traps these FRs name — each is a test

These are unusual: the spec has already done the failure analysis, so a test that ignores it is
ignoring known-broken behaviour rather than speculating.

- **`03-F40`** — `DLE EOT 4` and `GS r` use **incompatible bit layouts for the same sensor**
  (`DLE EOT 4`: bits 2,3 near-end / 5,6 out; `GS r 1`: bits 0,1 / 2,3). Each map is correct in
  isolation, so assert them **as a pair** — the defect is decoding one with the other's map, and
  neither test alone catches it. Also: a health check built on `GS r` reports "paper present"
  **forever**, because paper-end takes the printer offline and it then does not execute `GS r`
  at all. Near-end is **not universal** — model-gate it from the capability record.
- **`03-F41`** — a stall is the printer **holding** the job. `stalled` is a distinct state from
  `failed`; a stall must **never** count toward the 3-attempt budget and **never** re-transmit.
  The test that matters drives a stall, then a recovery, and asserts **exactly one** document was
  transmitted — because the defect (a duplicate KOT) only appears when the roll is replaced.
- **`03-F42`** — with cut reservation, a ≥2 s gap mid-document makes the printer feed to the
  reserved cut position and **cut the ticket in half**. So no I/O wait may be interleaved inside
  a document. Prefer a test that makes this impossible by construction over one that measures
  timing.
- **`03-F35`** — the fiscal QR is **always rasterised, never the native command**, because cheap
  printers report no QR capability and **fail silently**. Assert the native command is never
  emitted, and that the computed physical size meets the declared minimum for the target dpi.
- **`03-F34`** — failure is a **hard refusal to print plus an S1**, never silent degradation. And
  the FR names its own regression: *"the shipped default always validates and always saves"* is a
  named test, because a competitor's linter left merchants unable to save the vendor's own
  default template.
- **`03-F36`** — **absolute dot positioning and space-as-layout are banned.** An `x=384` offset
  is mid-line at 576 dots and off-paper at 384. These are assertions about emitted bytes.

## The bar

Read `plans/wave-1/oracle-round-2-findings.md §C` before starting. Three of the four patterns it
names are test-authorship failures, and every one recurred *inside the work that was fixing them*:
assertions that reduced to `expect(0 < 3).toBe(true)`; an assertion wrapped in an `if` so a
regression ran zero expectations; rows added to satisfy a gate for compositions that do not
exist; a file header claiming seven clauses where the one hiding the real defect had none.

For this module specifically:

- **A negative test must be able to fail.** Assert what an error *names*, not that something
  threw.
- **Byte assertions need a reason.** A golden fixture that pins bytes nobody derived is a
  tautology with extra steps — say which FR each byte sequence comes from.
- **No hardware exists.** Every assertion here is about emitted bytes and state transitions.
  Say so; do not write a test whose name implies it verified a printer.

## When you are done

Commit **red**, with the failing run captured in the message. Name anything the FRs left
genuinely ambiguous — filling a gap with a plausible assumption is how a test ends up written to
pass.
