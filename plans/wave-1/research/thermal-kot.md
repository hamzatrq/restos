# Wave 1 research — thermal mechanics + KOT design (condensed to decisions)

The agent **retracted its own headline cost claim** on better data, then found three
implementation landmines. Self-correction first, because it changes an argument I might
otherwise have repeated.

## Retracted: the 58 mm cost penalty is ~1.35×, not 3.4×
The original figure compared a flat "Rs 100/roll" against very different roll lengths —
an invalid comparison. Live Pakistani pricing: **80 mm ≈ Rs 0.40/ticket, 58 mm ≈ Rs 0.54**.
At 12,000 kitchen tickets/month that is Rs 4,750 vs Rs 6,500 — a difference of ~Rs 1,750,
not Rs 5,600. Roll-length maths also assumed 100% packing; the real factor is **0.80**.

**80 mm stays mandatory, but on the LAYOUT argument alone, which was always the strong
one:** at 32 columns, after `[flag][qty][code]` only **10 characters remain**, which
divorces the quantity from the item it counts. Plus a new hardware fact — **the Black
Copper BC-58U, the 58 mm baseline named in `03-F10`, has no auto-cutter at all.** Manual
tear bar: a human action per ticket and a mis-tear vector, on a printer the spec currently
names as a compatibility target.

## ⭐⭐ Three landmines for `packages/escpos` and `03-F4`

**N1 — `GS r` does NOT detect paper-out on the printers we will actually deploy.**
Epson, verbatim: on TM-T88IV/V/VI/VII, T82II, T70II, T90, L90 the paper-end sensor takes
the printer **offline, and it then does not execute `GS r`** — bits 2 and 3 never report
paper-end. Only the real-time `DLE EOT 4` answers while offline. **A health check built on
`GS r` reports "paper present" forever.** Worse, the two commands use **incompatible bit
layouts for the same sensor** (`DLE EOT 4` bits 2,3 / 5,6; `GS r 1` bits 0,1 / 2,3), so
mixing them silently misreads state.

**N2 — paper-out is a STALL at the printer, not a loss — and our spooler would
double-print.** `ESC c 4`: the printer *"stops after the current printing completes"*,
goes offline, and **holds the job** until the roll is replaced; on most models the
paper-end sensor cannot even be disabled. So `03-F4`'s state machine must distinguish
**"transmitting, printer stalled"** from **"failed"**. A timeout that flips to `failed`
and retries will **double-print the instant the roll is replaced** — a duplicate KOT,
which is a real kitchen error, not a cosmetic one.

**N3 — cut reservation has a hard 2-second data-silence timeout.** *"If data is
interrupted for two seconds or more, the printer automatically feeds to the reserved cut
position and cuts."* **A chunked or streaming ticket renderer that stalls mid-ticket gets
its ticket cut in half.** Render the whole document into one buffer and transmit as a
unit; never interleave I/O waits inside a ticket.

## The kitchen is out of spec for a thermal printer — and the fix is siting, not hardware
Four temperatures that get conflated, and quoting the wrong one would be a real error:

| °C | what happens |
|---|---|
| **40** | paper degradation begins with prolonged exposure (Koehler) |
| **45** | **every printer's operating envelope ends** (Epson, Star, Rongta all 5–45) |
| **60** | **paper self-blackens — colour forms spontaneously** (Jujo, manufacturer-stated) |
| 100 | sensitiser melt (the figure secondary sources quote — wrong for a kitchen spec) |

**Star Micronics explicitly tells you not to put a thermal printer in a hot kitchen**, and
recommends an impact printer there. **We must not take that advice:** impact destroys
every design lever at once — no raster path (so no Urdu, no icons), no reliable solid-fill
inversion, 180 dpi, and **14× slower** (a 10-line KOT at 2,130 ms vs ~150 ms).
**Resolution: site the thermal printer at the pass or on a wall away from the steam line —
which the 5–45 °C envelope already requires anyway.** A station genuinely too hot for a
printer gets a screen or a runner, not an impact printer.

## Paper is not a record
Alcohol, cooking oil, esters/ketones, **human sweat**, PVC/plasticiser contact and
self-adhesive tape each destroy a thermal image; **a fingernail develops it** (frictional
heat). Heat plus humidity together is *"many times"* worse than either alone. Hand
sanitiser, ghee and a document sleeve are each individually sufficient.
**→ The ledger is the record. Never the paper.** Unprinted roll shelf life is 2 years
(<25 °C, dark); printed image life for Pakistani 48 GSM should be planned at **5 years**.

## Procurement facts for doc 14
- **You cannot buy by the international "80×80" convention in Pakistan — that SKU does not
  exist.** Specify **metres + GSM**. The market is ~exclusively **48 GSM** (≈52 µm; the
  published relation is µm ≈ GSM × 1.09).
- **Short rolls are a real risk, and a vernier caliper is a sufficient goods-inwards
  test.** With `L = π(D²−d²)/4t` at 0.80 packing, a genuine 48 GSM roll on a 12 mm core
  measures ~59 mm OD at 40 m, ~65 at 50 m, ~74 at 65 m. Evidence is circumstantial but
  strong: a live listing sells *"80mm × 40 **Yards**"* (36.6 m — an 8.5% shortfall hidden
  in the unit), and the same nominal SKU ranges **2.6× in price** on one marketplace in
  one day.
- **Prices rose ~2.5× in five years** (~20%/yr). **Every PKR figure in the spec needs a
  review date attached.**
- **"300 dpi" in a Pakistani listing is almost always 300 mm/s.** No 300 dpi receipt
  printer exists in this market — which matters because the Sindh QR-size problem wanted
  one.

## BPA
Transfer to skin is **~10× higher onto wet or greasy fingers**. The EU restriction
(0.02% w/w, in force Jan 2020) was justified on **cashier** dermal exposure, which
**understates a kitchen line** where hands are wet or greasy by definition. **No Pakistani
BPA/BPS regulation was found** and marketplace "BPA Free" claims have no certification
regime behind them → if this matters it must be a **purchasing requirement with supplier
documentation**, because no regulator is enforcing it locally.

## Still open — and the most important one is unchanged
**There is ZERO research on low-literacy parsing of printed operational tickets.** Not
academic, not industrial, not a standard. So any KOT ink/emphasis ladder we design is a
**reasoned construction that must clear `27-F35`'s ≥85% post-training comprehension gate
on real staff** — it cannot be justified from literature, because none exists.

Also newly open: low-battery → faded print is physically plausible but **not
manufacturer-stated** (bench it, do not cite) · head-to-cutter distance is an unpublished
per-model constant (rig-calibrate) · no density→head-life curve exists publicly ·
**Nastaliq legibility at 203 dpi has no source anywhere** — the estimate that Urdu needs a
48-dot cell (+60% paper per line) is derived from CJK by analogy and is the weakest
inference in the whole report. **Print a test sheet on 48 GSM and have an Urdu reader
judge it; do not validate on screen.**
