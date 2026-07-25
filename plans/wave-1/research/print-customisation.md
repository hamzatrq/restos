# Wave 1 research — printed-document customisation (condensed to decisions)

Four parallel strands, primary sources only (search engines were blocked, forcing direct
retrieval of SROs, vendor manuals, and raw library source — the result is better evidence
than a search pass would have produced).

## ⚠ THE BIGGEST FINDING: the pre-payment BILL may be illegal in Sindh

`grep -rn "bill_requested|proforma|pre-check" specs/` returns **one hit**, a storefront
status label. **There is no printed bill-before-payment document type anywhere in the
corpus** — and in Pakistani dine-in, handing a bill before payment is the normal flow.

**Sindh rule 6(3):** an integrated person *"shall issue only the invoice specified in
sub-rule (1)… and **shall not issue any katcha or provisional invoice, by whatever name
called, to the customer.**"*

Plain reading: a pre-payment bill handed to a customer by an SRB-integrated restaurant is
prohibited, which would mean **the standard dine-in flow must change under Sindh
integration.** Needs legal verification, belongs in `DECISIONS.md` as a founder row.
The researcher called it *"the most consequential single finding for the product in this
report."*

## ⚠ AND THE FOUNDER MUST BE TOLD THIS PLAINLY (researcher's words)

The ask — *"paper size, what's on it, custom text, FBR details, and many more such
things"* — is a request for **extensibility**. `00 §7` prohibits it: *"modules must not
introduce free-form configuration."* The recommended resolution makes extensibility
**ours** (each new capability is a slot we add) rather than **theirs** (a template they
write). **That is a real reduction in what was asked for**, and the reason is F23 below:
in Pakistan the failure mode of a customisation bug is a sealed restaurant, and there is
no certified device to catch it.

## Why the stakes are this high
- **Pakistan gives you no trusted rendering path — YOU are the trusted renderer.** Rule
  150ZEB: the SDC formats and signs, then *"POS prints the fiscal invoice with the fiscal
  invoice number and QR Code"*. The SDC may be **software attached to the POS**. There is
  no sealed printer and no certified rendering module between our renderer and the paper.
- **Three unverified invoices in one day → premises sealed** (rule 150ZEO(4)); five in
  seven days likewise. Evidence includes customer reports via the Tax Asaan app and
  **mystery shopping**. Sales Tax Act s.33 serial 24: PKR 500,000 or 200% of tax, up to
  two years' imprisonment, for an invoice lacking or defacing the QR.
- **Therefore: a rendering bug in a customer's template is legally indistinguishable from
  tax evasion.** Customisation that can drop the QR is not a UX risk; it is a
  business-ending risk for the customer and a liability for us.

## Architecture: slots, not templates

**Layer V — `DocumentSpec`** (vendor-authored, versioned, shipped as code under
CODEOWNERS): an ordered list of typed blocks, one per document type. Owners never see it.
**Layer O — `DocumentProfile`** (org config, Zod-schemad, `config.changed`-audited): a
flat `slot_id → value` map that **cannot express position, order, font or structure.**

`render(Spec@v, Profile, Data, PrinterCaps, FiscalBlock?) → Blocks → bytes`

Three reasons slots beat a template DSL, in order of weight:
1. **The whole customisation space becomes property-testable** — you can fast-check the
   entire profile space and assert invariants. With a DSL you can only test profiles you
   have seen. Nobody in the industry can do this (F44: no published work on golden/snapshot
   testing of customer-defined receipts).
2. **It shrinks migration by an order of magnitude.** An owner can lose a *slot*; never a
   *layout*.
3. **It is what `00 §7` already says** — a slot value inside a vendor layout is a preset
   with a hole.

**Nobody ships a WYSIWYG thermal editor.** Four archetypes exist across the entire market:
checkbox+free-text (Square, Toast, Loyverse, Foodics), fixed-block visual editor (Shopify),
token markup (SambaPOS), code (r_keeper, Shopify Pro Liquid, Odoo QWeb). Even Shopify's
"visual editor" only reorders *predefined blocks* — there is no canvas anywhere.

## The precedent to copy exactly
**Shopify, verbatim:** *"the gift receipt template won't display price-related
information… **regardless of whether the setting is active in the editor**."* A
document-type invariant that overrides merchant configuration. That is precisely the shape
for "no prices on a KOT" and "the FBR block cannot be deleted".

Two more Shopify rules worth taking wholesale: colours are **converted to greyscale at
render** (thermal reality enforced by the renderer, not left to the author), and visual vs
code editors are **mutually exclusive modes** so there is never an ambiguous merge.

## Locked regions, enforced at RENDER not at save
```
HEAD_LOCKED → HEAD_OWNER → BODY → TOTALS → FISCAL_LOCKED → FOOT_OWNER → TAIL_LOCKED
```
- `FISCAL_LOCKED` blocks are **not in the DocumentSpec at all** — injected at render by the
  certified authority adapter, which declares the block **and its position** (SRO 1006
  appends a sample fixing block order; SRB Annex-I likewise).
- `DocumentProfile` is **schema-incapable** of addressing locked regions — not "validated
  against", *incapable*. There is no slot id.
- **Enforce at render, validate at save only for feedback.** Shopify shipped the
  counter-example: a linter error left merchants unable to save **Shopify's own default
  template**, and resetting to default also failed. Make "the shipped default always
  validates and always saves" a named test.
- Merchant content is legal only **outside** the regulated block — Brazil puts it
  *"imediatamente após a divisão IX"*, Poland at position 31 of 32. Both are the same shape.

## Width: `columns`, from a capability profile — the `58|80` enum is WRONG
The folklore "58 = 32 chars, 80 = 42 or 48" is wrong, and 42-vs-48 is a **resolution**
difference, not a font one. From the machine-readable capability DB, Font A columns:

| printer | dots | Font A cols |
|---|---|---|
| POS-5890 (58 mm) | 384 | 32 |
| TM-T88 (180 dpi) | 512 | 42 |
| **TH230 (80 mm)** | 576 | **44** |
| TM-P80 / TSP600 | 576 | 42 |
| TM-T20II | 576 | **48** |

**Three different column counts among 576-dot 80 mm printers.** `columns = dots ÷
cell_dots` (Font A = 12, Font B = 9). `03 §7`'s layer-3 "paper width" enum silently
truncates **4 characters per line on a TH230** — and the right-hand column is the price.

**Build-time law: every DocumentSpec must render correctly at `columns = 32`.**
Degradation ladder per block (Star's semantics, reimplemented — their runtime is
Star-hardware-only): full → declared `short` form → omit label keep number → wrap to two
rows. **Ban absolute dot positioning** (Epson's own XML has `x="384"`, mid-line at 576
dots and off-paper at 384) and **ban space-as-layout** (Star: *"This specification is so
intentional"*).

## Urdu on character-mode ESC/POS is ARCHITECTURALLY IMPOSSIBLE
Two independent failures: **no contextual shaping** (the ROM font renders each byte as an
isolated glyph — no joins, no ligatures) and **no bidi reordering** (glyphs emit
left-to-right in byte order). Field report on a real Epson, open since 2024: *"It printed
the text reversed… and **each character separated from the other**."* python-escpos has
had this open since 2015; escpos-php has six open Arabic issues. Both library authors
independently recommend printing text as an image.

Incidental corroboration of **27-F22** (Western digits): escpos-php reports Arabic-Indic
numerals render as **placeholder characters** on real hardware.

## Do NOT use the native ESC/POS QR command — rasterize
python-escpos defaults to raster; ReceiptLine never emits `GS ( k` in any of its 20+
backends. The archetypal cheap 58 mm printer reports `"qrCode": false` — **and the failure
is silent**: *"the QR code will simply not be printed, or the raw data will be printed
instead, depending on the model."* For a legally-mandated QR whose absence can seal the
premises, a silent no-op is the worst possible failure mode.

**QR size — FBR contradicts itself.** SRO 1006 and the SRB mirror say **7×7 mm**; FBR's own
Digital Invoicing spec asks **0.70–1.0 inch at QR version 2.0**, roughly 2.5× larger. Treat
7 mm as a floor and **render 18–25 mm**. Treat the fiscal invoice number as an **opaque
token** — FBR's own three documents give 18 digits, 22 digits, and a third form.

## The KOT should NOT be owner-customisable in v1 (researcher's recommendation)
1. **The person configuring is definitionally not the person reading.** An owner in a back
   office at 2 pm optimises for paper cost and tidiness; the cook at 9 pm pays.
2. **Simphony has NO price option anywhere in its order-device configuration** — prices are
   simply not part of the kitchen-chit data model. Stronger evidence for "no money on a
   KOT" than any article.
3. **The tradeoff is not intuitable**, and the deepest vendor in the market says so in its
   own option text: single-wide *"supports longer menu item names, **but has the drawback
   of not being as readable from a distance**."*
4. **Demand is genuinely bidirectional** — Square's own community has merchants demanding
   both larger and smaller kitchen fonts, both correct, because one prints chits and one
   prints cup labels. A knob resolves this wrongly for one of them forever; a **document
   type** resolves it correctly for both.

What the owner *does* get on the KOT: routing, course grouping, station map, copy count
(all already specified), plus a branch-name line and `max_lines_per_chit` as declarative
pagination (a template cannot know output length; Simphony exposes 0–99).

**Long item names are a CATALOG problem, not a template problem** — add `kitchen_name`
(short form) to the catalog, editable in back office. The single most-requested workaround
in Square's community.

## There is NO human-factors literature on kitchen-ticket typography
Not academic, not industrial, not a standard — established by exhaustive search. This
**confirms 27-F11h by absence**: the thermal legibility problem really is unsolved, and
what exists in the market is vendor defaults plus multi-year unresolved user complaints.

## Traps worth carrying forward
`58|80` enum → silent price truncation · absolute dot positioning · space-as-layout ·
native `GS ( k` for a legal QR · **per-field Urdu rasterization breaks the `name | price`
column grid, the one row whose alignment carries meaning** · NV logos in printer flash
(cannot reflow, cannot be revoked) · uncapped free text pushing the fiscal block onto a
second sheet · validating only at save · comparing profile version to **app** version
(WooCommerce shipped exactly this bug) · exposing KOT font size · **letting render depend
on the host platform** (Square: same order, iPad and Register produce different tickets) ·
adding a logo without measuring print time (*"the time it takes to print depends on the
number of images"* — directly against `03-N1`'s 2 s budget) · no reprint marker on the
receipt (Kenya requires a COPY watermark and "THIS IS NOT AN OFFICIAL RECEIPT" at twice the
amount text's size).

## Corpus contradictions found
- **C1** `18 §10` says the bitmap path is *"for logos and QR codes only"*; `03-F8` and
  `00 §5.6` say non-Latin user content rasterises per field. **Both cannot be true, and 18
  is the one that is factually wrong** — the second script is not hypothetical, it is in
  every customer name today.
- **C2 Nothing owns print templates.** 03 owns the service, 14 the config surface, 02 §7
  grants header/footer without saying where it is defined, 16 §7 says *"within the doc 03
  template bounds"* — bounds that do not exist. A genuine routing-table gap.

## Open
Whole-document raster vs `03-N1`'s 2 s budget is **unmeasured** — everything about render
mode is contingent on rig measurement, do not specify before measuring · Punjab has **no
findable gazetted print-elements notification** (the QR requirement comes from a technical
spec FAQ, not law) · character caps must be determined empirically because **no vendor
documents them** · whether Urdu on a KOT helps a non-reading cook at all is untested, and
the honest answer may be that no script solves it.
